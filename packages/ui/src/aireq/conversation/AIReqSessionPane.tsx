import { useCallback, useMemo } from "react";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import type { ComposerToolsPort } from "../../v4/ConversationComposer.js";
import { SessionPane, type SessionPaneProps } from "../../v4/SessionPane.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqSketchButton } from "../tools/AIReqSketchButton.js";
import type { AIReqSketchButtonProps } from "../tools/contract.js";
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
  const renderSketch = (port: ComposerToolsPort, dialog?: AIReqSketchButtonProps["dialog"]) => (
    <AIReqSketchButton
      key={JSON.stringify([props.workspaceIdentity ?? props.workspacePath, sessionId])}
      disabled={port.disabled}
      dialog={dialog}
      onAddFiles={port.addFiles}
      onReturnToComposer={port.focusInput}
    />
  );
  return (
    <SessionPane
      {...props}
      showTurnWork
      retainReadOnlyComposer
      onBeforeReconnect={onBeforeReconnect}
      onOpenModelSettings={props.onOpenModelSettings ?? openModelSettings}
      loadConversationCommands={loadConversationCommands}
      focused={workspaceActive && (props.focused ?? true)}
      interactionEnabled={interactionEnabled}
      autoFocusEnabled={workspaceActive && (props.autoFocusEnabled ?? true)}
      composerSketch={businessSession ? renderSketch : undefined}
      composerTrailingTools={
        props.composerTrailingTools ?? (businessSession ? undefined : renderSketch)
      }
    />
  );
}
