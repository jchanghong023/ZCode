import { useRef, useState, type ReactNode } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "../shell/pageLayout.js";
import {
  proposalProgressIndex,
  proposalState,
  proposalStateIndex,
  proposalStateLabel,
  PROPOSAL_STATE_OPTIONS,
  proposalViewedIndex,
  requirementsReviewStartBlocker,
  requirementsReviewReadyBlocker,
  hasCurrentProposalSolution,
  fullReviewReadyBlocker,
  proposalDeliveryCurrent,
  proposalVersion,
} from "../contract.js";
import type { AIReqSelection } from "../contract.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqWorkflowTimeline } from "./AIReqWorkflowTimeline.js";
import {
  AIReqProposalDeliveryControls,
  AIReqProposalBackgroundStatus,
} from "./AIReqProposalDeliveryControls.js";
import { AIReqProposalManagement } from "./AIReqProposalManagement.js";
import { AIReqProposalAlignment } from "./AIReqProposalAlignment.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";

const labels = ["业务需求", "原始需求评审", "完整方案与审查", "三方确认与 PR"];
const steps: NonNullable<AIReqSelection["proposalStep"]>[] = [
  "requirements",
  "requirements-review",
  "solution",
  "intake",
];
const perspectives = [
  ["business", "业务"],
  ["development", "开发"],
  ["testing", "测试"],
] as const;

/** 只投影 owner 的门禁；每个按钮仍提交当前版本和实际操作者。 */
export function AIReqPhaseHeader({
  details = null,
  placement = "header",
}: {
  details?: ReactNode;
  placement?: "header" | "document";
}) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [returnOpen, setBack] = useState(false);
  const [returnScope, setReturnScope] = useState("");
  const [returning, setReturning] = useState(false);
  const returnInFlight = useRef(false);
  const [reason, setReason] = useState("");
  const [panel, setPanel] = useState<"info" | "management" | "report">();
  const group = ai.view?.drafts.find(
    (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
  );
  if (!group || !ai.view || ai.selection.srId)
    return placement === "header" ? <>{details}</> : null;
  const scope = `${group.projectId}:${group.id}`;
  const returnScopeMatches = returnScope === scope;
  const stateIndex = proposalStateIndex(group);
  const phase = proposalProgressIndex(group, ai.selection);
  const selected = proposalViewedIndex(group, ai.selection);
  const history = phase !== selected;
  const back = returnOpen && returnScopeMatches && !history;
  const frozen = group.status === "requirements-pr";
  const running = ai.view.running.some(
    (item) => item.projectId === group.projectId && item.irId === group.id,
  );
  const target = { projectId: group.projectId, irId: group.id };
  const originalIssue = requirementsReviewStartBlocker(group);
  const originalReadyIssue = requirementsReviewReadyBlocker(group);
  const fullIssue = hasCurrentProposalSolution(group)
    ? undefined
    : "请先完善全部 SR 的规格、设计、任务和测试方案，以及 IR 整体验收材料。";
  const fullReadyIssue = fullReviewReadyBlocker(group);
  const version = proposalVersion(group);
  const delivery = group.proposalDelivery;
  const pushed = Boolean(
    delivery && proposalDeliveryCurrent(group) && delivery.pushedCandidate === delivery.candidate,
  );
  const mrReady = proposalState(group) === "merge-pending";
  const review = selected === 1 ? group.originalReview : group.review;
  const visiblePanel =
    (panel === "management" && history) || (panel === "report" && !review?.report)
      ? undefined
      : panel;
  const current = () =>
    ai.navigate(() =>
      ai.select({
        ...ai.selection,
        proposalStep: undefined,
        discussionPhase: undefined,
        reviewAgent: undefined,
        materialPath: undefined,
      }),
    );
  if (placement === "header")
    return (
      <header
        // 修复：阶段区与输入框均以讨论面板判定断点，避免滚动槽使阶段区提前切为窄列。
        className="shrink-0 space-y-2 overflow-y-auto border-b border-border py-2 [scrollbar-gutter:stable_both-edges]"
        data-testid="aireq-phase-header"
      >
        {details}
        <section
          className={`mx-auto space-y-1 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}
          aria-label={zh ? "提案业务状态" : "Proposal status"}
          data-testid="aireq-proposal-state"
        >
          <p className="text-center text-ui-sm font-medium" role="status">
            {zh ? "当前状态：" : "Current status: "}
            {proposalStateLabel(group, zh ? "zh-CN" : "en-US")}
          </p>
          {/* 状态取自材料与确认事实；列表只用于定位当前状态，不把点击变成工作流推进。 */}
          <ol className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-ui-xs">
            {PROPOSAL_STATE_OPTIONS.map((option, index) => (
              <li
                key={option.id}
                aria-current={index === stateIndex ? "step" : undefined}
                className={
                  index === stateIndex ? "font-medium text-foreground" : "text-foreground-subtle"
                }
              >
                {zh ? option.title : option.titleEn}
              </li>
            ))}
          </ol>
        </section>
        <p className="text-center text-ui-xs text-foreground-subtle">
          {zh ? "操作环节" : "Work areas"}
        </p>
        <AIReqWorkflowTimeline
          labels={labels}
          phase={phase}
          selected={selected}
          complete={false}
          running={running}
          proposal
          sr={false}
          rounds={[
            group.proposalRound ?? 1,
            group.originalReview?.round ?? 0,
            group.review?.round ?? 0,
            0,
          ]}
          returned={Boolean(group.returnFeedback)}
          canNavigate
          entered={labels.map(
            (_, index) =>
              index <= phase ||
              (index === 1 && Boolean(group.originalReview)) ||
              (index === 2 && group.sessions.some((item) => item.phase === "solution")) ||
              (index === 3 && Boolean(group.proposalDelivery)),
          )}
          onSelect={(index) =>
            ai.navigate(() =>
              ai.select({
                ...ai.selection,
                proposalStep: steps[index],
                discussionPhase: index >= 2 ? "solution" : "requirements",
                reviewAgent: undefined,
                materialPath: undefined,
              }),
            )
          }
          review={selected === 1 ? group.originalReview : undefined}
          reviewAgent={ai.selection.reviewAgent ?? (selected === 1 ? "a" : undefined)}
          canOpenReview={selected === 1}
          onSelectReview={(id) =>
            ai.navigate(() =>
              ai.select({
                ...ai.selection,
                proposalStep: "requirements-review",
                discussionPhase: "requirements",
                reviewAgent: id,
              }),
            )
          }
        />
        <p
          className="text-center text-ui-sm text-foreground-subtle"
          data-testid="aireq-phase-agent"
        >
          {history
            ? "历史环节只读；查看不会运行或恢复批准。"
            : frozen
              ? "文档 PR 已提交，材料冻结；修改前须关闭未合并 PR。"
              : running
                ? "正在处理，请稍候…"
                : `当前操作环节：${labels[phase]}`}
        </p>
      </header>
    );
  return (
    <footer
      className="relative shrink-0 border-t border-border text-ui-sm"
      data-testid="aireq-document-actions"
    >
      <div
        className="overflow-y-auto py-2 [scrollbar-gutter:stable_both-edges]"
        style={{ scrollbarWidth: "thin" }}
      >
        <div
          className={`mx-auto flex items-center gap-2 overflow-x-auto whitespace-nowrap ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}
        >
          {history ? (
            <Button variant="outline" onClick={current}>
              返回当前操作环节
            </Button>
          ) : (
            <>
              {phase === 0 && (
                <Button
                  disabled={ai.pending || running || Boolean(originalIssue)}
                  title={originalIssue}
                  onClick={() => void ai.command({ type: "runRequirementsReview", ...target })}
                >
                  发起原始需求单 Agent 评审
                </Button>
              )}
              {phase === 1 && (
                <Button
                  disabled={ai.pending || running || Boolean(originalReadyIssue)}
                  title={originalReadyIssue}
                  onClick={() =>
                    void ai.command({
                      type: "acceptProposal",
                      ...target,
                      reviewId: group.originalReview?.id,
                      snapshotDigest: group.originalReview?.snapshotDigest,
                    })
                  }
                >
                  人工通过原始需求，进入方案
                </Button>
              )}
              {phase === 2 && (
                <Button
                  disabled={ai.pending || running || Boolean(fullIssue)}
                  title={fullIssue}
                  onClick={() => void ai.command({ type: "runFullReview", ...target })}
                >
                  发起完整材料三审与终审
                </Button>
              )}
              {phase === 3 && (
                <span className="text-foreground-subtle">
                  确认与提交请在当前操作环节工作区完成。
                </span>
              )}
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="更多材料操作">
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!history && phase === 1 && (
                <DropdownMenuItem
                  disabled={ai.pending || running || Boolean(originalIssue)}
                  onSelect={() => void ai.command({ type: "runRequirementsReview", ...target })}
                >
                  重新运行原始需求评审
                </DropdownMenuItem>
              )}
              {!history && phase === 2 && (
                <DropdownMenuItem
                  disabled={ai.pending || running || Boolean(fullReadyIssue)}
                  title={fullReadyIssue}
                  onSelect={() =>
                    void ai.command({
                      type: "approveFullReview",
                      ...target,
                      reviewId: group.review!.id,
                      snapshotDigest: group.review!.snapshotDigest,
                    })
                  }
                >
                  人工通过完整终审
                </DropdownMenuItem>
              )}
              {!history && (phase === 1 || phase === 2) && (
                <DropdownMenuItem
                  disabled={running || returning || ai.pending}
                  onSelect={() => {
                    if (!returnScopeMatches) setReason("");
                    setReturnScope(scope);
                    setBack(true);
                  }}
                >
                  退回业务补充
                </DropdownMenuItem>
              )}
              {!history && frozen && group.proposalDelivery && (
                <DropdownMenuItem
                  onSelect={() =>
                    void ai.command({
                      type: "closeProposalPr",
                      ...target,
                      candidate: group.proposalDelivery!.candidate,
                    })
                  }
                >
                  关闭未合并文档 PR 后修改
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setPanel("info")}>材料状态与说明</DropdownMenuItem>
              {review?.report && (
                <DropdownMenuItem onSelect={() => setPanel("report")}>
                  查看评审报告
                </DropdownMenuItem>
              )}
              {!history && (
                <DropdownMenuItem onSelect={() => setPanel("management")}>
                  联系人与材料修改
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* 修复：联系人与材料修改面板收起后仍需保留草稿，隐藏现有实例而非卸载并重建。 */}
      <section
        hidden={!visiblePanel}
        aria-label="材料补充信息"
        className="absolute right-2 bottom-full left-2 z-40 mx-auto mb-2 max-h-[60vh] max-w-4xl overflow-auto rounded-xl border border-popover-border bg-popover p-4 text-foreground shadow-md"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-medium">
            {visiblePanel === "management"
              ? "联系人与材料修改"
              : visiblePanel === "report"
                ? "评审报告"
                : "材料状态与说明"}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="关闭材料补充信息"
            onClick={() => setPanel(undefined)}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
        {visiblePanel === "info" && (
          <div className="space-y-2">
            {history ? (
              <p>历史环节只读；返回当前操作环节后可继续操作。</p>
            ) : phase === 0 ? (
              <p>{originalIssue ?? "业务材料就绪后先进行单 Agent 评审；通过前不会生成 SR。"}</p>
            ) : phase === 1 ? (
              <p>{originalReadyIssue ?? "阅读业务需求评审意见，由人工通过或退回。"}</p>
            ) : phase === 2 ? (
              <>
                <p>{fullIssue ?? "当前完整包可送三路审查，再由第四 Agent 终审；不会自动授权。"}</p>
                {fullReadyIssue && <p>{fullReadyIssue}</p>}
              </>
            ) : (
              <>
                <p>开发组织三方对齐：三个视角分别绑定同一材料版本，同一工号可分别确认。</p>
                {perspectives.map(([perspective, label]) => {
                  const confirmation = group.alignment?.find(
                    (item) => item.perspective === perspective && item.version === version,
                  );
                  return (
                    <p key={perspective}>
                      {label}视角：
                      {confirmation
                        ? `${confirmation.employeeId} · ${new Date(confirmation.confirmedAt).toLocaleString("zh-CN")}`
                        : "未确认"}
                    </p>
                  );
                })}
                <p>
                  {pushed && mrReady
                    ? "提案分支已推送并自动创建 MR，等待人工评审合并；后台按计划核验。"
                    : pushed
                      ? "提案分支已推送，等待创建当前候选的 MR。"
                      : "方案完成并人工确认当前文档后，平台才创建提案分支；无需个人开发目录。"}
                </p>
              </>
            )}
          </div>
        )}
        {visiblePanel === "report" && review?.report && (
          <div className="space-y-2">
            <p>
              {selected === 1 ? "原始需求单评审" : "完整审查终审"}报告 · 第 {review.round ?? 1} 轮
            </p>
            {/* 同一报告在更多面板也走文档阅读器，避免标题、列表和表格变成原始标记。 */}
            <AIReqMarkdownDocument>{review.report}</AIReqMarkdownDocument>
          </div>
        )}
        {!history && (
          <div hidden={visiblePanel !== "management"}>
            <AIReqProposalManagement
              key={`${group.projectId}:${group.id}`}
              group={group}
              returnDraft={{
                dirty: returnScopeMatches && Boolean(reason),
                busy: returning,
                discard: () => {
                  setReason("");
                  setBack(false);
                },
              }}
            />
          </div>
        )}
      </section>
      {/* 修复：默认弹窗铺满视口且输入区收缩，退回理由需要限宽的多行编辑空间。 */}
      <Dialog
        open={back}
        onOpenChange={(open) => {
          if (!returnInFlight.current) setBack(open);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>退回业务补充</DialogTitle>
            <DialogDescription>
              保留旧材料和意见。业务原文修改后需要重做单评审；任何材料改变均使整包批准失效。
            </DialogDescription>
          </DialogHeader>
          <SettingsFormTextarea
            aria-label="退回原因"
            className="field-sizing-fixed min-h-32"
            rows={6}
            value={reason}
            disabled={returning}
            onChange={(event) => setReason(event.target.value)}
          />
          {/* 失败由共享命令 owner 投影到当前弹框；不关闭弹框或丢弃退回理由。 */}
          {ai.error && (
            <p role="alert" className="text-ui-sm text-destructive">
              {ai.error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={returning} onClick={() => setBack(false)}>
              取消
            </Button>
            <Button
              disabled={!reason.trim() || ai.pending || returning}
              onClick={async () => {
                if (returnInFlight.current) return;
                // 独立锁覆盖命令接纳前的连续点击，提交期间原因不能被编辑或关闭。
                returnInFlight.current = true;
                setReturning(true);
                try {
                  const result = await ai.command({ type: "returnProposal", ...target, reason });
                  if (result?.status === "completed") {
                    setBack(false);
                    setReason("");
                  }
                } finally {
                  returnInFlight.current = false;
                  setReturning(false);
                }
              }}
            >
              确认退回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </footer>
  );
}
export function AIReqDocumentPhaseActions() {
  return <AIReqPhaseHeader placement="document" />;
}
export function AIReqProposalStageBody({
  materialsOpen,
  onOpenMaterials,
}: {
  materialsOpen: boolean;
  onOpenMaterials: () => void;
}) {
  const ai = useAIReq()!;
  const group = ai.view?.drafts.find(
    (item) => item.id === ai.selection.irId && item.projectId === ai.selection.projectId,
  );
  return (
    <main className="@container/conversation min-h-0 flex-1 overflow-auto py-6 text-ui-base [scrollbar-gutter:stable_both-edges]">
      <div className={`mx-auto min-w-0 space-y-6 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
        <h2 className="font-medium">三方确认与文档 PR</h2>
        <p className="text-ui-sm text-foreground-subtle">
          {group?.proposalDelivery?.pushedAt
            ? "材料已提交，等待合入核验。"
            : "先查看当前材料，再完成三个视角的确认并提交文档 PR。"}
        </p>
        {!materialsOpen && (
          <Button variant="outline" onClick={onOpenMaterials}>
            展开需求材料
          </Button>
        )}
        {group && (
          <>
            <AIReqProposalAlignment group={group} />
            <AIReqProposalDeliveryControls group={group} />
            {group.proposalDelivery?.pushedAt && <AIReqProposalBackgroundStatus group={group} />}
          </>
        )}
      </div>
    </main>
  );
}
