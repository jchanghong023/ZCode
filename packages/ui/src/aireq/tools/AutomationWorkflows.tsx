import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import { NativeTaskRunsGate } from "./NativeTaskRunsGate.js";

/** 工作流仅读取当前已有业务会话，不创建、改绑或发送消息来解锁运行图。 */
export function AutomationWorkflows({
  workspacePath,
  workspaceIdentity,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
}) {
  const aireq = useAIReq();
  const source = useAIReqDataSource();
  const session = aireq?.session;
  // 修复原因：工作区按当前 selection 精确解析，canonical session 并不是 selection。
  const scope = aireq && session ? source.resolveWorkspace(aireq.view, aireq.selection) : undefined;
  return (
    <NativeTaskRunsGate
      key={`${scope?.path ?? workspacePath}:${scope?.identity ?? workspaceIdentity}:${session?.sessionId ?? "unbound"}`}
      sessionId={session?.sessionId}
      workspacePath={scope?.path ?? workspacePath}
      workspaceIdentity={scope?.identity ?? workspaceIdentity}
    />
  );
}
