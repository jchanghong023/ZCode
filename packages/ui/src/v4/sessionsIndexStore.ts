// sessions-index wire 帧的纯投影算法。
import { type SessionSummary, type SessionsIndexTopicFrame } from "@zcode/shared/zcode-protocol-v4";
export interface SessionsIndexState {
  /** workspaceId → 已知；null = 尚无 snapshot。 */
  workspaceId: string | null;
  logEpoch: string | null;
  /** 帧区间水位（= 最近一帧 toSeq）。 */
  seq: number;
  /** 会话摘要，按 sessionId 索引（conflated）。 */
  sessions: Map<string, SessionSummary>;
}

export const EMPTY_SESSIONS_INDEX_STATE: SessionsIndexState = {
  workspaceId: null,
  logEpoch: null,
  seq: 0,
  sessions: new Map(),
};

export interface ApplySessionsIndexResult {
  state: SessionsIndexState;
  /** true = 帧区间断档（fromSeq 与水位不衔接），调用方应重订阅。 */
  gap: boolean;
}

/** 纯 apply：snapshot 全量替换；deltas 仅在衔接时逐条 upsert/remove。 */
export function applySessionsIndexFrame(
  current: SessionsIndexState,
  frame: SessionsIndexTopicFrame,
): ApplySessionsIndexResult {
  if (frame.payload.kind === "snapshot") {
    const snapshot = frame.payload.snapshot;
    const sessions = new Map<string, SessionSummary>();
    for (const session of snapshot.sessions) {
      sessions.set(session.sessionId, session);
    }
    return {
      gap: false,
      state: {
        workspaceId: snapshot.workspaceId,
        logEpoch: snapshot.logEpoch,
        seq: frame.toSeq,
        sessions,
      },
    };
  }
  if (frame.toSeq <= current.seq) {
    return { state: current, gap: false };
  }
  // deltas：区间必须衔接（fromSeq === 当前水位），否则断档。
  if (frame.fromSeq !== current.seq) {
    return { state: current, gap: true };
  }
  const sessions = new Map(current.sessions);
  for (const delta of frame.payload.deltas) {
    if (delta.op === "session.upserted") {
      sessions.set(delta.session.sessionId, delta.session);
    } else {
      sessions.delete(delta.sessionId);
    }
  }
  return {
    gap: false,
    state: { ...current, seq: frame.toSeq, sessions },
  };
}
