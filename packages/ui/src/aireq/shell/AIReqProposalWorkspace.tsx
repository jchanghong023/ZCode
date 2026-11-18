import { WorkspaceSidePaneToggleButton } from "@/WorkspaceSidePaneToggleButton.js";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import {
  conversationReadOnlyReason,
  proposalStateLabel,
  requirementsReviewCurrent,
} from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIReqSessionPane } from "../conversation/AIReqSessionPane.js";
import { AIReqProposalStageBody } from "../proposals/AIReqPhaseHeader.js";
import { AIReqRequirementMenu } from "../proposals/AIReqRequirementMenu.js";
import { AIReqProposalOverview } from "../proposals/AIReqProposalOverview.js";
import { AIReqProposalReviewPage } from "../proposals/AIReqProposalReviewPage.js";
import { AIReqProposalManagement } from "../proposals/AIReqProposalManagement.js";
import { AIReqProposalFeedback } from "../proposals/AIReqProposalFeedback.js";
import {
  proposalNextTask,
  proposalTaskParent,
  proposalTaskStatus,
  proposalTaskTitles,
} from "../proposals/proposalTasks.js";
import {
  AIREQ_CONTENT_WIDTH_CLASSNAME,
  AIREQ_PAGE_CONTENT_CLASSNAME,
  AIREQ_PAGE_TITLE_CLASSNAME,
} from "./pageLayout.js";
import { AIReqRequirementReturnButton } from "./AIReqRequirementNavigation.js";

/** 工作台与任务共享导航 owner；独立 Agent 详情不通过同页标签替换聊天身份。 */
export function AIReqProposalWorkspace({ active }: { active: boolean }) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const { open, activeTab, isOpen, toggle } = useAIReqSidePane();
  const proposal = ai.view?.drafts.find(
    (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
  );
  const task = ai.proposalTask;
  const detail = task === "requirementsReviewDetail" || task === "solutionReviewDetail";
  const conversation = task === "requirements" || task === "solution" || detail;
  const original = task === "requirementsReview" || task === "requirementsReviewDetail";
  const review = original ? proposal?.originalReview : proposal?.review;
  const agent = detail
    ? review?.agents?.find((item) => item.id === ai.selection.reviewAgent)
    : undefined;
  const workspace = source.resolveWorkspace(ai.view, ai.selection);
  const scope = { workspacePath: workspace.path ?? "", workspaceIdentity: workspace.identity };
  const root = useRef<HTMLDivElement>(null);
  const scrollMemory = useRef(new Map<string, number>());
  const routeKey = JSON.stringify([
    ai.selection.projectId,
    ai.releaseId,
    ai.selection.irId,
    task,
    ai.selection.reviewAgent,
  ]);
  useLayoutEffect(() => {
    const main = root.current?.querySelector("main");
    if (main && ai.selectionReady) main.scrollTop = scrollMemory.current.get(routeKey) ?? 0;
  }, [routeKey, ai.selectionReady]);
  const openedTarget = useRef("");
  useEffect(() => {
    if (!conversation || !ai.selectionReady || !proposal) return;
    const key = JSON.stringify([proposal.projectId, proposal.id, proposal.releaseId, ai.selection]);
    if (openedTarget.current === key) return;
    openedTarget.current = key;
    open(
      {
        kind: "materials",
        selection: ai.selection,
        releaseId: proposal.releaseId,
        title: proposal.title,
      },
      { ifAbsent: true },
    );
  }, [conversation, ai.selectionReady, ai.selection, proposal, open]);
  const managementReturn = useMemo(() => ({ dirty: false, busy: false, discard: () => {} }), []);
  const openMaterials = () => {
    if (proposal && ai.selectionReady)
      open({
        kind: "materials",
        selection: ai.selection,
        releaseId: proposal.releaseId,
        title: proposal.title,
      });
  };
  const parent = proposalTaskParent(task);
  const reviewTask = original ? ("requirementsReview" as const) : ("solutionReview" as const);
  const reviewStatus = detail && proposal ? proposalTaskStatus(proposal, reviewTask) : undefined;
  const detailStatus =
    detail && reviewStatus === "待人工确认" ? "已完成 · 待人工确认" : reviewStatus;
  const backLabel =
    parent === "overview"
      ? "返回需求工作台"
      : detail && reviewStatus === "待人工确认"
        ? `返回${proposalTaskTitles[parent]}确认`
        : `返回${proposalTaskTitles[parent]}`;
  const stageStatus =
    proposal && (task === "requirements" || task === "solution")
      ? proposalTaskStatus(proposal, task)
      : undefined;
  const headerStatus = detailStatus ?? stageStatus;
  const headerStatusTone =
    headerStatus === "已确认"
      ? "text-success"
      : headerStatus?.includes("待人工确认")
        ? "text-interaction-confirmation-foreground"
        : headerStatus === "评审失败"
          ? "text-destructive"
          : headerStatus === "有待处理问题"
            ? "text-warning"
            : "text-foreground-subtle";
  const conversationReadOnly = Boolean(
    conversationReadOnlyReason(ai.view, ai.selection, source.capabilities),
  );
  const originalReview = proposal?.originalReview;
  // 澄清转为只读即可进入评审，人工确认仍须匹配当前材料与通过的评审。
  const requirementsConfirmation =
    task === "requirements" &&
    conversationReadOnly &&
    proposal &&
    originalReview?.passed &&
    originalReview.humanDecision?.reviewId === originalReview.id &&
    requirementsReviewCurrent(proposal)
      ? originalReview.humanDecision
      : undefined;
  let content;
  if (!ai.selectionReady || !proposal)
    content = (
      <div className="m-auto space-y-3 p-6 text-ui-sm text-foreground-subtle">
        <p role={ai.error ? "alert" : "status"}>
          {ai.error || (ai.pending ? "正在读取需求…" : "需求暂不可用，请重新读取。")}
        </p>
        <Button variant="outline" disabled={ai.pending} onClick={() => void ai.refresh()}>
          重新读取
        </Button>
      </div>
    );
  else if (task === "overview") content = <AIReqProposalOverview group={proposal} />;
  else if (task === "requirementsReview" || task === "solutionReview")
    content = (
      <AIReqProposalReviewPage
        key={`${proposal.projectId}:${proposal.id}:${task}`}
        group={proposal}
        full={!original}
      />
    );
  else if (task === "delivery") content = <AIReqProposalStageBody />;
  else if (task === "management")
    content = (
      <main
        className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]"
        data-testid="proposal-management-page"
      >
        <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-6`}>
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>管理需求</h1>
          <AIReqProposalManagement
            key={`${proposal.projectId}:${proposal.id}`}
            group={proposal}
            returnDraft={managementReturn}
          />
          {proposal.status === "requirements-pr" && proposal.proposalDelivery && (
            <Button
              variant="outline"
              disabled={ai.pending}
              onClick={() =>
                void ai.command({
                  type: "closeProposalPr",
                  projectId: proposal.projectId,
                  irId: proposal.id,
                  candidate: proposal.proposalDelivery!.candidate,
                })
              }
            >
              关闭未合并 MR 后修改
            </Button>
          )}
        </div>
      </main>
    );
  else if (detail && !agent)
    content = (
      <div className="m-auto space-y-3 p-6 text-ui-sm">
        <p role="status">该评审记录暂不可用，请返回汇总查看当前审查。</p>
        <Button variant="outline" onClick={() => ai.openProposalTask(parent)}>
          {backLabel}
        </Button>
      </div>
    );
  else
    content = (
      <>
        <div className="shrink-0 overflow-y-auto pb-5 [scrollbar-gutter:stable_both-edges]">
          <div
            className={`mx-auto flex min-w-0 flex-wrap items-center justify-between gap-3 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}
          >
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>
                {detail && agent ? (
                  <>
                    {agent.name}
                    <span className="whitespace-nowrap"> · 审查会话</span>
                  </>
                ) : (
                  (agent?.name ?? proposalTaskTitles[task])
                )}
              </h1>
              {headerStatus && (
                <span
                  className={`rounded-full border border-border/60 px-2 py-0.5 text-ui-sm ${headerStatusTone}`}
                  title={
                    task === "requirements"
                      ? "需求材料已整理；评审通过后才会标记为已确认"
                      : undefined
                  }
                >
                  {headerStatus}
                </span>
              )}
              {!detail && conversationReadOnly && (
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-ui-sm text-foreground-subtle">
                  历史阶段 · 只读
                </span>
              )}
            </div>
            {!detail && !(task === "requirements" && conversationReadOnly) && (
              <Button
                variant="outline"
                onClick={() =>
                  ai.openProposalTask(
                    task === "requirements" ? "requirementsReview" : "solutionReview",
                  )
                }
              >
                {task === "requirements" ? "前往需求评审" : "前往方案审查"}
              </Button>
            )}
          </div>
        </div>
        {task === "requirements" && conversationReadOnly && proposal && (
          <section
            className={`mx-auto w-full min-w-0 space-y-3 rounded-lg border border-border/60 bg-card/40 p-4 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}
            aria-label="历史澄清记录"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <p className="text-ui-sm text-foreground-subtle">
                  本页保留此前的需求澄清记录，可前往当前阶段继续处理。
                </p>
                <div>
                  <p className="text-ui-sm font-medium">原始需求</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-ui-sm text-foreground-subtle">
                    {proposal.originalText || "尚未记录原始需求。"}
                  </p>
                </div>
                {requirementsConfirmation && (
                  <p className="text-ui-sm text-foreground-subtle">
                    {requirementsConfirmation.employeeId} 于{" "}
                    {new Date(requirementsConfirmation.decidedAt).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}{" "}
                    确认了业务需求。
                  </p>
                )}
                <p className="text-ui-sm text-foreground-subtle">
                  当前阶段：{proposalStateLabel(proposal)}；澄清材料可在右侧查看。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => ai.openProposalTask(proposalNextTask(proposal))}>
                  前往{proposalTaskTitles[proposalNextTask(proposal)]}
                </Button>
                <Button variant="outline" onClick={() => ai.openProposalTask("overview")}>
                  返回工作台
                </Button>
              </div>
            </div>
          </section>
        )}
        {detail && review && (
          <div className={`mx-auto min-w-0 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
            <p className="text-ui-sm text-foreground-subtle">
              第 {review.round ?? 1} 轮评审 · {review.inputFiles?.length ?? 0} 份材料 ·{" "}
              {review.findings?.some((finding) => finding.level === "blocking")
                ? "存在阻断项，请返回汇总查看"
                : "未记录阻断项"}
            </p>
          </div>
        )}
        {detail && (
          <div className={`mx-auto min-w-0 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
            <p className="text-ui-sm text-foreground-subtle">
              {conversationReadOnly
                ? `本次审查会话为历史只读，不能继续追问；如需变更材料，请返回${proposalTaskTitles[parent]}或${task === "requirementsReviewDetail" ? "需求澄清" : "方案设计"}。`
                : `追问只追加本次审查会话，不改变材料、报告或人工决定。模型与模式只作用于本次追问；需要变更材料请返回${proposalTaskTitles[parent]}或${task === "requirementsReviewDetail" ? "需求澄清" : "方案设计"}。`}
            </p>
          </div>
        )}
        {task === "requirements" && <AIReqProposalFeedback />}
        {ai.selection.srId ? (
          <div className="space-y-3 p-6 text-ui-sm text-foreground-subtle">
            <p>SR 规格为只读材料，方案讨论在所属需求进行。</p>
            <Button variant="outline" onClick={() => ai.openProposalTask("solution")}>
              返回需求方案设计
            </Button>
          </div>
        ) : ai.session ? (
          <V4PaneConversationProvider scope={scope} sessionId={ai.session.sessionId}>
            <AIReqSessionPane
              contentWidthClassName={AIREQ_CONTENT_WIDTH_CLASSNAME}
              paneId="aireq-proposal"
              sessionId={ai.session.sessionId}
              {...scope}
              readOnly={conversationReadOnly}
              embedded
              focused={active}
              composerPlaceholder={detail ? "追问本次审查（不改变审查结论）" : undefined}
              hideMessageFeedback={detail}
              conversationEmptyState={
                <div className="p-6 text-center text-ui-sm text-foreground-subtle">
                  <p>尚无讨论记录。</p>
                  {!conversationReadOnly && (task === "solution" || task === "requirements") && (
                    <p className="mt-1">
                      {task === "solution"
                        ? "当前技术方案在右侧“需求材料”中。"
                        : "整理后的需求在右侧“需求材料”中。"}
                    </p>
                  )}
                  {!conversationReadOnly && (task === "solution" || task === "requirements") && (
                    <p className="mt-1">
                      {task === "solution"
                        ? "可在下方继续与 AI 讨论。"
                        : "可在下方继续与 AI 澄清需求。"}
                    </p>
                  )}
                </div>
              }
            />
          </V4PaneConversationProvider>
        ) : (
          <div className="m-auto space-y-3 p-6 text-ui-sm text-foreground-subtle">
            <p role="status">当前会话暂不可用，可重新读取或返回工作台。</p>
            <Button variant="outline" onClick={() => void ai.refresh()}>
              重新读取
            </Button>
          </div>
        )}
      </>
    );
  return (
    <div
      ref={root}
      className="@container/conversation flex h-full min-h-0 flex-col overflow-hidden bg-background"
      data-testid="proposal-task-workspace"
      data-proposal-task={task}
      onScrollCapture={(event) => {
        if (
          ai.selectionReady &&
          event.target instanceof HTMLElement &&
          event.target.tagName === "MAIN"
        ) {
          if (scrollMemory.current.size > 128)
            scrollMemory.current.delete(scrollMemory.current.keys().next().value!);
          scrollMemory.current.set(routeKey, event.target.scrollTop);
        }
      }}
    >
      <div
        className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b border-border/50 px-3"
        data-testid="aireq-proposal-toolbar"
      >
        {task === "overview" ? (
          <AIReqRequirementReturnButton />
        ) : (
          <ControlHintTooltip title={backLabel}>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              aria-label={backLabel}
              onClick={() => ai.openProposalTask(parent)}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {backLabel}
            </Button>
          </ControlHintTooltip>
        )}
        <span className="min-w-0 flex-1 truncate text-ui-sm font-medium" title={proposal?.title}>
          {task === "overview" ? "需求工作台" : (proposal?.title ?? "需求工作台")}
        </span>
        {proposal && <AIReqRequirementMenu key={proposal.id} group={proposal} />}
        {task !== "overview" && (
          <ControlHintTooltip title="查看需求材料">
            <Button
              variant="ghost"
              size="icon-md"
              aria-label="查看需求材料"
              disabled={!proposal || !ai.selectionReady}
              onClick={openMaterials}
            >
              <FileText className="size-4" aria-hidden="true" />
            </Button>
          </ControlHintTooltip>
        )}
        {task !== "overview" && !isOpen && activeTab && (
          <WorkspaceSidePaneToggleButton isSidePaneOpen={false} onToggleSidePane={toggle} />
        )}
      </div>
      {content}
    </div>
  );
}
