import { expect, it } from "vitest";
import { zcodeSkillsReferenceCatalogResultSchema } from "@zcode/shared";
import {
  conversationSnapshotSchema,
  v4ConversationRowsRangeResultSchema,
  webCommandAckSchema,
} from "@zcode/shared/zcode-protocol-v4";
import { connectST, expectRetiredAgentRpc, unique, waitUntil } from "./client.js";
import { takeRequirement } from "./business.js";
import { getProposal } from "./proposal-flow.js";
import {
  expectNativeLocalCommands,
  expectNativeSkillInput,
  expectNativeTurnWork,
  expectRetiredConversationCommands,
  openNative,
  readNativeCommandCatalog,
  requireAccepted,
  requireRejected,
} from "./native.js";

const webSkillReferenceCatalogSchema = zcodeSkillsReferenceCatalogResultSchema.pick({
  skills: true,
});

// conversation.md：接纳不是完成；同命令身份重试不能重复生成输入；重连只读不重发。
it("native send completes with canonical rows, query receipt and real owned frames", async () => {
  const c = await connectST();
  let native: Awaited<ReturnType<typeof openNative>> | undefined;
  try {
    const requirement = await takeRequirement(c);
    native = await openNative(c, requirement.remote);
    const catalogTarget = { ...native.workspace, sessionId: native.sessionId };
    const initialCatalog = webSkillReferenceCatalogSchema.parse(
      await c.services.zcodeAgentService.getSkillReferenceCatalog(catalogTarget),
    );
    const workspaceCatalog = webSkillReferenceCatalogSchema.parse(
      await c.services.zcodeAgentService.getSkillReferenceCatalog(native.workspace),
    );
    // 新会话使用初始化时可用的目录，不能返回固定空数组。
    const { sessionId: skillSessionId } = await c.call("skillDesign.session", [
      requirement.projectId,
    ]);
    const availablePaths = await c.call("skillDesign.listSkills", [skillSessionId]);
    expect(availablePaths).not.toHaveLength(0);
    const catalogPaths = workspaceCatalog.skills.map(({ path }) => path);
    expect(catalogPaths).toEqual(expect.arrayContaining(availablePaths));
    expect(catalogPaths).toHaveLength(availablePaths.length);
    expect(initialCatalog.skills).toEqual(workspaceCatalog.skills);
    await expect(
      c.services.zcodeAgentService.getSkillReferenceCatalog({
        ...native.workspace,
        sessionId: unique("unknown-session"),
      }),
    ).rejects.toThrow();
    await expect(
      c.services.zcodeAgentService.getSkillReferenceCatalog({
        ...catalogTarget,
        workspaceIdentity: unique("wrong-workspace"),
      }),
    ).rejects.toThrow();
    const commands = await readNativeCommandCatalog(c.services.zcodeAgentService, catalogTarget);
    expect(
      commands
        .filter(({ source }) => source === "skill")
        .map(({ name }) => name)
        .sort(),
    ).toEqual(initialCatalog.skills.map(({ name }) => `skill:${name}`).sort());
    const proposalBefore = getProposal(requirement.remote, requirement);
    await expectNativeLocalCommands(native, commands);
    const afterLocalCommands = await c.read(requirement.selection);
    expect(getProposal(afterLocalCommands, requirement)).toEqual(proposalBefore);
    const id = unique("discussion");
    const text = "请澄清需求边界、使用者及验收标准，生成本阶段业务需求材料。";
    const service = c.services.zcodeAgentService;
    const ack = webCommandAckSchema.strict().parse(
      await service.sendConversationCommandV4({
        ...native.workspace,
        envelope: {
          sessionId: native.sessionId,
          commandId: id,
          clientId: c.identity.clientId,
          issuedAt: Date.now(),
          type: "sendText",
          payload: { text },
        },
      }),
    );
    requireAccepted(ack);
    const final = await native.waitIdle();
    expect(final.control.phase).toBe("completedSuccess");
    expectNativeTurnWork(native, final, id);
    const rows = await service.conversationRowsRangeV4({
      ...native.workspace,
      sessionId: native.sessionId,
      limit: 200,
    });
    v4ConversationRowsRangeResultSchema.omit({ atSeq: true }).strict().parse(rows);
    const inputs = rows.rows.filter(
      (row) => row.kind === "userInput" && row.sourceCommandId === id,
    );
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ text, clientId: c.identity.clientId });
    const turnId = inputs[0]!.turnId;
    expect(
      rows.rows.find((row) => row.kind === "turnHeader" && row.turnId === turnId),
    ).toMatchObject({ sourceCommandId: id, state: "completedSuccess" });
    expect(
      rows.rows.some(
        (row) =>
          row.turnId === turnId &&
          row.kind === "assistantText" &&
          row.state === "complete" &&
          row.text.trim(),
      ),
    ).toBe(true);
    const key = { sessionId: native.sessionId, commandId: id };
    expect(
      await service.queryConversationCommandsV4({
        ...native.workspace,
        commands: [key],
      }),
    ).toStrictEqual({ results: [{ key, result: ack }] });
    expect(
      native.frames.some(
        (frame) => frame.subscriptionId === native!.subscriptionId && frame.toSeq > 0,
      ),
    ).toBe(true);
    conversationSnapshotSchema.parse(final);
    const catalog = await c.services.zcodeAgentService.getSkillReferenceCatalog({
      ...native.workspace,
      sessionId: native.sessionId,
    });
    webSkillReferenceCatalogSchema.parse(catalog);
    expect(catalog).toEqual(initialCatalog);
    await expectNativeSkillInput(native, c.identity.clientId, commands);
  } finally {
    try {
      await native?.close();
    } finally {
      await c.close();
    }
  }
});

it("same command and input reuses its decision; replacing its text is rejected without another input", async () => {
  const c = await connectST();
  let native: Awaited<ReturnType<typeof openNative>> | undefined;
  try {
    const { remote } = await takeRequirement(c);
    native = await openNative(c, remote);
    const commandId = unique("idempotent-input");
    const payload = {
      text: "需求：用户可以查看需求进度，并区分人工验收与分析结论。",
    };
    const originalAck = await native.send("sendText", payload, { commandId });
    requireAccepted(originalAck);
    await native.waitIdle();
    const beforeConflict = await native.snapshot();
    expect(await native.send("sendText", payload, { commandId })).toEqual(originalAck);
    // 契约要求冲突输入被拒绝，但普通 RPC 允许 Promise rejection，不保证总能取得负向 ACK。
    // 两种拒绝形式都必须保留原决定和原消息，不能只捕获异常就视作通过。
    const conflict = await native
      .send("sendText", { ...payload, text: "替换同一命令的业务正文" }, { commandId })
      .then(
        (ack) => ({ kind: "ack" as const, ack }),
        (error: unknown) => ({ kind: "rpc-error" as const, error }),
      );
    if (conflict.kind === "ack") requireRejected(conflict.ack);
    else expect(conflict.error).toBeInstanceOf(Error);
    const afterConflict = await native.snapshot();
    expect(afterConflict.revision).toBe(beforeConflict.revision);
    expect(afterConflict.logEpoch).toBe(beforeConflict.logEpoch);
    expect(afterConflict.rows.window).toEqual(beforeConflict.rows.window);
    const key = { sessionId: native.sessionId, commandId };
    expect(
      await c.services.zcodeAgentService.queryConversationCommandsV4({
        ...native.workspace,
        commands: [key],
      }),
    ).toStrictEqual({ results: [{ key, result: originalAck }] });
    const rows = await c.services.zcodeAgentService.conversationRowsRangeV4({
      ...native.workspace,
      sessionId: native.sessionId,
      limit: 200,
    });
    expect(
      rows.rows.filter((row) => row.kind === "userInput" && row.sourceCommandId === commandId),
    ).toEqual([expect.objectContaining({ text: payload.text, sourceCommandId: commandId })]);
  } finally {
    try {
      await native?.close();
    } finally {
      await c.close();
    }
  }
});

it("rejects retired RPC members and commands without changing the business conversation", async () => {
  const c = await connectST();
  let native: Awaited<ReturnType<typeof openNative>> | undefined;
  try {
    // 拒绝命令使用本例实际生成的历史行作为目标，仍须占用写入夹具。
    native = await openNative(c, (await takeRequirement(c)).remote);
    await expectRetiredAgentRpc(c.probeRpc, { ...native.workspace, sessionId: native.sessionId });
    requireAccepted(await native.send("sendText", { text: "请整理当前需求目标与验收标准。" }));
    await expectRetiredConversationCommands(native, await native.waitIdle());
  } finally {
    try {
      await native?.close();
    } finally {
      await c.close();
    }
  }
});

it("another connection cannot resync or revoke an owned subscription; reconnect reads without replay", async () => {
  const pageId = crypto.randomUUID();
  const a = await connectST(undefined, undefined, pageId);
  let b: Awaited<ReturnType<typeof connectST>> | undefined;
  let reconnected: Awaited<ReturnType<typeof connectST>> | undefined;
  let first: Awaited<ReturnType<typeof openNative>> | undefined;
  let second: Awaited<ReturnType<typeof openNative>> | undefined;
  const failures: unknown[] = [];
  try {
    b = await connectST(a.identity.employeeId);
    const { remote } = await takeRequirement(a);
    first = await openNative(a, remote);
    second = await openNative(b, remote);
    await expect(
      b.services.zcodeAgentService.resyncConversationV4({
        ...first.workspace,
        subscriptionId: first.subscriptionId,
        base: null,
        forceSnapshot: true,
      }),
    ).rejects.toThrow();
    // Unknown ownership may reject or no-op; neither outcome may revoke A's live subscription.
    await b.services.zcodeAgentService
      .unsubscribeConversationV4({ ...first.workspace, subscriptionId: first.subscriptionId })
      .catch(() => undefined);
    const commandId = unique("before-reconnect");
    const text = "需求：共享需求讨论应允许其他参与人读取。";
    const ack = await first.send("sendText", { text }, { commandId });
    requireAccepted(ack);
    expectNativeTurnWork(first, await first.waitIdle(), commandId);
    const observed = await waitUntil(
      "shared canonical input",
      () => second!.snapshot(),
      (snapshot) =>
        snapshot.rows.window.some(
          (row) => row.kind === "userInput" && row.sourceCommandId === commandId,
        ),
    );
    expect(
      observed.rows.window.filter(
        (row) => row.kind === "userInput" && row.sourceCommandId === commandId,
      ),
    ).toHaveLength(1);
    const key = { sessionId: first.sessionId, commandId };
    expect(
      await b.services.zcodeAgentService.queryConversationCommandsV4({
        ...second.workspace,
        commands: [key],
      }),
    ).toStrictEqual({ results: [{ key, result: "unknown" }] });
    const oldId = second.subscriptionId;
    await second.close();
    second = undefined;
    await b.close();
    await first.close();
    first = undefined;
    await a.close();
    reconnected = await connectST(a.identity.employeeId, a.identity.clientId, pageId);
    second = await openNative(reconnected, remote);
    expect(second.subscriptionId).not.toBe(oldId);
    await expect(
      reconnected.services.zcodeAgentService.resyncConversationV4({
        ...second.workspace,
        subscriptionId: oldId,
        base: null,
        forceSnapshot: true,
      }),
    ).rejects.toThrow();
    const resumed = reconnected.services.zcodeAgentService;
    expect(
      await resumed.queryConversationCommandsV4({ ...second.workspace, commands: [key] }),
    ).toStrictEqual({ results: [{ key, result: ack }] });
    const history = await second.snapshot();
    const inputs = history.rows.window.filter(
      (row) => row.kind === "userInput" && row.sourceCommandId === commandId,
    );
    expect(inputs).toEqual([expect.objectContaining({ text, clientId: a.identity.clientId })]);
    expect(
      history.rows.window.find(
        (row) => row.kind === "turnHeader" && row.turnId === inputs[0]!.turnId,
      ),
    ).toMatchObject({ sourceCommandId: commandId, state: "completedSuccess" });
  } catch (error) {
    failures.push(error);
  } finally {
    // 退订依赖原连接上的 RPC；旧 Promise.all 会先关 socket，导致业务断言通过后清理却失败。
    // 订阅 owner 退订完成 → 连接 owner 关闭；失败路径也必须保持顺序，并保留断言与清理错误。
    const subscriptions = await Promise.allSettled([second?.close(), first?.close()]);
    const connections = await Promise.allSettled([reconnected?.close(), b?.close(), a.close()]);
    for (const result of [...subscriptions, ...connections])
      if (result.status === "rejected") failures.push(result.reason);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "重连断言或资源清理失败");
});
