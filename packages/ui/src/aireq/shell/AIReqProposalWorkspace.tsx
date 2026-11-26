import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ClipboardCheck, PanelRightOpen } from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import { useAIReq } from "../AIReqContext.js";
import { releaseIRTitle } from "../projects/releaseOverviewData.js";
import { AIReqSessionPane } from "../conversation/AIReqSessionPane.js";
import { useAIReqDataSource } from "../data-source.js";
import { useAIReqSplitToolbar } from "../side-pane/useAIReqSplitToolbar.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import { AIReqRequirementReturnButton } from "./AIReqRequirementNavigation.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "./pageLayout.js";

export function AIReqProposalWorkspace({ active }: { active: boolean }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const source = useAIReqDataSource();
  const { activeTab, tabs, isOpen, open, activate, expand, collapse } = useAIReqSidePane();
  const { projectId, irId, srId, discussionPhase: agent = "requirements" } = ai.selection;
  const group = ai.view?.requirements.find(
    (item) => item.projectId === projectId && item.id === irId,
  );
  const canEnter = group?.sessions.some((session) => session.phase === agent) ?? false;
  const alternateAgent = agent === "requirements" ? "solution" : "requirements";
  const canSwitchAgent =
    group?.sessions.some((session) => session.phase === alternateAgent) ?? false;
  const agentLabels = {
    requirements: zh ? "需求 Agent" : "Requirements Agent",
    solution: zh ? "方案 Agent" : "Solution Agent",
  };
  const agentTitle = agentLabels[agent];
  const projectName = ai.view?.projects.find((project) => project.id === projectId)?.name;
  const releaseName = group?.releaseId
    ? ai.view?.releases.find(
        (release) => release.projectId === projectId && release.id === group.releaseId,
      )?.title
    : zh
      ? "未分配版本"
      : "Unassigned";
  const irTitle = group && (releaseIRTitle(group.title, releaseName ?? "") || group.title);
  const contextTitle = [projectName, releaseName].filter(Boolean).join(" / ");
  const alternateLabel = zh
    ? `切换到${agentLabels[alternateAgent]}`
    : `Switch to the ${agentLabels[alternateAgent]}`;
  const documentLayout = useRef<"initial" | "waiting" | "settled">("initial");
  const hasDocuments =
    ai.view?.materials.some((file) => file.projectId === projectId && file.irId === irId) ?? false;
  const toolbarRef = useAIReqSplitToolbar("chat");
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
      releaseId === undefined ||
      !title ||
      documentLayout.current === "settled"
    )
      return;
    // 首个文档随服务端投影出现；手动打开原文、文档或随后收起均优先于自动布局。
    if (!hasDocuments) {
      if (documentLayout.current === "initial") collapse();
      documentLayout.current = "waiting";
      return;
    }
    documentLayout.current = "settled";
    open({
      selection: { projectId, irId, srId, discussionPhase: agent },
      releaseId,
      title,
    });
  }, [
    selectionReady,
    canEnter,
    projectId,
    irId,
    srId,
    releaseId,
    title,
    agent,
    open,
    collapse,
    hasDocuments,
  ]);
  const currentDocumentsSelected =
    !!activeTab &&
    activeTab.kind !== "original" &&
    activeTab.selection.projectId === projectId &&
    activeTab.selection.irId === irId;
  const currentDocumentsOpen = isOpen && currentDocumentsSelected;
  useLayoutEffect(() => {
    if (!isOpen || !focusOpenedDocuments.current) return;
    focusOpenedDocuments.current = false;
    document
      .querySelector<HTMLElement>("#aireq-document-workspace [role='tab'][aria-selected='true']")
      ?.focus();
  }, [activeTab, isOpen]);
  const openDocuments = (kind?: "original") => {
    if (!group) return;
    documentLayout.current = "settled";
    focusOpenedDocuments.current = true;
    const existing = tabs.find(
      (tab) =>
        tab.kind === kind &&
        tab.selection.projectId === group.projectId &&
        tab.selection.irId === group.id &&
        tab.releaseId === group.releaseId &&
        tab.selection.srId === srId,
    );
    if (existing) {
      activate(existing.id);
      expand();
      if (isOpen && existing.id === activeTab?.id) {
        focusOpenedDocuments.current = false;
        document.getElementById(`aireq-tab-${existing.id}`)?.focus();
      }
      return;
    }
    open({
      kind,
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
  const switchAgentButton = canEnter && canSwitchAgent && group && (
    <Button
      type="button"
      size="lg"
      variant="outline"
      onClick={() => {
        // 沿用工作台导航和回焦，仅改变会话阶段，保留同一需求及文档定位。
        ai.navigate(() =>
          ai.select({
            projectId: group.projectId,
            irId: group.id,
            srId,
            discussionPhase: alternateAgent,
          }),
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
        ref={toolbarRef}
        data-testid="aireq-agent-toolbar"
      >
        <AIReqRequirementReturnButton />
        <div className="min-w-0 flex-1 basis-36">
          <h1
            className="line-clamp-2 wrap-anywhere text-ui-lg font-semibold leading-tight"
            title={group?.title}
          >
            {irTitle || irId || agentTitle}
          </h1>
          {group && (
            <p className="truncate text-ui-caption text-foreground-subtle" title={contextTitle}>
              {contextTitle}
            </p>
          )}
        </div>
        {selectionReady && group && (
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
            {canEnter && (
              <Button variant="ghost" size="sm" onClick={() => openDocuments("original")}>
                {zh ? "查看云龙原文" : "View original IR"}
              </Button>
            )}
            {switchAgentButton}
            {canEnter && !currentDocumentsOpen && (
              <Button
                type="button"
                size="lg"
                variant="outline"
                aria-expanded={false}
                aria-controls="aireq-document-workspace"
                onClick={() => openDocuments()}
                data-aireq-open-agent-documents=""
              >
                <PanelRightOpen className="size-4" aria-hidden="true" />
                {hasDocuments
                  ? zh
                    ? "查看文档"
                    : "View documents"
                  : zh
                    ? agent === "solution"
                      ? "方案文档 · 暂无"
                      : "需求文档 · 暂无"
                    : "Documents · none yet"}
              </Button>
            )}
          </div>
        )}
      </header>
      {selectionReady && !canEnter ? (
        <p role="status" className="m-auto p-6 text-ui-base text-foreground-subtle">
          {zh
            ? "当前需求没有可访问的此类会话。"
            : "This discussion is unavailable for the selected requirement."}
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
              // 收起文档跨过宽屏断点时，进度摘要不能为右侧让位而把消息和输入器向左推。
              summaryPanelPlacement="above-content"
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
                    <p className="text-foreground-subtle">
                      {zh
                        ? "请举一次实际操作，说明输入是什么、预期得到什么结果。"
                        : "Describe one real example. What is the input and what result do you expect?"}
                    </p>
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
