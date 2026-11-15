// sessions-index 的 React 绑定：每个消费者一个只读 SessionsIndexStore + 传输连接。
// 侧栏/任务列表消费本 hook 拿会话摘要列表，替代 zustand 任务态（08-phasing M5 步骤 2）；
// 多个列表消费者共享同一 workspace 订阅时改走 sessionsIndexRegistry（引用计数复用 store）。
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { SessionSummary } from "@zcode/shared/zcode-protocol-v4";
import { useServices } from "@/hooks/useServices.js";
import { createAgentSessionsIndexTransport } from "@/v4/agentSessionsIndexTransport.js";
import { SessionsIndexStore, type SessionsIndexStoreStatus } from "@/v4/sessionsIndexStore.js";

export interface UseSessionsIndexResult {
  sessions: SessionSummary[];
  status: SessionsIndexStoreStatus;
}

/**
 * 订阅某 workspace 的 sessions-index，返回会话摘要列表（默认按 lastActivityAt 降序）。
 * 生命周期：workspace 变化时重建 store + 重连；卸载时 close（退订 + 解监听）。
 */
export function useSessionsIndex(
  workspacePath: string,
  workspaceIdentity?: string,
): UseSessionsIndexResult {
  const { zcodeAgentService } = useServices();

  const { store } = useMemo(
    () => ({
      workspacePath,
      workspaceIdentity,
      zcodeAgentService,
      store: new SessionsIndexStore(),
    }),
    // 每个 workspace 和服务代际持有独立 store，避免跨连接复用投影。
    [workspacePath, workspaceIdentity, zcodeAgentService],
  );

  useEffect(() => {
    const transport = createAgentSessionsIndexTransport(zcodeAgentService, {
      workspacePath,
      ...(workspaceIdentity ? { workspaceIdentity } : {}),
    });
    void store.connect(transport, { forceSnapshot: true });
    return () => store.close();
  }, [store, workspacePath, workspaceIdentity, zcodeAgentService]);

  // useSyncExternalStore：store.subscribe/getState 是类字段箭头函数，引用稳定。
  useSyncExternalStore(store.subscribe, store.getState);
  // getSessions 已由 store 按投影版本缓存，不再另建 React 缓存。
  const sessions = store.getSessions();

  return { sessions, status: store.getStatus() };
}
