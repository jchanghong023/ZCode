import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.js";
import { AutomationsSection } from "@/settings/AutomationsSection.js";
import { AutomationsMainBreadcrumbFrame } from "@/settings/AutomationsMainBreadcrumbFrame.js";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import { AIReqSessionPane } from "../conversation/AIReqSessionPane.js";
import { useAIReq } from "../AIReqContext.js";
import { AutomationWorkflows } from "./AutomationWorkflows.js";
import { useAIReqDataSource } from "../data-source.js";

interface AutomationSession {
  workspacePath: string;
  workspaceIdentity?: string;
  sessionId: string;
}

/** 历史是独立只读弹窗，不改变当前需求、阶段或项目选择。 */
export function AIReqAutomations({
  workspacePath,
  workspaceIdentity,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
}) {
  const aireq = useAIReq();
  const source = useAIReqDataSource();
  const projectOptions = useMemo(
    () =>
      (aireq?.view?.projects ?? [])
        .map((project) => {
          const workspace = source.resolveWorkspace(undefined, { projectId: project.id });
          return {
            projectId: project.id,
            workspacePath: workspace.path ?? "",
            workspaceIdentity: workspace.identity,
            label: project.name,
          };
        })
        .filter((option) => Boolean(option.workspacePath && option.workspaceIdentity)),
    [aireq?.view?.projects, source],
  );
  const [session, setSession] = useState<AutomationSession | null>(null);
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" data-testid="aireq-automations">
      {/* 修复原因：Shell 已有 48px 空条；此处复用 24px 面包屑区，避免原生桌面 48px 重复留白。 */}
      <AutomationsMainBreadcrumbFrame
        ariaLabel="自动化导航"
        isDesktop
        headerClassName="h-6 has-[nav]:h-12"
        sectionLabel="自动化"
      >
        <AutomationsSection
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          scheduledOnly
          runNowNotice="已登记 stopped 模拟运行记录，未执行模型或真实调度。"
          projectOptions={projectOptions}
          onOpenSession={setSession}
          nativeWorkflowContent={
            <AutomationWorkflows
              workspacePath={workspacePath}
              workspaceIdentity={workspaceIdentity}
            />
          }
        />
      </AutomationsMainBreadcrumbFrame>
      <Dialog
        open={session !== null}
        onOpenChange={(open) => {
          if (!open) setSession(null);
        }}
      >
        <DialogContent className="flex h-[80dvh] max-w-4xl flex-col gap-2">
          <DialogTitle>自动化运行会话（模拟）</DialogTitle>
          <DialogDescription>
            只读查看运行历史，关闭后回到自动化页面，不切换当前 IR/SR。
          </DialogDescription>
          {session && (
            <div className="relative min-h-0 flex-1">
              <V4PaneConversationProvider scope={session} sessionId={session.sessionId}>
                <AIReqSessionPane
                  paneId={`automation-preview:${session.sessionId}`}
                  sessionId={session.sessionId}
                  rootSessionId={session.sessionId}
                  workspacePath={session.workspacePath}
                  workspaceIdentity={session.workspaceIdentity}
                  embedded
                  readOnly
                />
              </V4PaneConversationProvider>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
