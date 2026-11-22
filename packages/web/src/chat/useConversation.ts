import { useEffect, useMemo, useState } from "react";
import type { ZCodeAgentSessionTarget } from "@zcode/client/agent";
import {
  applyConversationDeltas,
  conversationTopicFrameSchema,
  TopicWireFrameAssembler,
  type ConversationRow,
  type ConversationSnapshot,
  type ConversationTopicFrame,
  type TopicWireAssemblyEvent,
} from "@zcode/shared/zcode-protocol-v4";
import { createTopicWireDecoder } from "@zcode/ui/web-chat-view";
import type { AgentConnection } from "./useAgentConnection.js";

interface View {
  snapshot: ConversationSnapshot;
  connection: AgentConnection;
  older: ConversationRow[];
}

const emptyRows: ConversationRow[] = [];

function keepContiguousOlder(previous: View | null, next: ConversationSnapshot): ConversationRow[] {
  if (
    !previous ||
    previous.snapshot.logEpoch !== next.logEpoch ||
    previous.snapshot.rows.firstRowId !== next.rows.firstRowId
  )
    return [];
  const first = next.rows.window[0]?.rowId;
  if (first === undefined) return [];
  if (previous.snapshot.rows.window[0]?.rowId === first) return previous.older;
  const olderIndex = previous.older.findIndex((row) => row.rowId === first);
  if (olderIndex >= 0) return previous.older.slice(0, olderIndex);
  const windowIndex = previous.snapshot.rows.window.findIndex((row) => row.rowId === first);
  // 无重叠时不能保留一段隔着缺口的旧分页；从新尾窗重新向前读取。
  return windowIndex < 0
    ? []
    : [...previous.older, ...previous.snapshot.rows.window.slice(0, windowIndex)];
}

export function useConversation(
  connection: AgentConnection | null,
  target: ZCodeAgentSessionTarget | null,
) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!connection || !target) return;
    const { agent } = connection;
    const { workspacePath, workspaceIdentity, sessionId } = target;
    const workspace = { workspacePath, workspaceIdentity };
    let active = true;
    let subscriptionId: string | undefined;
    let snapshot: ConversationSnapshot | undefined;
    let seq = 0;
    let recovering = false;
    const pending: TopicWireAssemblyEvent<ConversationTopicFrame>[] = [];
    const topic = `conversation/${sessionId}`;

    async function recover() {
      if (!subscriptionId || recovering) return;
      recovering = true;
      try {
        await agent.resyncConversationV4({
          ...workspace,
          subscriptionId,
          base: null,
          forceSnapshot: true,
        });
      } catch {
        if (active) setError("会话同步失败，请重新加载历史。");
      } finally {
        recovering = false;
      }
    }

    function applyFrame(frame: ConversationTopicFrame) {
      if (frame.subscriptionId !== subscriptionId) return;
      if (frame.payload.kind === "snapshot") {
        snapshot = frame.payload.snapshot;
      } else {
        if (frame.toSeq <= seq) return;
        if (!snapshot || frame.fromSeq !== seq) {
          void recover();
          return;
        }
        snapshot = applyConversationDeltas(snapshot, frame.payload.deltas);
      }
      seq = frame.toSeq;
      const next = snapshot;
      setError("");
      setView((previous) => ({
        connection: connection!,
        snapshot: next,
        older: keepContiguousOlder(previous, next),
      }));
    }

    function applyEvent(event: TopicWireAssemblyEvent<ConversationTopicFrame>) {
      if (event.kind === "complete") {
        applyFrame(event.frame);
      } else if (event.fault.subscriptionId === subscriptionId) {
        if (event.fault.deliveryKind === "recovery") {
          setError("会话同步失败，请重新加载历史。");
        } else {
          void recover();
        }
      }
    }

    function receiveEvent(event: TopicWireAssemblyEvent<ConversationTopicFrame>) {
      // 初始帧可能先于 ACK；帧及其故障都要等订阅身份确定后再接纳。
      if (subscriptionId) applyEvent(event);
      else pending.push(event);
    }
    const decoder = createTopicWireDecoder(
      new TopicWireFrameAssembler(conversationTopicFrameSchema),
      (frame, deliveryKind) => receiveEvent({ kind: "complete", frame, deliveryKind }),
      (fault) => receiveEvent({ kind: "fault", fault }),
    );
    const listener = agent.onDynamicConversationFrame(workspace)((candidate) => {
      if (active && candidate.topic === topic) decoder.accept(candidate);
    });
    const unsubscribe = (id: string) =>
      agent.unsubscribeConversationV4({ ...workspace, subscriptionId: id }).catch(() => {});
    void agent
      .subscribeConversationV4({ ...workspace, sessionId })
      .then(({ ack }) => {
        subscriptionId = ack.subscriptionId;
        if (!active) return unsubscribe(subscriptionId);
        pending.forEach(applyEvent);
        pending.length = 0;
      })
      .catch(() => {
        if (active) setError("无法打开此会话，请重新加载历史。");
      });

    return () => {
      active = false;
      listener.dispose();
      decoder.clear();
      if (subscriptionId) void unsubscribe(subscriptionId);
    };
  }, [connection, target, retry]);

  const window = view?.snapshot.rows.window ?? emptyRows;
  const older = view?.older;
  const rows = useMemo(() => (older?.length ? [...older, ...window] : window), [older, window]);
  const beforeRowId = older?.[0]?.rowId ?? window[0]?.rowId;
  const hasOlder = beforeRowId !== undefined && beforeRowId !== view?.snapshot.rows.firstRowId;
  const ready = connection !== null && view?.connection === connection && !error;

  async function loadOlder() {
    if (!ready || !view || !target || !hasOlder || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const { workspacePath, workspaceIdentity, sessionId } = target;
      const result = await connection.agent.conversationRowsRangeV4({
        workspacePath,
        workspaceIdentity,
        sessionId,
        beforeRowId,
        limit: 60,
      });
      setView((current) => {
        if (
          current?.connection !== connection ||
          current.snapshot.logEpoch !== result.atLogEpoch ||
          (current.older[0]?.rowId ?? current.snapshot.rows.window[0]?.rowId) !== beforeRowId
        )
          return current;
        return { ...current, older: [...result.rows, ...current.older] };
      });
    } catch {
      setError("无法读取更早的消息，请重新加载历史。");
    } finally {
      setLoadingOlder(false);
    }
  }

  return {
    rows,
    phase: view?.snapshot.control.phase,
    control: ready ? view?.snapshot.control : undefined,
    inputRouting: ready ? view?.snapshot.inputRouting : undefined,
    queue: view?.snapshot.queue,
    availability: ready ? view?.snapshot.availability : undefined,
    title: view?.snapshot.meta.title,
    totalCount: view?.snapshot.rows.totalCount ?? 0,
    plan: view?.snapshot.plan ?? null,
    logEpoch: view?.snapshot.logEpoch,
    modelSelection: view?.snapshot.config.modelSelection,
    revision: view?.snapshot.revision,
    error,
    ready,
    hasOlder,
    loadingOlder,
    loadOlder,
    reload: () => {
      setError("");
      setView(null);
      setRetry((value) => value + 1);
    },
  };
}
