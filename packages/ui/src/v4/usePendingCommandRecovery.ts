import { useCallback, useEffect, useState } from "react";
import type { CommandAck, ConversationSnapshot } from "@zcode/shared/zcode-protocol-v4";
import { logger } from "@/logger.js";
import { pendingCommandRegistry, type PendingCommandEntry } from "@/v4/pendingCommandRegistry.js";
import {
  isPendingCommandForClient,
  isPendingCommandForWorkspace,
} from "@/v4/pendingCommandWorkspace.js";
import type { SessionDataLayer } from "@/v4/sessionDataLayer.js";

export interface UsePendingCommandRecoveryOptions {
  clientNamespace: string;
  remoteAvailable: boolean;
  layer: SessionDataLayer;
  sessionId: string | null;
  snapshot: ConversationSnapshot | null;
  status: "connecting" | "live" | "error" | "closed";
  subscriptionId: string | null;
  workspacePath: string;
  workspaceIdentity?: string;
  onRecoveredLocalCommand?: (ack: CommandAck) => void;
}

/**
 * pending registry 的 React 接缝：projection 用 queue/guided/transcript anchor 收口；远端 query
 * 只在 subscription 代际进入 live 时执行，不跟随 streaming snapshot 高频重跑。
 */
export function usePendingCommandRecovery({
  clientNamespace,
  remoteAvailable,
  layer,
  sessionId,
  snapshot,
  status,
  subscriptionId,
  workspacePath,
  workspaceIdentity,
  onRecoveredLocalCommand,
}: UsePendingCommandRecoveryOptions) {
  const [version, setVersion] = useState(0);

  useEffect(() => pendingCommandRegistry.subscribe(() => setVersion((current) => current + 1)), []);

  useEffect(() => {
    if (snapshot) pendingCommandRegistry.reconcileSnapshot(snapshot);
  }, [snapshot]);

  const reconcile = useCallback(
    (isCurrent?: () => boolean) => {
      if (!remoteAvailable || status !== "live" || subscriptionId === null) return;
      // 当前 session 与 createSession(null bucket) 可并行查询；registry 内部各自 single-flight。
      const targets: Array<string | null> = sessionId === null ? [null] : [sessionId, null];
      void Promise.all(
        targets.map((target) =>
          pendingCommandRegistry.reconcileSession(
            target,
            async (params) => {
              const result = await layer.queryCommands(params);
              if ((!isCurrent || isCurrent()) && onRecoveredLocalCommand && target === sessionId) {
                for (const item of result.results) {
                  if (item.result !== "unknown" && item.result.result?.type === "localCommand") {
                    onRecoveredLocalCommand(item.result);
                  }
                }
              }
              return result;
            },
            workspaceIdentity?.trim() || workspacePath,
            clientNamespace,
          ),
        ),
      ).catch((error) => {
        logger.warn("[v4-pending-command] 重连对账失败，保留账本等待下次连接", error);
      });
    },
    [
      clientNamespace,
      layer,
      onRecoveredLocalCommand,
      remoteAvailable,
      sessionId,
      status,
      subscriptionId,
      workspacePath,
      workspaceIdentity,
    ],
  );
  useEffect(() => {
    let current = true;
    reconcile(() => current);
    return () => {
      current = false;
    };
  }, [reconcile]);

  // version 是 registry 的窄订阅信号；不把整份账本复制进 React state。
  void version;
  const matchesScope = (entry: PendingCommandEntry) =>
    isPendingCommandForClient(entry, clientNamespace) &&
    isPendingCommandForWorkspace(entry, workspacePath, workspaceIdentity);
  const scoped =
    sessionId === null ? [] : pendingCommandRegistry.list(sessionId).filter(matchesScope);
  const recoverableCreates = pendingCommandRegistry.listRecoverable(null).filter(matchesScope);
  // null bucket 只表示 createSession 尚未绑定 session，不表示它没有 workspace。
  // 每个 pane 都订阅同一 registry，因此必须在展示/消费前按 workspace identity 隔离。
  return {
    checkReceipts: () => reconcile(),
    pendingSend: scoped.some((entry) => entry.clientContext?.settleOnAdmission && !entry.recovery),
    recoverableCommands: [
      ...scoped.filter((entry) => entry.recovery === "discarded" && !entry.recoveryDismissed),
      ...recoverableCreates,
    ],
  };
}
