import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ClipboardCheck, PanelRightOpen } from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import { useAIReq } from "../AIReqContext.js";
import { hasProjectRole } from "../contract.js";
import { AIReqSessionPane } from "../conversation/AIReqSessionPane.js";
import { useAIReqDataSource } from "../data-source.js";
import { getEmployeeId } from "../identity.js";
import { AIReqRequirementMenu } from "../proposals/AIReqRequirementMenu.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import { AIReqRequirementReturnButton } from "./AIReqRequirementNavigation.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "./pageLayout.js";

export function AIReqProposalWorkspace({ active }: { active: boolean }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const source = useAIReqDataSource();
  const { activeTab, isOpen, open, expand } = useAIReqSidePane();
  const { projectId, irId, srId, discussionPhase: agent = "requirements" } = ai.selection;
  const group = ai.view?.requirements.find(
    (item) => item.projectId === projectId && item.id === irId,
  );
  const employee = getEmployeeId();
  const canUseSolution =
    hasProjectRole(ai.view, projectId, employee, "development") ||
    hasProjectRole(ai.view, projectId, employee, "testing");
  const canEnter = agent === "requirements" || canUseSolution;
  const alternateAgent = agent === "requirements" ? "solution" : "requirements";
  const canSwitchAgent = alternateAgent === "requirements" || canUseSolution;
  const agentLabels = {
    requirements: zh ? "需求 Agent" : "Requirements Agent",
    solution: zh ? "方案 Agent" : "Solution Agent",
  };
  const agentTitle = agentLabels[agent];
  const alternateLabel = zh
    ? `切换到${agentLabels[alternateAgent]}`
    : `Switch to the ${agentLabels[alternateAgent]}`;
  const solutionAccessHint = zh
    ? "该项目的开发和测试可以进入方案 Agent。"
    : "The Solution Agent is available to this project's developers and testers.";
  const materialsOpened = useRef(false);
  const focusOpenedDocuments = useRef(false);
  const reviewInFlight = useRef(false);
  const [requestingReview, setRequestingReview] = useState(false);
  const { releaseId, title } = group ?? {};
  const { selectionReady } = ai;
  useEffect(() => {
    if (
      !selectionReady ||
      !canEnter ||
      !projectId ||
      !irId ||
      !releaseId ||
      !title ||
      materialsOpened.current
    )
      return;
    // Shell 按会话入口重建；读取投影更新或用户收起文档时不能再次打开。
    materialsOpened.current = true;
    open({
      selection: { projectId, irId, srId, discussionPhase: agent },
      releaseId,
      title,
    });
  }, [selectionReady, canEnter, projectId, irId, srId, releaseId, title, agent, open]);
  const currentDocumentsSelected =
    !!activeTab && activeTab.selection.projectId === projectId && activeTab.selection.irId === irId;
  const currentDocumentsOpen = isOpen && currentDocumentsSelected;
  useLayoutEffect(() => {
    if (!currentDocumentsOpen || !focusOpenedDocuments.current) return;
    focusOpenedDocuments.current = false;
    document
      .querySelector<HTMLElement>("#aireq-document-workspace [role='tab'][aria-selected='true']")
      ?.focus();
  }, [currentDocumentsOpen]);
  const openDocuments = () => {
    if (!group) return;
    focusOpenedDocuments.current = true;
    if (currentDocumentsSelected) {
      expand();
      return;
    }
    open({
      selection: { projectId: group.projectId, irId: group.id, srId, discussionPhase: agent },
      releaseId: group.releaseId,
      title: group.title,
    });
  };
  const requestReview = async () => {
    if (!group || reviewInFlight.current) return;
    reviewInFlight.current = true;
    setRequestingReview(true);
    try {
      await ai.command({
        type: "reviewDocuments",
        projectId: group.projectId,
        irId: group.id,
        agent,
      });
    } finally {
      reviewInFlight.current = false;
      setRequestingReview(false);
    }
  };

  const session =
    selectionReady && canEnter && ai.session?.phase === agent ? ai.session : undefined;
  const workspace = source.resolveWorkspace(ai.view, ai.selection);
  const scope = { workspacePath: workspace.path ?? "", workspaceIdentity: workspace.identity };
  const review = group?.documentReviews.filter((item) => item.agent === agent).at(-1);
  const reviewing = requestingReview || review?.status === "running";
  const latestVersion = group?.documentVersion?.number;
  const reviewAction =
    agent === "requirements"
      ? zh
        ? "评审需求"
        : "Review requirements"
      : zh
        ? "审查方案"
        : "Review solution";
  // 评审始终使用最新版；读取右栏历史版本不改变按钮显示的操作目标。
  const reviewLabel =
    latestVersion === undefined
      ? reviewAction
      : zh
        ? `${reviewAction} · 最新 V${latestVersion}`
        : `${reviewAction} (latest V${latestVersion})`;
  const reviewingLabel = zh ? "评审中…" : "Reviewing…";
  const reviewStatus = review
    ? review.status === "running"
      ? zh
        ? `正在评审 V${review.version}…`
        : `Reviewing V${review.version}…`
      : review.status === "failed"
        ? zh
          ? `V${review.version} 的评审失败，可重新发起。`
          : `V${review.version} review failed. You can request another review.`
        : review.stale
          ? zh
            ? `最近一次评审对应 V${review.version} 修改前的内容。`
            : `The latest review used an earlier snapshot of V${review.version}.`
          : undefined
    : undefined;
  const unavailable = ai.pending
    ? zh
      ? "正在读取需求…"
      : "Loading requirement…"
    : zh
      ? "当前会话暂不可用。"
      : "This conversation is unavailable.";
  const switchAgentButton = group && (
    <Button
      type="button"
      size="lg"
      variant="outline"
      aria-disabled={!canSwitchAgent || undefined}
      aria-description={!canSwitchAgent ? solutionAccessHint : undefined}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      onClick={() => {
        if (!canSwitchAgent) return;
        // 沿用工作台导航和回焦，仅改变会话阶段，保留同一需求及文档定位。
        ai.navigate(() =>
          ai.select(
            { projectId: group.projectId, irId: group.id, srId, discussionPhase: alternateAgent },
            group.releaseId,
          ),
        );
      }}
    >
      {alternateLabel}
    </Button>
  );
  return (
    <div
      className="@container/conversation flex h-full min-h-0 flex-col overflow-hidden bg-background"
      data-testid="aireq-agent-workspace"
      data-aireq-agent={agent}
    >
      <header
        className="flex min-h-14 min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-border/50 px-3 py-2"
        data-testid="aireq-agent-toolbar"
      >
        <AIReqRequirementReturnButton />
        <div className="min-w-0 flex-1 basis-36">
          <h1 className="text-ui-lg font-semibold leading-tight">{agentTitle}</h1>
          {group && (
            <p className="truncate text-ui-caption text-foreground-subtle" title={group.title}>
              {group.title}
            </p>
          )}
        </div>
        {selectionReady && group && (
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
            {canSwitchAgent ? (
              switchAgentButton
            ) : (
              <ControlHintTooltip title={solutionAccessHint}>
                {switchAgentButton}
              </ControlHintTooltip>
            )}
            {canEnter && !currentDocumentsOpen && (
              <Button
                type="button"
                size="lg"
                variant="outline"
                aria-expanded={false}
                aria-controls="aireq-document-workspace"
                onClick={openDocuments}
                data-aireq-open-agent-documents=""
              >
                <PanelRightOpen className="size-4" aria-hidden="true" />
                {zh ? "查看文档" : "View documents"}
              </Button>
            )}
            {canEnter && <AIReqRequirementMenu group={group} />}
          </div>
        )}
      </header>
      {selectionReady && !canEnter ? (
        <p role="status" className="m-auto p-6 text-ui-base text-foreground-subtle">
          {solutionAccessHint}
        </p>
      ) : session ? (
        <>
          {reviewStatus && (
            <p role="status" className="px-4 py-2 text-ui-sm text-foreground-subtle">
              {reviewStatus}
            </p>
          )}
          <V4PaneConversationProvider
            key={session.sessionId}
            scope={scope}
            sessionId={session.sessionId}
          >
            <AIReqSessionPane
              contentWidthClassName={AIREQ_CONTENT_WIDTH_CLASSNAME}
              paneId="aireq-discussion"
              sessionId={session.sessionId}
              {...scope}
              embedded
              focused={active}
              autoFocusEnabled={false}
              composerTools={({ disabled }) => (
                <ControlHintTooltip
                  title={reviewing ? reviewingLabel : reviewLabel}
                  description={
                    latestVersion === undefined
                      ? zh
                        ? "生成文档后即可发起评审。"
                        : "Create a document to request a review."
                      : zh
                        ? "由独立子代理评审最新文档。"
                        : "An independent subagent reviews the latest documents."
                  }
                >
                  <Button
                    type="button"
                    variant="secondary"
                    aria-disabled={disabled || reviewing || latestVersion === undefined}
                    className="h-7 gap-1 rounded-lg aria-disabled:opacity-60"
                    data-testid="aireq-review-documents"
                    onClick={() => {
                      if (!disabled && !reviewing && latestVersion !== undefined)
                        void requestReview();
                    }}
                  >
                    <ClipboardCheck className="size-4" aria-hidden="true" />
                    {reviewing ? reviewingLabel : reviewLabel}
                  </Button>
                </ControlHintTooltip>
              )}
              composerAriaLabel={zh ? `${agentTitle} 消息` : `${agentTitle} message`}
              composerPlaceholder={
                agent === "requirements"
                  ? zh
                    ? "和需求 Agent 讨论或修改需求"
                    : "Discuss or edit the requirements"
                  : zh
                    ? "和方案 Agent 讨论或修改方案"
                    : "Discuss or edit the solution"
              }
              conversationEmptyState={
                group && agent === "requirements" ? (
                  <div
                    className={`mx-auto space-y-2 py-6 text-ui-base ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}
                  >
                    <p className="font-medium">{zh ? "原始需求" : "Original request"}</p>
                    <blockquote className="max-h-40 overflow-auto overscroll-contain rounded-lg border border-border bg-card px-3 py-2 whitespace-pre-wrap wrap-anywhere">
                      {group.originalText}
                    </blockquote>
                  </div>
                ) : (
                  <p
                    className={`mx-auto py-6 text-ui-base text-foreground-subtle ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}
                  >
                    {zh
                      ? "可让方案 Agent 基于当前需求和项目代码，起草或修改技术方案。"
                      : "Ask the Solution Agent to draft or update the technical solution using the current requirements and project code."}
                  </p>
                )
              }
            />
          </V4PaneConversationProvider>
        </>
      ) : !ai.error ? (
        <div className="m-auto space-y-3 p-6 text-ui-sm text-foreground-subtle">
          <p role="status">{unavailable}</p>
          <Button variant="outline" disabled={ai.pending} onClick={() => void ai.refresh()}>
            {zh ? "重新读取" : "Reload"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
