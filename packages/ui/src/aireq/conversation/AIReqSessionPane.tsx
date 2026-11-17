import { useMemo } from "react";
import { SessionPane, type SessionPaneProps } from "../../v4/SessionPane.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqSketchButton } from "../tools/AIReqSketchButton.js";
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
  const selection = aireq?.selection;
  const retrySession = aireq?.retrySession;
  const sessionId = props.sessionId;
  const businessSession =
    aireq?.selectionReady && sessionId !== null && aireq.session?.sessionId === sessionId;
  const callerBeforeReconnect = props.onBeforeReconnect;
  const onBeforeReconnect = useMemo<SessionPaneProps["onBeforeReconnect"]>(() => {
    // 私有 Skill 不属于当前业务会话，不能用当前选择恢复其他 session。
    if (!businessSession || !selection || !retrySession || sessionId === null)
      return callerBeforeReconnect;
    return async () => {
      await callerBeforeReconnect?.();
      await retrySession(selection, sessionId);
    };
  }, [businessSession, selection, retrySession, sessionId, callerBeforeReconnect]);
  // 根因：私有 Skill 不命中当前业务 selection，却同样保留 Agent 创建绑定；
  // 仅按 businessSession 开端口会误发被服务端拒绝的 switchModelConfig。
  // AIReq 的选模统一归本次 Submission，businessSession 只裁决业务重连归属。
  return (
    <SessionPane
      {...props}
      onBeforeReconnect={onBeforeReconnect}
      onOpenModelSettings={props.onOpenModelSettings ?? openModelSettings}
      submissionModelSelectionOnly
      focused={workspaceActive && (props.focused ?? true)}
      interactionEnabled={workspaceActive && (props.interactionEnabled ?? true)}
      autoFocusEnabled={
        workspaceActive && (props.autoFocusEnabled ?? aireq?.session?.role !== "reviewer")
      }
      composerTrailingTools={
        props.composerTrailingTools ??
        ((port) => (
          <>
            {/* 只保留真实生成附件的画图能力；未接入识别服务时不显示假录音入口。 */}
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
