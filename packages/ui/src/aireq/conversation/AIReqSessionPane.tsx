import { useMemo } from "react";
import { SessionPane, type SessionPaneProps } from "../../v4/SessionPane.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqSketchButton } from "../tools/AIReqSketchButton.js";
import { AIReqSpeechInputButton } from "../tools/AIReqSpeechInputButton.js";
import {
  useAIReqWorkspaceActive,
  useOpenModelSettings,
} from "../shell/ModelSettingsNavigationContext.js";

export type AIReqSessionPaneProps = SessionPaneProps;

/** AIReq owns admission/selection; native v4 remains the only draft and message owner. */
export function AIReqSessionPane(props: AIReqSessionPaneProps) {
  const aireq = useAIReq();
  const openModelSettings = useOpenModelSettings();
  const workspaceActive = useAIReqWorkspaceActive();
  const firstSend = props.sessionId === null && Boolean(aireq?.selection.proposalDraftId);
  const selection = aireq?.selection;
  const retrySession = aireq?.retrySession;
  const sessionId = props.sessionId;
  const businessSession =
    aireq?.selectionReady && sessionId !== null && aireq.session?.sessionId === sessionId;
  const callerBeforeReconnect = props.onBeforeReconnect;
  const onBeforeReconnect = useMemo<SessionPaneProps["onBeforeReconnect"]>(() => {
    // 自动化／actor 历史和私有 Skill 不属于当前业务会话，不能用当前选择恢复其他 session。
    if (!businessSession || !selection || !retrySession || sessionId === null)
      return callerBeforeReconnect;
    return async () => {
      await callerBeforeReconnect?.();
      await retrySession(selection, sessionId);
    };
  }, [businessSession, selection, retrySession, sessionId, callerBeforeReconnect]);
  const extension = useMemo<SessionPaneProps["conversationExtension"]>(() => {
    if (!firstSend || !aireq) return undefined;
    return {
      prepareFirstSend: async (text, options, preparedSessionId) => {
        try {
          return (await aireq.openFirstDiscussion(text, options, preparedSessionId)).sessionId;
        } catch (error) {
          aireq.report(error);
          throw error;
        }
      },
      onFirstSendAccepted: (sessionId) => aireq.finishFirstDiscussion(sessionId),
    };
  }, [aireq, firstSend]);
  return (
    <SessionPane
      {...props}
      onBeforeReconnect={onBeforeReconnect}
      onOpenModelSettings={props.onOpenModelSettings ?? openModelSettings}
      focused={workspaceActive && (props.focused ?? true)}
      telemetryVisible={workspaceActive && (props.telemetryVisible ?? true)}
      interactionEnabled={workspaceActive && (props.interactionEnabled ?? true)}
      conversationExtension={props.conversationExtension ?? extension}
      autoFocusEnabled={
        workspaceActive && (props.autoFocusEnabled ?? aireq?.session?.role !== "reviewer")
      }
      composerTrailingTools={
        props.composerTrailingTools ??
        ((port) => (
          <>
            {/* 提案和 Skill 共用源操作顺序：模型之后依次为语音、画图、发送。 */}
            <AIReqSpeechInputButton
              disabled={port.disabled}
              onInsertText={port.appendText}
              onReturnToComposer={port.focusInput}
            />
            <AIReqSketchButton
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
