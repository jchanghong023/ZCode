import { useCallback, useMemo } from "react";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import { SessionPane, type SessionPaneProps } from "../../v4/SessionPane.js";
import {
  conversationReadOnlyReason,
  fullReviewCurrent,
  requirementsReviewCurrent,
} from "../contract.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqSketchButton } from "../tools/AIReqSketchButton.js";
import {
  useAIReqWorkspaceActive,
  useOpenModelSettings,
} from "../shell/ModelSettingsNavigationContext.js";

/** AIReq owns admission/selection; native v4 remains the only draft and message owner. */
export function AIReqSessionPane(props: SessionPaneProps) {
  const aireq = useAIReq();
  const openModelSettings = useOpenModelSettings();
  const workspaceActive = useAIReqWorkspaceActive();
  const selection = aireq?.selection;
  const retrySession = aireq?.retrySession;
  const sessionId = props.sessionId;
  const businessSession =
    aireq?.selectionReady && sessionId !== null && aireq.session?.sessionId === sessionId;
  const proposal = aireq?.view?.requirements.find(
    (item) =>
      !item.archive && item.projectId === selection?.projectId && item.id === selection?.irId,
  );
  const review = aireq?.session?.phase === "solution" ? proposal?.review : proposal?.originalReview;
  // 失效评审可能仍属于当前方案阶段；同步服务端的版本与会话归属校验，不能仅按阶段放开输入。
  const staleReview =
    businessSession &&
    aireq?.session?.role === "reviewer" &&
    proposal &&
    (!(aireq.session.phase === "solution"
      ? fullReviewCurrent(proposal)
      : requirementsReviewCurrent(proposal)) ||
      !review?.agents?.some((agent) => agent.session.sessionId === sessionId));
  const readOnlyReason =
    props.readOnlyReason ??
    (businessSession && aireq
      ? (conversationReadOnlyReason(aireq.view, aireq.selection) ??
        (staleReview ? "该评审已失效，仅供只读查看。" : undefined))
      : undefined);
  const callerBeforeReconnect = props.onBeforeReconnect;
  const onBeforeReconnect = useMemo<SessionPaneProps["onBeforeReconnect"]>(() => {
    // 私有 Skill 只重订自身的原生 lease；不能借当前提案恢复另一个会话。
    if (!businessSession || !selection || !retrySession || sessionId === null)
      return callerBeforeReconnect;
    return async (isCurrent) => {
      if (callerBeforeReconnect) await callerBeforeReconnect(isCurrent);
      if (!isCurrent()) return;
      await retrySession(selection, sessionId, isCurrent);
    };
  }, [businessSession, selection, retrySession, sessionId, callerBeforeReconnect]);
  const interactionEnabled = workspaceActive && (props.interactionEnabled ?? true);
  const { services, rpcReady } = useWorkspaceServicesResolution(
    props.workspacePath,
    props.remoteSessionId,
    props.workspaceIdentity,
  );
  const agent = services.zcodeAgentService;
  const loadConversationCommands = useCallback(() => {
    if (!rpcReady) return;
    return agent.getConversationCommandCatalog?.({
      workspacePath: props.workspacePath,
      ...(props.workspaceIdentity ? { workspaceIdentity: props.workspaceIdentity } : {}),
      ...(sessionId ? { sessionId } : {}),
    });
  }, [agent, props.workspacePath, props.workspaceIdentity, rpcReady, sessionId]);
  return (
    <SessionPane
      {...props}
      showTurnWork
      retainReadOnlyComposer
      readOnly={props.readOnly || Boolean(readOnlyReason)}
      readOnlyReason={readOnlyReason}
      onBeforeReconnect={onBeforeReconnect}
      onOpenModelSettings={props.onOpenModelSettings ?? openModelSettings}
      loadConversationCommands={loadConversationCommands}
      focused={workspaceActive && (props.focused ?? true)}
      interactionEnabled={interactionEnabled}
      autoFocusEnabled={
        workspaceActive && (props.autoFocusEnabled ?? aireq?.session?.role !== "reviewer")
      }
      composerTrailingTools={
        props.composerTrailingTools ??
        ((port) => (
          <>
            {/* 只保留真实生成附件的画图能力；未接入识别服务时不显示假录音入口。 */}
            <AIReqSketchButton
              key={JSON.stringify([props.workspaceIdentity ?? props.workspacePath, sessionId])}
              disabled={port.disabled}
              onAddFiles={port.addFiles}
              onReturnToComposer={port.focusInput}
            />
          </>
        ))
      }
    />
  );
}
