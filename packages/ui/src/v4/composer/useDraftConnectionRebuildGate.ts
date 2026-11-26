import { useCallback, useEffect, useReducer, useRef } from "react";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";

/**
 * 重建窗口上限。超时只解除发送门禁，不取消重建。
 * 迟到的 binding 仍会正常更新 effectiveSessionId 并唤醒附件重传。
 */
export const DRAFT_CONNECTION_REBUILD_TIMEOUT_MS = 5000;

export interface DraftConnectionRebuildGateState {
  rebuilding: boolean;
  /** 换代发生时的预热会话 id；出现与之不同的非空 id 即视为重建完成。 */
  pendingFrom: string | null;
  /** 单调递增，仅用于让计时器 effect 在「重建中再次换代」时重新起算。 */
  epoch: number;
}

export type DraftConnectionRebuildGateEvent =
  | { type: "connectionReplaced"; prewarmSessionId: string | null }
  | { type: "prewarmSessionChanged"; prewarmSessionId: string | null }
  | { type: "rebuildTimeout" };

export const DRAFT_CONNECTION_REBUILD_GATE_IDLE: DraftConnectionRebuildGateState = {
  epoch: 0,
  pendingFrom: null,
  rebuilding: false,
};

export function reduceDraftConnectionRebuildGate(
  state: DraftConnectionRebuildGateState,
  event: DraftConnectionRebuildGateEvent,
): DraftConnectionRebuildGateState {
  switch (event.type) {
    case "connectionReplaced":
      return {
        epoch: state.epoch + 1,
        pendingFrom: event.prewarmSessionId,
        rebuilding: true,
      };
    case "prewarmSessionChanged":
      if (!state.rebuilding) return state;
      // retire 到重建完成之间 binding 为 null，不能据此解除门禁。
      if (event.prewarmSessionId === null) return state;
      if (event.prewarmSessionId === state.pendingFrom) return state;
      return { epoch: state.epoch, pendingFrom: null, rebuilding: false };
    case "rebuildTimeout":
      if (!state.rebuilding) return state;
      return { ...state, rebuilding: false };
  }
}

export interface DraftConnectionRebuildGate {
  /** 预热会话正在重建；true 时必须禁止发送，否则附件会挂在已消失的会话上。 */
  rebuilding: boolean;
}

/**
 * 承载连接替换后使草稿预热 binding 失效，禁止发送直至新会话就绪或门禁超时。
 * 正式会话保留已有 sessionId，由会话投影重订阅。
 */
export function useDraftConnectionRebuildGate(params: {
  /** 仅草稿态（sessionId === null）启用。 */
  enabled: boolean;
  workspacePath: string;
  workspaceIdentity?: string;
  /** 当前预热会话 id；出现新的非空值即视为重建完成。 */
  prewarmSessionId: string | null;
  onConnectionReplaced?: (listener: () => void) => () => void;
  timeoutMs?: number;
}): DraftConnectionRebuildGate {
  const {
    enabled,
    onConnectionReplaced,
    prewarmSessionId,
    timeoutMs = DRAFT_CONNECTION_REBUILD_TIMEOUT_MS,
    workspaceIdentity,
    workspacePath,
  } = params;
  const [state, dispatch] = useReducer(
    reduceDraftConnectionRebuildGate,
    DRAFT_CONNECTION_REBUILD_GATE_IDLE,
  );

  // 订阅保持稳定，收到替换事件时才读取最新草稿状态。
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const prewarmSessionIdRef = useRef(prewarmSessionId);
  prewarmSessionIdRef.current = prewarmSessionId;

  const handleConnectionReplaced = useCallback(() => {
    if (!enabledRef.current) return;
    dispatch({ prewarmSessionId: prewarmSessionIdRef.current, type: "connectionReplaced" });
    useZCodeSessionStore.getState().invalidateDraftRuntime(workspacePath, workspaceIdentity);
  }, [workspaceIdentity, workspacePath]);

  useEffect(
    () => onConnectionReplaced?.(handleConnectionReplaced),
    [handleConnectionReplaced, onConnectionReplaced],
  );

  useEffect(() => {
    dispatch({ prewarmSessionId, type: "prewarmSessionChanged" });
  }, [prewarmSessionId]);

  // 依赖 epoch 而非 rebuilding：重建中再次换代时 rebuilding 保持 true，
  // 只有 epoch 变化才能让计时器重新起算。
  useEffect(() => {
    if (!state.rebuilding) return;
    const timer = setTimeout(() => dispatch({ type: "rebuildTimeout" }), timeoutMs);
    return () => clearTimeout(timer);
  }, [state.epoch, state.rebuilding, timeoutMs]);

  return { rebuilding: state.rebuilding };
}
