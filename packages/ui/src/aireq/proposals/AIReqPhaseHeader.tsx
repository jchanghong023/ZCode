import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import {
  proposalProgressIndex,
  proposalViewedIndex,
  requirementsReviewStartBlocker,
  requirementsReviewReadyBlocker,
  hasCurrentProposalSolution,
} from "../contract.js";
import type { AIReqSelection } from "../contract.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIReqWorkflowTimeline } from "./AIReqWorkflowTimeline.js";
import {
  AIReqProposalDeliveryControls,
  AIReqProposalBackgroundStatus,
} from "./AIReqProposalDeliveryControls.js";

const labels = ["业务需求", "需求评审", "技术方案", "需求入库"];
const steps: NonNullable<AIReqSelection["proposalStep"]>[] = [
  "requirements",
  "requirements-review",
  "solution",
  "intake",
];

/** 阶段导航只改变本地选择；业务推进必须经服务端命令与版本门禁。 */
export function AIReqPhaseHeader({
  details = null,
  placement = "header",
}: {
  details?: ReactNode;
  placement?: "header" | "document";
}) {
  const aireq = useAIReq()!;
  const source = useAIReqDataSource();
  const [back, setBack] = useState(false);
  const [reason, setReason] = useState("");
  const { view, selection, pending } = aireq;
  const group = view?.drafts.find(
    (item) => item.projectId === selection.projectId && item.id === selection.irId,
  );
  if (!group || !view) return placement === "header" ? <>{details}</> : null;
  if (selection.srId) return null;
  const phase = proposalProgressIndex(group, selection);
  const selected = proposalViewedIndex(group, selection);
  const history = phase !== selected;
  const readOnly = !source.capabilities.proposalDiscussion;
  const running = view.running.some((item) => item.sessionId === aireq.session?.sessionId);
  const target = { projectId: group.projectId, irId: group.id };
  const startIssue = requirementsReviewStartBlocker(group);
  const reviewIssue = requirementsReviewReadyBlocker(group);
  const solution = hasCurrentProposalSolution(group);
  const guidance = history
    ? "正在查看历史，只读；不会发送消息或推进业务。"
    : phase === 0
      ? (startIssue ?? "检查 IR 与全部 SR 规格后，人工发起四路评审。")
      : phase === 1
        ? (reviewIssue ?? "阅读四份当前版本报告，由人工判断通过或退回。")
        : phase === 2
          ? solution
            ? "检查方案、依赖及工期，逐文件确认当前版本。"
            : "请与方案 Agent 对话完善方案、依赖及工期；不会自动生成。"
          : "模拟后台每五秒核验 MR 实际合入与当前文档完整性。";
  const role = [
    "业务需求 Agent",
    group.review?.agents?.find((agent) => agent.id === (selection.reviewAgent ?? "summary"))
      ?.name ?? "综合评审 Agent",
    "方案 Agent",
    "自动 MR · 定时核验",
  ][selected];
  const status = readOnly
    ? "只读查看"
    : history
      ? "历史只读"
      : running
        ? "工作中"
        : phase === 0
          ? group.returnFeedback && !group.returnFeedback.resumedAt
            ? "待业务补充"
            : startIssue
              ? "需求文档待完成"
              : "等待人工确认"
          : phase === 1
            ? (reviewIssue ??
              (group.review?.humanDecision
                ? "已人工通过 · 可进入方案"
                : "综合意见已就绪 · 等待人工判断"))
            : phase === 2
              ? solution
                ? "方案材料已就绪 · 可确认"
                : "与方案 Agent 对话，完善方案、依赖及工期"
              : group.proposalDelivery?.pushedAt
                ? "定时核验合入与文档完整性"
                : "当前版本已确认 · 待提交推送";
  const canBack =
    !history && !readOnly && (phase === 1 || (phase === 2 && group.status !== "requirements-pr"));
  const current = () =>
    aireq.select({
      ...selection,
      proposalStep: undefined,
      discussionPhase: undefined,
      reviewAgent: undefined,
    });
  const action = history ? (
    <Button size="sm" variant="outline" onClick={current}>
      返回当前阶段
    </Button>
  ) : readOnly ? null : phase === 0 ? (
    <Button
      size="sm"
      disabled={pending || running || !!startIssue}
      title={startIssue}
      onClick={() => void aireq.command({ type: "runRequirementsReview", ...target })}
    >
      发起需求评审
    </Button>
  ) : phase === 1 ? (
    selection.reviewAgent && selection.reviewAgent !== "summary" ? (
      <Button
        size="sm"
        variant="outline"
        onClick={() => aireq.select({ ...selection, reviewAgent: "summary" })}
      >
        查看综合意见
      </Button>
    ) : (
      <Button
        size="sm"
        disabled={pending || running || !!reviewIssue}
        title={reviewIssue}
        onClick={() =>
          void aireq.command({
            type: "acceptProposal",
            ...target,
            reviewId: group.review?.id,
            snapshotDigest: group.review?.snapshotDigest,
          })
        }
      >
        通过，进入技术方案
      </Button>
    )
  ) : phase >= 3 || solution ? (
    <AIReqProposalDeliveryControls group={group} compact />
  ) : null;
  if (placement === "header")
    return (
      <header
        className="min-w-0 shrink-0 space-y-1 border-b border-border px-4 py-2"
        data-testid="aireq-phase-header"
      >
        <div className="flex min-w-0 justify-center" data-testid="aireq-phase-toolbar">
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
              group.review?.round ?? 0,
              Math.max(
                0,
                ...group.sessions
                  .filter((item) => item.phase === "solution")
                  .map((item) => item.round),
              ),
              0,
            ]}
            returned={!!group.returnFeedback}
            canNavigate={!readOnly}
            entered={labels.map(
              (_, index) =>
                index <= phase ||
                (index === 1 && !!group.review) ||
                (index === 2 && group.sessions.some((item) => item.phase === "solution")) ||
                (index === 3 && !!group.proposalDelivery),
            )}
            onSelect={(index) =>
              aireq.select({
                ...selection,
                proposalStep: steps[index],
                discussionPhase: index > 1 ? "solution" : "requirements",
                materialPath: undefined,
              })
            }
            review={group.review}
            reviewAgent={selection.reviewAgent}
            canOpenReview={!readOnly}
            onSelectReview={(id) =>
              aireq.select({
                ...selection,
                proposalStep: "requirements-review",
                discussionPhase: "requirements",
                reviewAgent: id,
                materialPath: undefined,
              })
            }
          />
        </div>
        <p
          className={`whitespace-normal break-words text-center text-ui-sm leading-5 ${aireq.error ? "text-destructive" : "text-foreground-subtle"}`}
          title={aireq.error ?? `${role} · ${status}`}
          role={aireq.error ? "alert" : undefined}
          data-testid="aireq-phase-agent"
        >
          {aireq.error ? `操作失败：${aireq.error}` : `${role} · ${status}`}
        </p>
      </header>
    );
  if (readOnly || (!canBack && !action)) return null;
  return (
    <>
      <footer
        className="shrink-0 border-t border-border bg-background px-4 py-3 md:px-6"
        data-testid="aireq-document-actions"
      >
        <div className="mx-auto w-full min-w-0 max-w-[72ch]">
          <p className="mb-2 text-ui-sm text-foreground-subtle">{guidance}</p>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 [&_button]:h-auto [&_button]:max-w-full [&_button]:whitespace-normal">
            {canBack && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending || running}
                onClick={() => {
                  setReason("");
                  setBack(true);
                }}
              >
                {phase === 2 ? "退出方案，退回业务补充" : "返回业务补充"}
              </Button>
            )}
            <div className="ml-auto min-w-0">{action}</div>
          </div>
        </div>
      </footer>
      <Dialog open={back} onOpenChange={setBack}>
        <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>返回业务补充</DialogTitle>
            <DialogDescription>
              保留意见原文及旧评审历史。确认后直接回到业务需求，需通过对话更新 IR／SR 后重新评审。
            </DialogDescription>
          </DialogHeader>
          <SettingsFormTextarea
            autoFocus
            aria-label="需要业务处理的意见"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={12}
            className="min-h-48 max-h-[50dvh] overflow-auto"
          />
          {aireq.error && (
            <p role="alert" className="text-ui-sm text-destructive">
              {aireq.error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBack(false)}>
              取消
            </Button>
            <Button
              disabled={pending || !reason.trim()}
              onClick={async () => {
                const result = await aireq.command({ type: "returnProposal", ...target, reason });
                if (result?.status === "completed") setBack(false);
              }}
            >
              确认退回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function AIReqDocumentPhaseActions() {
  return <AIReqPhaseHeader placement="document" />;
}
export function AIReqProposalStageBody() {
  const aireq = useAIReq()!;
  const group = aireq.view?.drafts.find(
    (item) => item.id === aireq.selection.irId && item.projectId === aireq.selection.projectId,
  );
  return (
    <main className="h-full min-h-0 min-w-0 overflow-auto p-6">
      <section className="mx-auto max-w-3xl space-y-4">
        <h2 className="text-ui-base font-medium">需求入库 · 服务端内存模拟</h2>
        <p className="text-ui-sm text-foreground-subtle">
          平台模拟创建提案分支、提交推送及
          MR；外部合并场景并非人工批准，下一轮后台核验满足全部条件后才转正式需求。
        </p>
        {group && <AIReqProposalBackgroundStatus group={group} />}
      </section>
    </main>
  );
}
