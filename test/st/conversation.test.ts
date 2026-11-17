import { expect, it } from "vitest";
import {
  sessionLifecycleSnapshotSchema,
  zcodeSkillsReferenceCatalogResultSchema,
} from "@zcode/shared";
import {
  conversationSnapshotSchema,
  v4ConversationPlansResultSchema,
  v4ConversationRowsRangeResultSchema,
} from "@zcode/shared/zcode-protocol-v4";
import { connectST, unique, waitUntil } from "./client.js";
import { createProposal } from "./business.js";
import { openNative, requireAccepted, requireRejected } from "./native.js";

// conversation.md：接纳不是完成；同命令身份重试不能重复生成输入；重连只读不重发。
it("native send completes with canonical rows, query receipt and real owned frames", async () => {
  const c = await connectST();
  let native: Awaited<ReturnType<typeof openNative>> | undefined;
  try {
    const proposal = await createProposal(c);
    native = await openNative(c, proposal.remote);
    const catalogTarget = { ...native.workspace, sessionId: native.sessionId };
    const initialCatalog = zcodeSkillsReferenceCatalogResultSchema.parse(
      await c.services.zcodeAgentService.getSkillReferenceCatalog(catalogTarget),
    );
    const workspaceCatalog = zcodeSkillsReferenceCatalogResultSchema.parse(
      await c.services.zcodeAgentService.getSkillReferenceCatalog(native.workspace),
    );
    expect(workspaceCatalog.authority).toBe("workspace");
    // 新会话使用初始化时可用的目录，不能用固定空数组伪装 session authority。
    const availableSkills = await c.call("skillDesign.listSkills", [
      native.workspace.workspacePath,
    ]);
    const expectedSkills = availableSkills
      .filter((skill) => skill.enabled)
      .map(({ id, name, description, path, scope, pluginName }) => ({
        id,
        name,
        description,
        path,
        scope,
        enabled: true,
        ...(pluginName ? { pluginName } : {}),
      }));
    expect(workspaceCatalog.skills).toEqual(expect.arrayContaining(expectedSkills));
    expect(workspaceCatalog.skills).toHaveLength(expectedSkills.length);
    expect(initialCatalog.authority).toBe("session");
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
    const id = unique("discussion");
    const text = "请澄清需求边界、使用者及验收标准，生成本阶段业务需求材料。";
    const ack = await native.send(
      "sendText",
      { text, mode: "build", planEnabled: false },
      { commandId: id },
    );
    requireAccepted(ack);
    const final = await native.waitIdle();
    expect(final.control.phase).toBe("completedSuccess");
    const rows = await c.services.zcodeAgentService.conversationRowsRangeV4({
      ...native.workspace,
      sessionId: native.sessionId,
      limit: 200,
    });
    v4ConversationRowsRangeResultSchema.parse(rows);
    const inputs = rows.rows.filter(
      (row) => row.kind === "userInput" && row.sourceCommandId === id,
    );
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ text, clientId: c.identity.clientId });
    expect(
      rows.rows.some(
        (row) => row.kind === "assistantText" && row.state === "complete" && row.text.trim(),
      ),
    ).toBe(true);
    const receipt = await c.services.zcodeAgentService.queryConversationCommandsV4({
      ...native.workspace,
      commands: [{ sessionId: native.sessionId, commandId: id }],
    });
    expect(receipt.results).toHaveLength(1);
    expect(receipt.results[0]?.key).toEqual({ sessionId: native.sessionId, commandId: id });
    expect(receipt.results[0]?.result).toMatchObject({
      commandId: id,
      status: expect.stringMatching(/^(accepted|duplicate)$/),
    });
    const plans = v4ConversationPlansResultSchema.parse(
      await c.services.zcodeAgentService.conversationPlansV4({
        ...native.workspace,
        sessionId: native.sessionId,
      }),
    );
    expect(plans.atLogEpoch).toBe(rows.atLogEpoch);
    expect(
      native.frames.some(
        (frame) => frame.subscriptionId === native!.subscriptionId && frame.toSeq > 0,
      ),
    ).toBe(true);
    conversationSnapshotSchema.parse(final);
    expect(
      typeof (await c.services.zcodeAgentService.supportsConversationQuoteComment?.(
        native.workspace,
      )),
    ).toBe("boolean");
    const catalog = await c.services.zcodeAgentService.getSkillReferenceCatalog({
      ...native.workspace,
      sessionId: native.sessionId,
    });
    zcodeSkillsReferenceCatalogResultSchema.parse(catalog);
    expect(catalog.authority).toBe("session");
    expect(catalog).toEqual(initialCatalog);
    const lifecycle = await c.services.zcodeAgentService.getSessionLifecycle({
      ...native.workspace,
      sessionId: native.sessionId,
    });
    expect(sessionLifecycleSnapshotSchema.parse(lifecycle).sessionId).toBe(native.sessionId);
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
    const proposal = await createProposal(c);
    native = await openNative(c, proposal.remote);
    const commandId = unique("idempotent-input");
    const payload = {
      text: "需求：用户可以查看需求进度，并区分人工验收与分析结论。",
      mode: "build",
      planEnabled: false,
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
    const decision = await c.services.zcodeAgentService.queryConversationCommandsV4({
      ...native.workspace,
      commands: [{ sessionId: native.sessionId, commandId }],
    });
    expect(decision.results).toEqual([
      expect.objectContaining({
        key: { sessionId: native.sessionId, commandId },
        result: originalAck,
      }),
    ]);
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

it("feedback is bound to the current row epoch and stale revisions cannot change its fact", async () => {
  const c = await connectST();
  let native: Awaited<ReturnType<typeof openNative>> | undefined;
  try {
    native = await openNative(c, (await createProposal(c)).remote);
    requireAccepted(
      await native.send("sendText", { text: "请整理当前需求目标与验收标准。", mode: "build" }),
    );
    const final = await native.waitIdle();
    const assistant = final.rows.window.findLast(
      (row) => row.kind === "assistantText" && row.state === "complete",
    );
    if (!assistant?.entityId)
      throw new Error(
        "ST prerequisite blocked: no completed assistant row with entity identity for feedback",
      );
    const target = { rowId: assistant.rowId, entityId: assistant.entityId };
    requireAccepted(await native.send("setAssistantFeedback", { feedback: "like" }, { target }));
    const liked = await native.snapshot();
    expect(liked.rows.window.find((row) => row.rowId === target.rowId)).toMatchObject({
      feedback: "like",
    });
    requireRejected(
      await native.send(
        "setAssistantFeedback",
        { feedback: "dislike" },
        { target, baseRevision: 0, baseLogEpoch: unique("wrong-epoch") },
      ),
    );
    expect(
      (await native.snapshot()).rows.window.find((row) => row.rowId === target.rowId),
    ).toMatchObject({ feedback: "like" });
  } finally {
    try {
      await native?.close();
    } finally {
      await c.close();
    }
  }
});

it("another connection cannot resync or revoke an owned subscription; reconnect reads without replay", async () => {
  const a = await connectST();
  let b: Awaited<ReturnType<typeof connectST>> | undefined;
  let reconnected: Awaited<ReturnType<typeof connectST>> | undefined;
  let first: Awaited<ReturnType<typeof openNative>> | undefined;
  let second: Awaited<ReturnType<typeof openNative>> | undefined;
  const failures: unknown[] = [];
  try {
    b = await connectST(a.identity.employeeId);
    const proposal = await createProposal(a);
    first = await openNative(a, proposal.remote);
    second = await openNative(b, proposal.remote);
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
    requireAccepted(
      await first.send(
        "sendText",
        { text: "需求：共享需求讨论应允许其他参与人读取。", mode: "build" },
        { commandId },
      ),
    );
    await first.waitIdle();
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
    const oldId = second.subscriptionId;
    await second.close();
    second = undefined;
    await b.close();
    reconnected = await connectST(a.identity.employeeId);
    second = await openNative(reconnected, proposal.remote);
    expect(second.subscriptionId).not.toBe(oldId);
    await expect(
      reconnected.services.zcodeAgentService.resyncConversationV4({
        ...second.workspace,
        subscriptionId: oldId,
        base: null,
        forceSnapshot: true,
      }),
    ).rejects.toThrow();
    expect(
      (await second.snapshot()).rows.window.filter(
        (row) => row.kind === "userInput" && row.sourceCommandId === commandId,
      ),
    ).toHaveLength(1);
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
