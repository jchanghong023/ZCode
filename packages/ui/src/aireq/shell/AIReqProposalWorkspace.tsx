import { WorkspaceSidePaneToggleButton } from "@/WorkspaceSidePaneToggleButton.js";
import { useLayoutEffect, useRef } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import { getEmployeeId } from "../identity.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import {
  conversationReadOnlyReason,
  fullReviewCurrent,
  hasCurrentProposalSolution,
  hasProjectRole,
  proposalAlignmentCurrent,
  proposalStateLabel,
  requirementsReviewCurrent,
} from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIReqSessionPane } from "../conversation/AIReqSessionPane.js";
import { AIReqProposalDeliveryPage } from "../proposals/AIReqProposalDeliveryPage.js";
import { AIReqRequirementMenu } from "../proposals/AIReqRequirementMenu.js";
import { AIReqProposalOverview } from "../proposals/AIReqProposalOverview.js";
import {
  AIReqProposalMaterialCheck,
  AIReqProposalReviewPage,
} from "../proposals/AIReqProposalReviewPage.js";
import { AIReqAgentModelSummary } from "../proposals/AIReqAgentModelSummary.js";
import { AIReqProposalFeedback } from "../proposals/AIReqProposalFeedback.js";
import { AIReqProposalReviewSubmit } from "../proposals/AIReqProposalReviewSubmit.js";
import { AIReqProposalReturn } from "../proposals/AIReqProposalReturn.js";
import {
  canOpenProposalTask,
  proposalNextTask,
  proposalTaskParent,
  proposalTaskStatus,
  proposalTaskTitles,
} from "../proposals/proposalTasks.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "./pageLayout.js";
import { AIReqRequirementReturnButton } from "./AIReqRequirementNavigation.js";

/** 工作台与任务共享导航 owner；独立 Agent 详情不通过同页标签替换聊天身份。 */
export function AIReqProposalWorkspace({ active }: { active: boolean }) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const { open, activeTab, isOpen, toggle } = useAIReqSidePane();
  const proposal = ai.view?.requirements.find(
    (item) => !item.merge && item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
  );
  const projectId = ai.selection.projectId;
  const employee = getEmployeeId();
  const developer = hasProjectRole(ai.view, projectId, employee, "development");
  const roles = {
    development: developer,
    testing: hasProjectRole(ai.view, projectId, employee, "testing"),
  };
  const task = canOpenProposalTask(ai.proposalTask, roles) ? ai.proposalTask : "overview";
  const detail = task === "requirementsReviewDetail" || task === "solutionReviewDetail";
  const original = task === "requirementsReview" || task === "requirementsReviewDetail";
  const review = original ? proposal?.originalReview : proposal?.review;
  const agent = detail
    ? review?.agents?.find((item) => item.id === ai.selection.reviewAgent)
    : undefined;
  const reviewCurrent = Boolean(
    proposal && (original ? requirementsReviewCurrent(proposal) : fullReviewCurrent(proposal)),
  );
  const alignments = proposal
    ? proposal.alignment?.filter((entry) => proposalAlignmentCurrent(proposal, entry))
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
  const hasMaterials = ai.view?.materials.some(
    (item) => item.projectId === proposal?.projectId && item.irId === proposal?.id,
  );
  const openMaterials = () => {
    if (!proposal || !hasMaterials) return;
    // 材料生成只改变服务端事实，不能挤压正在使用的窄桌面讨论区。
    open({
      kind: "materials",
      selection: ai.selection,
      releaseId: proposal.releaseId,
      title: proposal.title,
    });
  };
  const returning =
    proposal?.returnFeedback &&
    (proposal.returnFeedback.target ?? "requirements") === task &&
    !proposal.returnFeedback.resumedAt;
  const parent = proposalTaskParent(task);
  const next = proposal ? proposalNextTask(proposal) : undefined;
  const reviewTask = original ? ("requirementsReview" as const) : ("solutionReview" as const);
  const reviewStatus = detail && proposal ? proposalTaskStatus(proposal, reviewTask) : undefined;
  const detailStatus =
    detail && agent
      ? agent.status === "failed"
        ? "评审失败"
        : agent.status === "pending"
          ? "等待评审"
          : agent.status === "running"
            ? "评审中"
            : !agent.report.trim()
              ? "报告缺失"
              : reviewStatus === "待人工确认"
                ? "已完成 · 待人工确认"
                : "已完成"
      : undefined;
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
        : headerStatus === "评审失败" || headerStatus === "校验失败" || headerStatus === "报告缺失"
          ? "text-destructive"
          : "text-foreground-subtle";
  const conversationReadOnly = Boolean(
    (detail && (!reviewCurrent || (task === "solutionReviewDetail" && !developer))) ||
    conversationReadOnlyReason(ai.view, ai.selection, source.capabilities),
  );
  const originalReview = proposal?.originalReview;
  // 澄清转为只读即可进入评审，人工确认仍须匹配当前材料与通过的评审。
  const requirementsConfirmation =
    (task === "requirements" || original) &&
    conversationReadOnly &&
    proposal &&
    originalReview?.passed &&
    originalReview.humanDecision?.reviewId === originalReview.id &&
    originalReview.humanDecision.snapshotDigest === originalReview.snapshotDigest &&
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
  else if (task === "delivery")
    content = (
      <AIReqProposalDeliveryPage key={`${proposal.projectId}:${proposal.id}`} group={proposal} />
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
        <div className="shrink-0 max-h-[35%] overflow-y-auto pb-5 [scrollbar-gutter:stable_both-edges]">
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
                  role="status"
                >
                  {headerStatus}
                </span>
              )}
              {conversationReadOnly && (
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-ui-sm text-foreground-subtle">
                  历史阶段 · 只读
                </span>
              )}
            </div>
            {!detail && !conversationReadOnly && (
              <div className="flex flex-wrap items-center gap-2">
                <AIReqProposalReviewSubmit
                  proposal={proposal}
                  kind={task === "requirements" ? "original" : "full"}
                />
                {task === "solution" && (
                  <AIReqProposalReturn
                    key={proposal.id}
                    group={proposal}
                    target="requirements"
                    label="退回业务澄清"
                  />
                )}
              </div>
            )}
          </div>
          {!detail && !conversationReadOnly && (
            <div className={`mx-auto min-w-0 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
              <AIReqProposalMaterialCheck
                compact
                check={
                  task === "requirements" ? proposal.requirementsCheck : proposal.solutionCheck
                }
              />
            </div>
          )}
        </div>
        {conversationReadOnly && (
          <section
            className={`mx-auto w-full min-w-0 max-h-[35%] shrink-0 overflow-auto space-y-3 rounded-lg border border-border/60 bg-card/40 p-4 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}
            aria-label="历史阶段摘要"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <p className="text-ui-sm text-foreground-subtle">
                  本页保留历史讨论，只读；可前往当前阶段继续处理。
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
                {!original && task !== "requirements" && Boolean(alignments?.length) && (
                  <ul className="space-y-1 text-ui-sm text-foreground-subtle">
                    {alignments?.map((entry) => (
                      <li key={entry.perspective}>
                        {
                          { business: "业务", development: "开发", testing: "测试" }[
                            entry.perspective
                          ]
                        }
                        ：{entry.employeeId} 于{" "}
                        {new Date(entry.confirmedAt).toLocaleString("zh-CN", {
                          timeZone: "Asia/Shanghai",
                        })}
                        （北京时间）确认。
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-ui-sm text-foreground-subtle">
                  当前阶段：{proposalStateLabel(proposal)}；材料可在右侧查看。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {next && next !== task && canOpenProposalTask(next, roles) && (
                  <Button onClick={() => ai.openProposalTask(next)}>
                    前往{proposalTaskTitles[next]}
                  </Button>
                )}
                <Button variant="outline" onClick={() => ai.openProposalTask(parent)}>
                  {backLabel}
                </Button>
              </div>
            </div>
          </section>
        )}
        {detail && review && (
          <div
            className={`mx-auto min-w-0 max-h-[25%] shrink-0 overflow-auto ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}
          >
            <p className="text-ui-sm text-foreground-subtle">
              第 {review.round ?? 1} 轮评审 · {review.inputFiles?.length ?? 0} 份材料
            </p>
            <AIReqAgentModelSummary binding={agent?.session.modelConfig} />
          </div>
        )}
        {detail && (
          <div className={`mx-auto min-w-0 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
            <p className="text-ui-sm text-foreground-subtle">
              {conversationReadOnly
                ? `本次审查会话为历史只读，不能继续追问；如需变更材料，请返回${proposalTaskTitles[parent]}或${task === "requirementsReviewDetail" ? "需求澄清" : "方案设计"}。`
                : `追问只追加本次审查会话，不改变材料、报告或人工决定。追问沿用该会话绑定的模型与模式；需要变更材料请返回${proposalTaskTitles[parent]}或${task === "requirementsReviewDetail" ? "需求澄清" : "方案设计"}。`}
            </p>
          </div>
        )}
        {!detail && !conversationReadOnly && (
          <AIReqProposalFeedback openMaterials={hasMaterials ? openMaterials : undefined} />
        )}
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
              autoFocusEnabled={false}
              composerAriaLabel={
                detail ? "审查追问" : task === "requirements" ? "需求澄清消息" : "方案设计消息"
              }
              composerPlaceholder={
                detail
                  ? "追问本次审查（不改变审查结论）"
                  : returning
                    ? task === "requirements"
                      ? proposal.returnFeedback?.reason
                        ? "根据上方退回原因，补充或更正业务规则"
                        : "补充或更正需要重新评审的业务规则"
                      : "根据上方退回原因，修改方案、任务或测试场景"
                    : task === "requirements"
                      ? "补充谁会使用、在什么场景使用，以及期望的结果"
                      : "说明方案思路、实施步骤和测试场景"
              }
              conversationEmptyState={
                !conversationReadOnly && task === "requirements" ? (
                  <div className="mx-auto max-w-xl space-y-2 px-4 py-6 text-ui-base">
                    <p className="font-medium">原始需求</p>
                    <blockquote className="max-h-40 overflow-auto overscroll-contain rounded-lg border border-border bg-card px-3 py-2 whitespace-pre-wrap wrap-anywhere">
                      {proposal.originalText}
                    </blockquote>
                    <p className="text-foreground-subtle">
                      {returning
                        ? "请在下方更新需要重新评审的业务规则。"
                        : "请补充一个真实场景。谁会在什么情况下使用它，想完成什么？"}
                    </p>
                  </div>
                ) : (
                  <div className="p-6 text-center text-ui-sm text-foreground-subtle">
                    <p>尚无讨论记录。</p>
                    {!conversationReadOnly && task === "solution" && (
                      <p className="mt-1">
                        {hasCurrentProposalSolution(proposal)
                          ? "可在右侧查看已生成的方案，在下方继续讨论。"
                          : "在下方讨论技术方案、实施拆分和测试用例。生成方案材料并通过校验后即可送审。"}
                      </p>
                    )}
                  </div>
                )
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
              <span className="hidden @min-[400px]/conversation:inline">{backLabel}</span>
            </Button>
          </ControlHintTooltip>
        )}
        <span className="min-w-0 flex-1 truncate text-ui-sm font-medium" title={proposal?.title}>
          {task === "overview" ? "需求工作台" : (proposal?.title ?? "需求工作台")}
        </span>
        {proposal && <AIReqRequirementMenu key={proposal.id} group={proposal} />}
        {task !== "overview" && ai.selectionReady && hasMaterials && (
          <Button size="sm" variant="ghost" className="shrink-0" onClick={openMaterials}>
            <FileText className="size-4" aria-hidden="true" /> 查看材料
          </Button>
        )}
        {task !== "overview" && !isOpen && activeTab && (
          <WorkspaceSidePaneToggleButton isSidePaneOpen={false} onToggleSidePane={toggle} />
        )}
      </div>
      {content}
    </div>
  );
}
