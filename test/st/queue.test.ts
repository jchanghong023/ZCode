import { expect, it } from "vitest";
import type { ConversationSnapshot, QueueItem } from "@zcode/shared/zcode-protocol-v4";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { createProposal } from "./business.js";
import { openNative, requireAccepted, type NativeSession } from "./native.js";

// conversation.md：排队项保存自己的 Submission；stop 保留队列并暂停自动续跑。
async function queued(native: NativeSession, commandId: string): Promise<QueueItem> {
  const snapshot = await native.snapshot();
  const item = snapshot.queue.items.find((row) => row.sourceCommandId === commandId);
  if (!item || item.dispatch.state !== "queued") {
    throw new Error(
      "ST prerequisite blocked: public execution window did not retain a queued input",
    );
  }
  return item;
}
async function establishQueue(native: NativeSession, c: STClient) {
  const before = await native.snapshot();
  const modelSelection = before.config.modelSelection;
  if (!modelSelection)
    throw new Error("ST prerequisite blocked: no public model selection for Submission");
  requireAccepted(await native.send("setFollowupMode", { mode: "queue" }));
  // 先暂停续跑，避免前台完成后消耗刚接纳的排队项；运行窗口内只提交输入。
  // 逐项快照再发送存在 TOCTOU：读到 running 不代表下一次请求仍在运行。
  requireAccepted(await native.send("setAutoDrain", { autoDrain: false }));
  // 同一连接先按顺序发出首发及后续输入，再等待全部回执；不把首发 ACK 的网络往返当作运行窗口。
  const started = native.send("sendText", {
    text: "请逐项分析需求参与人、使用场景、数据权限、边界条件和验收标准，并整理业务需求材料。",
    modelSelection,
    mode: "build",
    planEnabled: false,
  });
  const ids = [unique("queued-a"), unique("queued-b"), unique("queued-c")];
  const texts = ids.map((id) => `补充需求 ${id}：验收结果需要可追溯。`);
  // sendText 不要求 CAS，三个独立输入可直接提交；仍以实际 ACK 和权威队列核验接纳。
  const admissions = await Promise.allSettled([
    started,
    ...ids.map((commandId, i) =>
      native.send(
        "sendText",
        {
          text: texts[i],
          requestedDelivery: "queue",
          modelSelection,
          mode: "build",
          planEnabled: true,
        },
        { commandId },
      ),
    ),
  ]);
  const failures = admissions.filter((result) => result.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "ST queue admission failed",
    );
  for (const [index, result] of admissions.entries()) {
    if (result.status !== "fulfilled") continue;
    requireAccepted(result.value);
    expect(result.value).toMatchObject({
      result: { type: "inputAccepted", delivery: index === 0 ? "startNow" : "queue" },
    });
  }
  const items = await Promise.all(ids.map((id) => queued(native, id)));
  expect(items.map((item) => item.text)).toEqual(texts);
  for (const item of items) {
    expect(item).toMatchObject({
      clientId: c.identity.clientId,
      modelSelection,
      mode: "build",
      planEnabled: true,
      attachments: [],
    });
  }
  return { ids, texts, items, modelSelection };
}
async function stopAndRead(native: NativeSession): Promise<ConversationSnapshot> {
  requireAccepted(await native.send("stop", {}));
  const stopped = await native.waitIdle();
  expect(stopped.queue.autoDrain).toBe(false);
  return stopped;
}

it("queued Submission keeps its own config; edits, locks, config application and ordering preserve unrelated content", async () => {
  const c = await connectST();
  let native: NativeSession | undefined;
  try {
    native = await openNative(c, (await createProposal(c)).remote);
    const setup = await establishQueue(native, c);
    const [first, second, third] = setup.items;
    if (!first || !second || !third) throw new Error("ST queue setup incomplete");
    await stopAndRead(native);
    const editorId = unique("editor");
    requireAccepted(
      await native.send("lockQueueItemEdit", { queueItemId: first.queueItemId, editorId }),
    );
    let snapshot = await native.snapshot();
    expect(
      snapshot.queue.items.find((item) => item.queueItemId === first.queueItemId)?.editLock,
    ).toMatchObject({ editorId, clientId: c.identity.clientId });
    const otherEditor = await native.send("lockQueueItemEdit", {
      queueItemId: first.queueItemId,
      editorId: unique("competing-editor"),
    });
    expect(otherEditor.status).not.toBe("accepted");
    expect(otherEditor.reasonCode).toBeTruthy();
    const forbidden = await native.send("editQueueItem", {
      queueItemId: first.queueItemId,
      editorId: unique("wrong-editor"),
      newText: "不得写入",
    });
    expect(forbidden.status).not.toBe("accepted");
    expect(
      (await native.snapshot()).queue.items.find((item) => item.queueItemId === first.queueItemId)
        ?.text,
    ).toBe(first.text);
    const revisedText = "修订需求：验收记录必须保留操作者。";
    requireAccepted(
      await native.send("editQueueItem", {
        queueItemId: first.queueItemId,
        editorId,
        newText: revisedText,
      }),
    );
    snapshot = await native.snapshot();
    expect(
      snapshot.queue.items.find((item) => item.queueItemId === first.queueItemId),
    ).toMatchObject({
      text: revisedText,
      modelSelection: setup.modelSelection,
      mode: "build",
      planEnabled: true,
      attachments: [],
    });
    expect(
      snapshot.queue.items.find((item) => item.queueItemId === first.queueItemId)?.editLock,
    ).toBeUndefined();
    // Configuration application cannot rewrite text, attachments or the queued Plan choice.
    requireAccepted(
      await native.send("lockQueueItemEdit", { queueItemId: second.queueItemId, editorId }),
    );
    const applied = await native.send("applyQueueItemsConfig", {
      queueItemIds: [first.queueItemId, second.queueItemId, third.queueItemId],
      mode: "edit",
    });
    requireAccepted(applied);
    snapshot = await native.snapshot();
    expect(
      snapshot.queue.items.find((item) => item.queueItemId === first.queueItemId),
    ).toMatchObject({ text: revisedText, mode: "edit", planEnabled: true, attachments: [] });
    expect(
      snapshot.queue.items.find((item) => item.queueItemId === third.queueItemId),
    ).toMatchObject({ text: third.text, mode: "edit", planEnabled: true, attachments: [] });
    expect(
      snapshot.queue.items.find((item) => item.queueItemId === second.queueItemId),
    ).toMatchObject({
      text: second.text,
      mode: "build",
      editLock: { editorId },
      planEnabled: true,
    });
    requireAccepted(await native.send("releaseQueueItemEdit", { queueItemId: second.queueItemId }));
    expect(
      (await native.snapshot()).queue.items.find((item) => item.queueItemId === second.queueItemId)
        ?.editLock,
    ).toBeUndefined();
    requireAccepted(
      await native.send("reorderQueueItem", {
        queueItemId: third.queueItemId,
        beforeQueueItemId: first.queueItemId,
      }),
    );
    expect((await native.snapshot()).queue.items.map((item) => item.queueItemId)).toEqual([
      third.queueItemId,
      first.queueItemId,
      second.queueItemId,
    ]);
    requireAccepted(await native.send("deleteQueueItem", { queueItemId: second.queueItemId }));
    expect((await native.snapshot()).queue.items.map((item) => item.queueItemId)).toEqual([
      third.queueItemId,
      first.queueItemId,
    ]);
  } finally {
    try {
      await native?.close();
    } finally {
      await c.close();
    }
  }
});

it("a queued edit lock cannot be stolen, released or bypassed by another client", async () => {
  const a = await connectST();
  let b: STClient | undefined;
  let owner: NativeSession | undefined;
  let peer: NativeSession | undefined;
  const failures: unknown[] = [];
  try {
    b = await connectST(a.identity.employeeId);
    const proposal = await createProposal(a);
    owner = await openNative(a, proposal.remote);
    const setup = await establishQueue(owner, a);
    await stopAndRead(owner);
    peer = await openNative(b, proposal.remote);
    const first = setup.items[0]!;
    const editorId = unique("owner-editor");
    requireAccepted(
      await owner.send("lockQueueItemEdit", { queueItemId: first.queueItemId, editorId }),
    );
    const locked = await owner.snapshot();
    const attempts = [
      ["lockQueueItemEdit", { queueItemId: first.queueItemId, editorId: unique("peer-editor") }],
      ["releaseQueueItemEdit", { queueItemId: first.queueItemId }],
      [
        "editQueueItem",
        { queueItemId: first.queueItemId, editorId, newText: "不得冒用持锁编辑器" },
      ],
      ["editQueueItem", { queueItemId: first.queueItemId, newText: "不得省略编辑器绕过锁" }],
      ["deleteQueueItem", { queueItemId: first.queueItemId }],
      ["reorderQueueItem", { queueItemId: first.queueItemId, beforeQueueItemId: null }],
      ["sendQueuedNow", { queueItemId: first.queueItemId }],
    ] as const;
    for (const [type, payload] of attempts) {
      const ack = await peer.send(type, payload);
      const after = await owner.snapshot();
      const item = after.queue.items.find((item) => item.queueItemId === first.queueItemId);
      expect(item, type).toMatchObject({
        text: first.text,
        editLock: { editorId, clientId: a.identity.clientId },
      });
      expect(ack.status, type).not.toBe("accepted");
      expect(ack.reasonCode).toBeTruthy();
      expect(after.queue.items).toEqual(locked.queue.items);
      // 已停止的旧轮仍可迟到收口耗时；锁拒绝必须保持队列及 canonical 输入，不比较后台计时字段。
      expect(after.rows.window.filter((row) => row.kind === "userInput")).toEqual(
        locked.rows.window.filter((row) => row.kind === "userInput"),
      );
    }
    requireAccepted(await owner.send("releaseQueueItemEdit", { queueItemId: first.queueItemId }));
    expect(
      (await owner.snapshot()).queue.items.find((item) => item.queueItemId === first.queueItemId)
        ?.editLock,
    ).toBeUndefined();
    // 拒绝只针对无权使用当前锁的请求；正常释放后另一客户端可以取得自己的锁并提交。
    const peerEditor = unique("peer-owner-editor");
    requireAccepted(
      await peer.send("lockQueueItemEdit", {
        queueItemId: first.queueItemId,
        editorId: peerEditor,
      }),
    );
    const revisedText = "新的持锁者修订需求：验收记录需可追溯。";
    requireAccepted(
      await peer.send("editQueueItem", {
        queueItemId: first.queueItemId,
        editorId: peerEditor,
        newText: revisedText,
      }),
    );
    const edited = await owner.snapshot();
    const editedFirst = edited.queue.items.find((item) => item.queueItemId === first.queueItemId);
    expect(editedFirst).toMatchObject({
      text: revisedText,
      modelSelection: first.modelSelection,
      planEnabled: first.planEnabled,
      attachments: first.attachments,
    });
    expect(editedFirst?.editLock).toBeUndefined();
    expect(edited.queue.items.filter((item) => item.queueItemId !== first.queueItemId)).toEqual(
      locked.queue.items.filter((item) => item.queueItemId !== first.queueItemId),
    );
  } catch (error) {
    failures.push(error);
  } finally {
    // 退订要使用仍开启的连接；并行关 socket 会掩盖真正的锁业务断言错误。
    // 两阶段均等待所有结果，保留业务失败与清理失败，不让 finally 覆盖前者。
    const subscriptions = await Promise.allSettled([peer?.close(), owner?.close()]);
    const connections = await Promise.allSettled([b?.close(), a.close()]);
    for (const result of [...subscriptions, ...connections])
      if (result.status === "rejected") failures.push(result.reason);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "队列锁断言或资源清理失败");
});

it("stop preserves queued inputs; sendQueuedNow promotes only the chosen input and autoDrain resumes the rest", async () => {
  const c = await connectST();
  let native: NativeSession | undefined;
  try {
    native = await openNative(c, (await createProposal(c)).remote);
    const setup = await establishQueue(native, c);
    const stopped = await stopAndRead(native);
    expect(stopped.queue.items.map((item) => item.sourceCommandId)).toEqual(setup.ids);
    const chosen = setup.items[1]!;
    requireAccepted(await native.send("sendQueuedNow", { queueItemId: chosen.queueItemId }));
    const promoted = await native.waitIdle();
    expect(
      promoted.rows.window.filter(
        (row) => row.kind === "userInput" && row.sourceCommandId === chosen.sourceCommandId,
      ),
    ).toEqual([
      expect.objectContaining({
        text: chosen.text,
        modelSelection: setup.modelSelection,
        planEnabled: true,
      }),
    ]);
    expect(promoted.queue.items.map((item) => item.sourceCommandId)).toEqual([
      setup.ids[0],
      setup.ids[2],
    ]);
    requireAccepted(await native.send("setAutoDrain", { autoDrain: true }));
    const drained = await waitUntil(
      "queued inputs completed",
      () => native!.snapshot(),
      (snapshot) =>
        snapshot.queue.items.length === 0 &&
        !["running", "prewarming"].includes(snapshot.control.phase),
    );
    const history = await c.services.zcodeAgentService.conversationRowsRangeV4({
      ...native.workspace,
      sessionId: native.sessionId,
      limit: 200,
    });
    for (const commandId of setup.ids) {
      expect(
        history.rows.filter((row) => row.kind === "userInput" && row.sourceCommandId === commandId),
      ).toHaveLength(1);
      // 队列消失或最后一轮成功都不足以证明全部执行成功；逐项核对原命令对应的完成事实。
      const turn = history.rows.find(
        (row) => row.kind === "turnHeader" && row.sourceCommandId === commandId,
      );
      if (!turn || turn.kind !== "turnHeader")
        throw new Error(`ST queued input has no canonical turn: ${commandId}`);
      expect(turn.state).toBe("completedSuccess");
      expect(
        history.rows.some(
          (row) =>
            row.kind === "assistantText" &&
            row.turnId === turn.turnId &&
            row.state === "complete" &&
            row.text.trim(),
        ),
      ).toBe(true);
    }
    expect(drained.queue.autoDrain).toBe(true);
    expect(drained.control.phase).toBe("completedSuccess");
  } finally {
    try {
      await native?.close();
    } finally {
      await c.close();
    }
  }
});
