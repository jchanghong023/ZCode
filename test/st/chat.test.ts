import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { IAIReqService, IZCodeAgentService } from "@zcode/services";
import {
  PROTOCOL_V4_LIMITS,
  conversationTopicWireFrameSchema,
  measureTopicNotificationEnvelopeBytes,
  webCommandAckSchema,
  type CommandKey,
  type ConversationTopicWireFrame,
  type ModelSelection,
} from "@zcode/shared/zcode-protocol-v4";
import { createProposal } from "./business.js";
import {
  connectChatST,
  connectST,
  expectRetiredAgentRpc,
  expectRpcUnavailable,
  unique,
  waitUntil,
} from "./client.js";
import { config } from "./config.js";
import {
  expectNativeLocalCommands,
  expectNativeSkillInput,
  expectNativeTurnWork,
  expectRetiredConversationCommands,
  initializeNative,
  openNative,
  openNativeSession,
  readNativeCommandCatalog,
  requireAccepted,
  requireRejected,
  type NativeSession,
} from "./native.js";

type ChatClient = Awaited<ReturnType<typeof connectChatST>>;

function chatCreateRequest(
  client: ChatClient,
  workspacePath: string,
  text?: string,
  modelSelection?: ModelSelection,
) {
  return {
    workspacePath,
    envelope: {
      sessionId: null,
      commandId: unique("chat-create"),
      clientId: client.clientId,
      issuedAt: Date.now(),
      type: "createSession" as const,
      payload: {
        ...(text ? { firstInput: { text } } : {}),
        ...(modelSelection ? { config: { modelSelection } } : {}),
      },
    },
  };
}

async function createChatSession(
  client: ChatClient,
  workspacePath: string,
  text?: string,
  modelSelection?: ModelSelection,
) {
  const ack = webCommandAckSchema
    .strict()
    .parse(
      await client.services.zcodeAgentService.sendConversationCommandV4(
        chatCreateRequest(client, workspacePath, text, modelSelection),
      ),
    );
  requireAccepted(ack);
  if (ack.result?.type !== "createSession") throw new Error("ST 未收到创建会话结果");
  return { workspacePath, sessionId: ack.result.sessionId };
}

it("recovers anonymous first-send and session receipts on reconnect without re-sending", async () => {
  const client = await connectChatST();
  let native: NativeSession | undefined;
  let reconnected: ChatClient | undefined;
  let other: ChatClient | undefined;
  try {
    const service = client.services.zcodeAgentService;
    await initializeNative(service, client.clientId);
    const workspacePath = ".";
    const draftCatalog = await readNativeCommandCatalog(service, { workspacePath });
    const skill = draftCatalog.find(({ source }) => source === "skill");
    expect(skill?.name).toMatch(/^skill:/);
    expect(draftCatalog.some(({ source }) => source === "builtin")).toBe(false);

    const recentBefore = await service.listRecentChatSessions();
    requireRejected(
      webCommandAckSchema
        .strict()
        .parse(
          await service.sendConversationCommandV4(
            chatCreateRequest(client, workspacePath, `/skill:${unique("unknown-first")}`),
          ),
        ),
    );
    expect(await service.listRecentChatSessions()).toEqual(recentBefore);

    const firstText = `/${skill!.name} 核对浏览器使用说明`;
    const request = chatCreateRequest(client, workspacePath, firstText);
    const createAck = webCommandAckSchema
      .strict()
      .parse(await service.sendConversationCommandV4(request));
    requireAccepted(createAck);
    if (createAck.result?.type !== "createSession") throw new Error("ST 未收到创建会话回执");
    const { sessionId } = createAck.result;
    const target = { workspacePath, sessionId };
    native = await openNativeSession(service, client.clientId, sessionId, target);
    expect((await native.waitIdle()).control.phase).toBe("completedSuccess");
    const secondText = unique("chat-receipt");
    const secondId = unique("chat-continue");
    const sendAck = await native.send("sendText", { text: secondText }, { commandId: secondId });
    requireAccepted(sendAck);
    expectNativeTurnWork(native, await native.waitIdle(), secondId);
    await native.close();
    native = undefined;
    await client.close();

    reconnected = await connectChatST(client.clientId);
    const resumed = reconnected.services.zcodeAgentService;
    await initializeNative(resumed, reconnected.clientId);
    const firstKey = { sessionId: null, commandId: request.envelope.commandId };
    const directoryRequest = chatCreateRequest(reconnected, "docs", "核对另一个工作目录的回执");
    const directoryAck = webCommandAckSchema
      .strict()
      .parse(await resumed.sendConversationCommandV4(directoryRequest));
    requireAccepted(directoryAck);
    const directoryKey = { sessionId: null, commandId: directoryRequest.envelope.commandId };
    expect(
      await resumed.queryConversationCommandsV4({
        workspacePath: directoryRequest.workspacePath,
        commands: [directoryKey, firstKey],
      }),
    ).toStrictEqual({
      results: [
        { key: directoryKey, result: directoryAck },
        { key: firstKey, result: "unknown" },
      ],
    });
    const secondKey = { sessionId, commandId: secondId };
    const wrongBucket = { sessionId, commandId: request.envelope.commandId };
    const commands: CommandKey[] = [firstKey, secondKey, wrongBucket];
    expect(await resumed.queryConversationCommandsV4({ workspacePath, commands })).toStrictEqual({
      results: [
        { key: firstKey, result: createAck },
        { key: secondKey, result: sendAck },
        { key: wrongBucket, result: "unknown" },
      ],
    });
    for (const extra of [{ clock: true }, { remoteSessionId: sessionId }]) {
      expect(
        await reconnected.probeRpc(
          "call",
          IZCodeAgentService.channelName,
          "queryConversationCommandsV4",
          [{ workspacePath, commands: [firstKey], ...extra }],
        ),
      ).toMatchObject({ code: "INVALID_ARGUMENT" });
    }
    const rows = await resumed.conversationRowsRangeV4({ ...target, limit: 60 });
    const inputs = rows.rows.filter((row) => row.kind === "userInput");
    expect(inputs).toEqual([
      expect.objectContaining({
        text: firstText,
        clientId: client.clientId,
        sourceCommandId: firstKey.commandId,
      }),
      expect.objectContaining({
        text: secondText,
        clientId: client.clientId,
        sourceCommandId: secondId,
      }),
    ]);
    for (const input of inputs) {
      const turnRows = rows.rows.filter((row) => row.turnId === input.turnId);
      expect(turnRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "turnHeader",
            sourceCommandId: input.sourceCommandId,
            state: "completedSuccess",
          }),
          expect.objectContaining({
            kind: "assistantText",
            state: "complete",
            text: expect.stringMatching(/\S/),
          }),
        ]),
      );
    }
    const catalog = await readNativeCommandCatalog(resumed, target);
    expect(catalog).toContainEqual(skill);
    native = await openNativeSession(resumed, reconnected.clientId, sessionId, target);
    const title = await expectNativeLocalCommands(native, catalog);
    expect(
      (await resumed.listRecentChatSessions()).flatMap((group) => group.sessions),
    ).toContainEqual(expect.objectContaining({ sessionId, title }));
    await expectNativeSkillInput(native, client.clientId, catalog);

    other = await connectChatST();
    const otherService = other.services.zcodeAgentService;
    await initializeNative(otherService, other.clientId);
    for (const key of [firstKey, secondKey]) {
      const read = await otherService
        .queryConversationCommandsV4({ workspacePath, commands: [key] })
        .then(
          (value) => ({ status: "read" as const, value }),
          (error: unknown) => ({ status: "rejected" as const, error }),
        );
      if (read.status === "rejected") {
        expect(read.error).toBeInstanceOf(Error);
      } else {
        expect(read.value).toStrictEqual({ results: [{ key, result: "unknown" }] });
      }
    }
    expect(await readNativeCommandCatalog(otherService, target)).toContainEqual(skill);
  } finally {
    try {
      await native?.close();
    } finally {
      await Promise.all([client.close(), reconnected?.close(), other?.close()]);
    }
  }
});

it("rejects retired RPC members and commands without changing anonymous chat", async () => {
  const client = await connectChatST();
  let native: NativeSession | undefined;
  try {
    const service = client.services.zcodeAgentService;
    await initializeNative(service, client.clientId);
    const target = await createChatSession(client, ".", "请整理讨论目标。");
    native = await openNativeSession(service, client.clientId, target.sessionId, target);
    await expectRetiredAgentRpc(client.probeRpc, target);
    const before = await native.waitIdle();
    expect(
      (await service.listRecentChatSessions()).flatMap(({ sessions }) => sessions),
    ).toContainEqual(expect.objectContaining({ sessionId: target.sessionId }));
    await expectRetiredConversationCommands(native, before);
    expect(
      (await service.listRecentChatSessions()).flatMap(({ sessions }) => sessions),
    ).toContainEqual(expect.objectContaining({ sessionId: target.sessionId }));
  } finally {
    try {
      await native?.close();
    } finally {
      await client.close();
    }
  }
});

it("uses the draft model on first send and keeps a switched model in native history", async () => {
  const client = await connectChatST();
  try {
    const agent = client.services.zcodeAgentService;
    await initializeNative(agent, client.clientId);
    const catalog = await client.services.modelSelectionService.getView();
    const provider = catalog.providers.find((item) => item.models.length >= 2)!;
    const first = provider.models.find(
      (model) => model.modelId !== catalog.effectiveSelection?.modelId,
    )!;
    const second = provider.models.find((model) => model.modelId !== first.modelId)!;
    const target = await createChatSession(client, ".", "首轮选用草稿模型", {
      providerId: provider.providerId,
      modelId: first.modelId,
    });
    const native = await openNativeSession(agent, client.clientId, target.sessionId, target);
    try {
      const initial = await native.waitIdle();
      expect(initial.config.modelSelection?.modelId).toBe(first.modelId);
      requireAccepted(
        await native.send("switchModelConfig", {
          provider: provider.providerId,
          model: second.modelId,
          thought: second.config.optionSpecs.reasoningLevel!.values[0],
        }),
      );
      requireAccepted(await native.send("sendText", { text: "切换后继续会话" }));
      await native.waitIdle();
    } finally {
      await native.close();
    }
    const reopened = await openNativeSession(agent, client.clientId, target.sessionId, target);
    try {
      const history = await reopened.snapshot();
      expect(history.config.modelSelection).toMatchObject({
        modelId: second.modelId,
        options: { reasoningLevel: second.config.optionSpecs.reasoningLevel!.values[0] },
      });
      expect(
        history.rows.window.filter((row) => row.kind === "assistantText").map((row) => row.model),
      ).toEqual([first.modelId, second.modelId]);
    } finally {
      await reopened.close();
    }
  } finally {
    await client.close();
  }
});

async function completeChatSession(client: ChatClient, directory: string, text: string) {
  const target = await createChatSession(client, directory, text);
  const native = await openNativeSession(
    client.services.zcodeAgentService,
    client.clientId,
    target.sessionId,
    target,
  );
  try {
    expect((await native.waitIdle()).control.phase).toBe("completedSuccess");
  } finally {
    await native.close();
  }
  return target;
}

it("shares live chat across anonymous connections and isolates AIReq histories in both directions", async () => {
  const chat = await connectChatST();
  const aiReq = await connectST();
  const other = await connectChatST();
  try {
    const service = chat.services.zcodeAgentService;
    await initializeNative(service, chat.clientId);
    const otherService = other.services.zcodeAgentService;
    await initializeNative(otherService, other.clientId);
    const [initialGroups, simultaneous] = await Promise.all([
      service.listRecentChatSessions(),
      otherService.listRecentChatSessions(),
    ]);
    expect(simultaneous).toEqual(initialGroups);
    const message = unique("standalone-chat");
    const target = await createChatSession(chat, ".");
    const native = await openNativeSession(service, chat.clientId, target.sessionId, target);
    try {
      const commandId = unique("chat-work");
      requireAccepted(await native.send("sendText", { text: message }, { commandId }));
      const final = await native.waitIdle();
      expectNativeTurnWork(native, final, commandId);
      expect(final.availability.sendQueuedNow.allowed).toBe(false);
      expect(
        native.frames.some(
          (frame) =>
            frame.payload.kind === "deltas" &&
            frame.payload.deltas.some(
              (delta) =>
                delta.op === "state.updated" &&
                delta.patch.control?.phase === "running" &&
                delta.patch.control.canStop &&
                delta.patch.inputRouting?.mode === "streamingChoice",
            ),
        ),
      ).toBe(true);
      const stopId = unique("chat-stop-target");
      const [started, running] = await Promise.all([
        native.send("sendText", { text: "请开始一轮可停止的工作。" }, { commandId: stopId }),
        native.snapshot(),
      ]);
      requireAccepted(started);
      const expectedForegroundExecutionId = running.control.activeWorks.find(
        (work) => work.sourceCommandId === stopId,
      )?.foregroundExecutionId;
      expect(expectedForegroundExecutionId).toEqual(expect.any(String));
      requireAccepted(await native.send("stop", { expectedForegroundExecutionId }));
      expect((await native.waitIdle()).control.phase).toBe("completedInterrupted");

      const otherGroups = await otherService.listRecentChatSessions();
      expect(otherGroups).toEqual(await service.listRecentChatSessions());
      expect(otherGroups[0]?.sessions[0]?.sessionId).toBe(target.sessionId);
      const peer = await openNativeSession(otherService, other.clientId, target.sessionId, target);
      try {
        expect((await peer.snapshot()).rows.window).toContainEqual(
          expect.objectContaining({ kind: "userInput", text: message, clientId: chat.clientId }),
        );
        const firstText = unique("chat-client-a");
        const secondText = unique("chat-client-b");
        const aStart = native.frames.length;
        const bStart = peer.frames.length;
        const results = await Promise.all([
          native.send("sendText", { text: firstText }),
          peer.send("sendText", { text: secondText }),
        ]);
        for (const ack of results) requireAccepted(ack);
        expect(
          results.map(({ result }) => result?.type === "inputAccepted" && result.delivery).sort(),
        ).toEqual(["queue", "startNow"]);
        const observed = (pane: NativeSession, start: number, text: string, clientId: string) =>
          pane.frames
            .slice(start)
            .some(
              (frame) =>
                frame.payload.kind === "deltas" &&
                frame.payload.deltas.some(
                  (delta) =>
                    delta.op === "row.appended" &&
                    delta.row.kind === "userInput" &&
                    delta.row.text === text &&
                    delta.row.clientId === clientId,
                ),
            );
        await waitUntil(
          "live peer input on both chat subscriptions",
          async () =>
            observed(native, aStart, secondText, other.clientId) &&
            observed(peer, bStart, firstText, chat.clientId),
          Boolean,
        );
        await peer.waitIdle();
      } finally {
        await peer.close();
      }
    } finally {
      await native.close();
    }
    const proposal = await createProposal(aiReq);
    const business = await openNative(aiReq, proposal.remote);
    try {
      await expect(
        service.conversationRowsRangeV4({
          ...business.workspace,
          sessionId: business.sessionId,
          limit: 60,
        }),
      ).rejects.toThrow();
      await expect(
        aiReq.services.zcodeAgentService.conversationRowsRangeV4({ ...target, limit: 60 }),
      ).rejects.toThrow();
      await expectRpcUnavailable(
        chat.probeRpc,
        "call",
        IAIReqService.channelName,
        "bootstrap",
        [aiReq.identity],
        true,
      );
      expect(
        (await service.listRecentChatSessions()).flatMap(({ sessions }) => sessions),
      ).not.toContainEqual(expect.objectContaining({ sessionId: business.sessionId }));
    } finally {
      await business.close();
    }

    const reconnected = await connectChatST(other.clientId);
    try {
      await initializeNative(reconnected.services.zcodeAgentService, reconnected.clientId);
      const rows = await reconnected.services.zcodeAgentService.conversationRowsRangeV4({
        ...target,
        limit: 60,
      });
      expect(rows.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "userInput", text: message }),
          expect.objectContaining({ kind: "assistantText", state: "complete" }),
        ]),
      );
    } finally {
      await reconnected.close();
    }
  } finally {
    await Promise.all([chat.close(), aiReq.close(), other.close()]);
  }
});

// 排名依赖每轮开始与完成的活动时间，13 轮串行执行需要超过全局默认的 120 秒。
it(
  "lists the five most active directories and five most active sessions per directory",
  {
    timeout: process.env.ST_TIMEOUT_MS ? config.timeoutMs : 180_000,
  },
  async () => {
    const client = await connectChatST();
    const service = client.services.zcodeAgentService;
    try {
      await initializeNative(service, client.clientId);
      const [primary, ...otherDirectories] = [
        "docs",
        "packages",
        "test",
        "scripts",
        "patches",
        "config",
      ];
      const primarySessions = [];
      for (let index = 0; index < 6; index++) {
        // 两种路径指向同一目录，列表按目录事实归组。
        primarySessions.push(
          await completeChatSession(
            client,
            index === 0 ? `./${primary}` : primary!,
            `最近会话 ${index}`,
          ),
        );
      }
      for (const directory of otherDirectories)
        await completeChatSession(client, directory, `目录 ${directory}`);
      await createChatSession(client, ".");
      expect(
        await client.probeRpc("call", IZCodeAgentService.channelName, "listRecentChatSessions", [
          { limit: 1 },
        ]),
      ).toMatchObject({ code: "INVALID_ARGUMENT" });
      const before = await service.listRecentChatSessions();
      expect(before.map(({ sessions }) => sessions[0].workspacePath)).toEqual(
        [...otherDirectories].reverse(),
      );

      const oldest = primarySessions[0]!;
      const native = await openNativeSession(service, client.clientId, oldest.sessionId, oldest);
      try {
        requireAccepted(await native.send("sendText", { text: "继续较早的会话" }));
        await native.waitIdle();
      } finally {
        await native.close();
      }
      const after = await service.listRecentChatSessions();
      expect(after.map(({ sessions }) => sessions[0].workspacePath)).toEqual([
        oldest.workspacePath,
        ...[...otherDirectories].reverse().slice(0, 4),
      ]);
      for (const group of after) expect(group).not.toHaveProperty("workspacePath");
      expect(after[0]?.sessions.map((item) => item.sessionId)).toEqual([
        oldest.sessionId,
        ...primarySessions
          .slice(2)
          .reverse()
          .map((item) => item.sessionId),
      ]);
    } finally {
      await client.close();
    }
  },
);

it("groups an absolute directory with its examples and safely rejects invalid paths", async () => {
  const client = await connectChatST();
  const service = client.services.zcodeAgentService;
  try {
    await initializeNative(service, client.clientId);
    const seeded = await service.listRecentChatSessions();
    const expectedError = "工作目录不可用，请输入服务端工作目录根下已有的目录。";
    const invalidPaths = [unique("missing-directory"), "../", "package.json"];
    for (const path of invalidPaths)
      await expect(createChatSession(client, path, "不能接纳")).rejects.toThrow(expectedError);
    expect(await service.listRecentChatSessions()).toEqual(seeded);

    const root =
      process.env["ZCODE_SERVER_WORKSPACE"]?.trim() ||
      fileURLToPath(new URL("../../", import.meta.url));
    const absolute = await completeChatSession(client, resolve(root, "docs"), "绝对目录会话");
    const relative = await completeChatSession(client, "./docs", "相对目录会话");
    const after = await service.listRecentChatSessions();
    expect(after[0]?.sessions.slice(0, 2).map((item) => item.sessionId)).toEqual([
      relative.sessionId,
      absolute.sessionId,
    ]);
  } finally {
    await client.close();
  }
});

async function sendAndWaitChatTurn(native: NativeSession, text: string): Promise<void> {
  const start = native.frames.length;
  requireAccepted(await native.send("sendText", { text }));
  await waitUntil(
    "online chat turn completion",
    async () =>
      native.frames
        .slice(start)
        .some(
          (frame) =>
            frame.subscriptionId === native.subscriptionId &&
            frame.payload.kind === "deltas" &&
            frame.payload.deltas.some(
              (delta) =>
                delta.op === "state.updated" && delta.patch.control?.phase === "completedSuccess",
            ),
        ),
    Boolean,
  );
}

function expectFragmentedDelivery(
  frames: ConversationTopicWireFrame[],
  deliveryKind: ConversationTopicWireFrame["deliveryKind"],
) {
  const fragments = frames
    .filter((frame) => frame.kind === "fragment")
    .filter((frame) => frame.deliveryKind === deliveryKind);
  expect(fragments.length).toBeGreaterThan(1);
  const first = fragments[0];
  if (!first) throw new Error("ST 缺少分片帧");
  expect(first.fragmentCount).toBe(fragments.length);
  expect(fragments.map((frame) => frame.fragmentIndex)).toEqual(
    Array.from({ length: first.fragmentCount }, (_, index) => index),
  );
  expect(fragments.every((frame) => frame.logicalFrameId === first.logicalFrameId)).toBe(true);
  expect(fragments.every((frame) => frame.logicalFrameOrdinal === first.logicalFrameOrdinal)).toBe(
    true,
  );
  for (const fragment of fragments)
    expect(measureTopicNotificationEnvelopeBytes(fragment).maxBytes).toBeLessThanOrEqual(
      PROTOCOL_V4_LIMITS.maxFrameBytes,
    );
}

it("fragments online and snapshot payloads without publishing snapshots to other subscriptions", async () => {
  const client = await connectChatST();
  const other = await connectChatST(client.clientId);
  const firstWires: unknown[] = [];
  const secondWires: unknown[] = [];
  let firstListener: { dispose(): void } | undefined;
  let secondListener: { dispose(): void } | undefined;
  let first: NativeSession | undefined;
  let second: NativeSession | undefined;
  try {
    const service = client.services.zcodeAgentService;
    await initializeNative(service, client.clientId);
    const target = await createChatSession(client, ".");
    const workspace = { workspacePath: target.workspacePath };
    firstListener = service.onDynamicConversationFrame(workspace)((frame) =>
      firstWires.push(frame),
    );
    first = await openNativeSession(service, client.clientId, target.sessionId, target);
    const text = '界🙂"\n'.repeat(120_000);
    await sendAndWaitChatTurn(first, text);

    const otherService = other.services.zcodeAgentService;
    await initializeNative(otherService, other.clientId);
    secondListener = otherService.onDynamicConversationFrame(workspace)((frame) =>
      secondWires.push(frame),
    );
    second = await openNativeSession(otherService, other.clientId, target.sessionId, target);
    const recovered = await second.snapshot();
    expect(recovered.rows.window.some((row) => row.kind === "userInput" && row.text === text)).toBe(
      true,
    );
    await sendAndWaitChatTurn(first, "确认其他订阅仍正常接收实时帧");

    const firstFrames = firstWires.map((frame) => conversationTopicWireFrameSchema.parse(frame));
    const secondFrames = secondWires.map((frame) => conversationTopicWireFrameSchema.parse(frame));
    expect(firstFrames.filter((frame) => frame.deliveryKind !== "online")).toEqual([
      expect.objectContaining({ deliveryKind: "initial", logicalFrameOrdinal: 1 }),
    ]);
    expect(firstFrames.every((frame) => frame.subscriptionId === first?.subscriptionId)).toBe(true);
    expect(secondFrames.every((frame) => frame.subscriptionId === second?.subscriptionId)).toBe(
      true,
    );
    for (const frames of [firstFrames, secondFrames]) {
      const ordinals = [...new Set(frames.map((frame) => frame.logicalFrameOrdinal))];
      expect(ordinals).toEqual(Array.from({ length: ordinals.length }, (_, index) => index + 1));
    }
    expectFragmentedDelivery(firstFrames, "online");
    expectFragmentedDelivery(secondFrames, "initial");
    expectFragmentedDelivery(secondFrames, "recovery");
  } finally {
    firstListener?.dispose();
    secondListener?.dispose();
    try {
      await Promise.all([first?.close(), second?.close()]);
    } finally {
      await Promise.all([client.close(), other.close()]);
    }
  }
});

it("keeps a byte-bounded recent snapshot and preserves earlier rows for pagination", async () => {
  const client = await connectChatST();
  const service = client.services.zcodeAgentService;
  let native: NativeSession | undefined;
  try {
    await initializeNative(service, client.clientId);
    const target = await createChatSession(client, ".");
    native = await openNativeSession(service, client.clientId, target.sessionId, target);
    const text = "界".repeat(1_200_000);
    for (let index = 0; index < 5; index += 1)
      await sendAndWaitChatTurn(native, `${index}\n${text}`);
    const oversized = await native.send("sendText", { text: "界".repeat(1_500_000) });
    expect(oversized).toMatchObject({ status: "rejected", reasonCode: "fault.chat.inputTooLarge" });

    const history = await native.snapshot();
    const firstVisible = history.rows.window[0]!.rowId;
    expect(firstVisible).toBeGreaterThan(0);
    expect(history.rows.firstRowId).toBe(0);
    expect(history.rows.totalCount).toBeGreaterThan(history.rows.window.length);
    expect(history.rows.window.at(-1)?.rowId).toBe(history.rows.totalCount - 1);
    const earlier = await service.conversationRowsRangeV4({
      ...target,
      beforeRowId: firstVisible,
      limit: 60,
    });
    expect(earlier.rows.at(-1)?.rowId).toBe(firstVisible - 1);
    expect(earlier.rows.some((row) => row.kind === "userInput" && row.text === `0\n${text}`)).toBe(
      true,
    );
  } finally {
    try {
      await native?.close();
    } finally {
      await client.close();
    }
  }
});
