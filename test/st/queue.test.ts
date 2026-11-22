import { expect, it } from "vitest";
import { connectST, unique, type STClient } from "./client.js";
import { createProposal } from "./business.js";
import { expectNativeTurnWork, openNative, requireAccepted, requireRejected } from "./native.js";
import { getProposal } from "./proposal-flow.js";

it("rejects an implicit busy send, steers the active turn, and delivers follow-up as its own turn", async () => {
  const c = await connectST();
  let native: Awaited<ReturnType<typeof openNative>> | undefined;
  let peerClient: STClient | undefined;
  let peer: Awaited<ReturnType<typeof openNative>> | undefined;
  try {
    const proposal = await createProposal(c);
    native = await openNative(c, proposal.remote);
    peerClient = await connectST(c.identity.employeeId);
    peer = await openNative(peerClient, proposal.remote);
    const startId = unique("foreground");
    const implicitId = unique("implicit-busy");
    const steerId = unique("steer");
    const followUpId = unique("follow-up");
    const text = "补充需求：验收结果需要可追溯。";
    // One socket sends the initial sequence in order; submit the follow-up from a different actor.
    const [started, implicit, steered] = await Promise.all([
      native.send("sendText", { text: "请梳理验收标准与适用场景。" }, { commandId: startId }),
      native.send("sendText", { text }, { commandId: implicitId }),
      native.send("sendText", { text, streamingBehavior: "steer" }, { commandId: steerId }),
    ]);
    const followed = await peer.send(
      "sendText",
      { text, streamingBehavior: "followUp" },
      { commandId: followUpId },
    );
    requireRejected(implicit);
    for (const [ack, delivery] of [
      [started, "startNow"],
      [steered, "guide"],
      [followed, "queue"],
    ] as const) {
      requireAccepted(ack);
      expect(ack.result).toMatchObject({ type: "inputAccepted", delivery });
    }

    const final = await native.waitIdle();
    expectNativeTurnWork(native, final, startId);
    expectNativeTurnWork(native, final, followUpId);
    expect(final.queue.items).toEqual([]);
    const deltas = native.frames.flatMap((frame) =>
      frame.payload.kind === "deltas" ? frame.payload.deltas : [],
    );
    expect(
      deltas.some(
        (delta) =>
          delta.op === "state.updated" && delta.patch.inputRouting?.mode === "streamingChoice",
      ),
    ).toBe(true);

    const inputs = final.rows.window.filter((row) => row.kind === "userInput");
    expect(inputs.map((row) => row.sourceCommandId)).toEqual([startId, steerId, followUpId]);
    const [start, steer, followUp] = inputs;
    expect(steer).toMatchObject({ text, turnId: start!.turnId, clientId: c.identity.clientId });
    expect(followUp).toMatchObject({ text, clientId: peerClient.identity.clientId });
    expect(followUp!.turnId).not.toBe(start!.turnId);
    expect(
      final.rows.window
        .filter((row) => row.kind === "turnHeader")
        .map((row) => row.sourceCommandId),
    ).toEqual([startId, followUpId]);
    const { workspace, sessionId } = native;
    const [ownerReceipts, peerReceipts] = await Promise.all([
      c.services.zcodeAgentService.queryConversationCommandsV4({
        ...workspace,
        commands: [implicitId, steerId].map((commandId) => ({ sessionId, commandId })),
      }),
      peerClient.services.zcodeAgentService.queryConversationCommandsV4({
        ...workspace,
        commands: [{ sessionId, commandId: followUpId }],
      }),
    ]);
    expect(ownerReceipts.results.map((item) => item.result)).toEqual([implicit, steered]);
    expect(peerReceipts.results[0]?.result).toEqual(followed);
  } finally {
    try {
      await Promise.all([peer?.close(), native?.close()]);
    } finally {
      await Promise.all([peerClient?.close(), c.close()]);
    }
  }
});

it("stops only the expected execution and keeps undispatched follow-up as preview without replay", async () => {
  const c = await connectST();
  let native: Awaited<ReturnType<typeof openNative>> | undefined;
  try {
    const proposal = await createProposal(c);
    native = await openNative(c, proposal.remote);
    const before = getProposal(proposal.remote, proposal);
    const startId = unique("stop-target");
    const followUpId = unique("pending-at-stop");
    const laterId = unique("later-work");
    const text = "补充需求：记录人工验收人的角色。";
    const [started, queued, running] = await Promise.all([
      native.send("sendText", { text: "请梳理范围和边界条件。" }, { commandId: startId }),
      native.send("sendText", { text, streamingBehavior: "followUp" }, { commandId: followUpId }),
      native.snapshot(),
    ]);
    requireAccepted(started);
    requireAccepted(queued);
    expect(queued.result).toMatchObject({ type: "inputAccepted", delivery: "queue" });
    const expectedForegroundExecutionId = running.control.activeWorks.find(
      (work) => work.kind === "primaryTurn" && work.sourceCommandId === startId,
    )?.foregroundExecutionId;
    expect(expectedForegroundExecutionId).toEqual(expect.any(String));
    expect(running.control.canStop).toBe(true);
    const preview = [
      expect.objectContaining({
        sourceCommandId: followUpId,
        clientId: c.identity.clientId,
        text,
      }),
    ];
    expect(running.queue.items).toEqual(preview);

    requireAccepted(await native.send("stop", { expectedForegroundExecutionId }));
    const stopped = await native.waitIdle();
    expect(stopped.control.phase).toBe("completedInterrupted");
    expect(stopped.queue.items).toEqual(preview);
    expect(stopped.availability.queueEdit.allowed).toBe(false);
    expect(stopped.availability.sendQueuedNow.allowed).toBe(false);
    expect(stopped.availability.setFollowupMode.allowed).toBe(false);
    expect(
      stopped.rows.window
        .filter((row) => row.kind === "userInput")
        .map((row) => row.sourceCommandId),
    ).toEqual([startId]);
    const afterStop = getProposal(await c.read(proposal.selection), proposal);
    expect(afterStop.files).toEqual(before.files);
    expect(afterStop.requirementsCheck).toEqual(before.requirementsCheck);

    const [later, laterRunning] = await Promise.all([
      native.send("sendText", { text: "用户显式发送一条新需求。" }, { commandId: laterId }),
      native.snapshot(),
      native.send("stop", { expectedForegroundExecutionId }),
    ]);
    requireAccepted(later);
    const laterWork = laterRunning.control.activeWorks.find(
      (work) => work.sourceCommandId === laterId,
    );
    expect(laterWork?.foregroundExecutionId).toEqual(expect.any(String));
    expect(laterWork?.foregroundExecutionId).not.toBe(expectedForegroundExecutionId);
    const final = await native.waitIdle();
    expectNativeTurnWork(native, final, laterId);
    expect(
      final.rows.window.find((row) => row.kind === "turnHeader" && row.sourceCommandId === startId),
    ).toMatchObject({ state: "completedInterrupted" });
  } finally {
    try {
      await native?.close();
    } finally {
      await c.close();
    }
  }
});
