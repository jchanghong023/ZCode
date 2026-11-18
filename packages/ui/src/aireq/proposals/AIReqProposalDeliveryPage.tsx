import { useRef } from "react";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import {
  fullReviewReadyBlocker,
  proposalAlignmentCurrent,
  proposalDeliveryCurrent,
  proposalState,
  type AIReqRequirementGroup,
} from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { AIReqProposalAlignment } from "./AIReqProposalAlignment.js";
import { AIReqProposalDeliveryControls } from "./AIReqProposalDeliveryControls.js";
import { proposalNextTask, proposalTaskStatus, proposalTaskTitles } from "./proposalTasks.js";

const roles = [
  ["business", "业务"],
  ["development", "开发"],
  ["testing", "测试"],
] as const;

export function AIReqProposalDeliveryPage({ group }: { group: AIReqRequirementGroup }) {
  // 前置条件和发布意图读取同一 IR 投影，不根据用户所看的任务阶段推进。
  const ai = useAIReq()!;
  const heading = useRef<HTMLHeadingElement>(null);
  const state = proposalState(group);
  const mergePending = state === "merge-pending";
  const submissionPending = state === "submission-pending";
  const reviewReady = !fullReviewReadyBlocker(group);
  const version = group.review?.round ? `第 ${group.review.round} 轮` : "未记录";
  const fileCount = proposalDeliveryCurrent(group)
    ? (group.proposalDelivery?.files.length ?? 0)
    : 0;
  const awaitingRoles = roles.filter(
    ([role]) =>
      !group.alignment?.some(
        (entry) => entry.perspective === role && proposalAlignmentCurrent(group, entry),
      ),
  );
  const next = proposalNextTask(group);
  const deliveryStatus = proposalTaskStatus(group, "delivery");
  const history = group.proposalDeliveryHistory ?? [];
  return (
    <main className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable_both-edges]">
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-6`}>
        <header className="flex flex-wrap items-baseline gap-3">
          <h1 ref={heading} tabIndex={-1} className={AIREQ_PAGE_TITLE_CLASSNAME}>
            交付确认
          </h1>
          <span
            className={`rounded-full border border-border/60 px-2 py-0.5 text-ui-sm ${deliveryStatus === "提交失败" ? "text-destructive" : "text-interaction-confirmation-foreground"}`}
          >
            {deliveryStatus}
          </span>
        </header>
        {mergePending ? (
          <p className="text-ui-sm text-foreground-subtle">
            当前材料已冻结。文档 PR 合入并通过完整核验后，此需求自动转正。
          </p>
        ) : submissionPending && fileCount > 0 ? (
          <p className="text-ui-sm text-foreground-subtle">
            三方已确认当前版本。请核对 {fileCount} 份文件并提交文档 PR。
          </p>
        ) : (
          <section className="space-y-3" aria-label="前置条件">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-ui-base font-medium">前置条件</h2>
              <p className="text-ui-sm text-foreground-subtle">
                当前版本：{version} · {group.files.length} 份材料
              </p>
            </div>
            <dl className="divide-y divide-border/50 text-ui-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <dt className="font-medium">方案审查</dt>
                <dd className="text-foreground-subtle">
                  {reviewReady
                    ? "三路审查与综合报告已齐备"
                    : proposalTaskStatus(group, "solutionReview")}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <dt className="font-medium">三方确认</dt>
                <dd className="text-foreground-subtle">
                  {awaitingRoles.length
                    ? `待确认：${awaitingRoles.map(([, label]) => label).join("、")}`
                    : "全部确认"}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <dt className="font-medium">文件清单</dt>
                <dd className="text-foreground-subtle">
                  {fileCount ? `${fileCount} 份文件` : "当前版本的交付清单尚未就绪"}
                </dd>
              </div>
            </dl>
            {next !== "delivery" ? (
              <Button onClick={() => ai.openProposalTask(next)}>
                前往{proposalTaskTitles[next]}
              </Button>
            ) : (
              <Button variant="outline" disabled={ai.pending} onClick={() => void ai.refresh()}>
                重新读取交付清单
              </Button>
            )}
          </section>
        )}
        <AIReqProposalDeliveryControls group={group} focusFallback={heading} />
        {(mergePending || submissionPending) && (
          <details className="text-ui-sm">
            <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
              查看三方确认记录
            </summary>
            <div className="mt-3">
              <AIReqProposalAlignment group={group} readOnly />
            </div>
          </details>
        )}
        {history.length > 0 && (
          <details className="space-y-3 border-t border-border/50 pt-4 text-ui-sm">
            <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
              历史交付记录 · 只读
            </summary>
            <ul className="divide-y divide-border/50">
              {history.map((entry) => (
                <li key={entry.candidate} className="space-y-1 py-3">
                  <p>
                    {entry.closedPr?.number === undefined
                      ? "旧候选"
                      : `文档 PR #${entry.closedPr.number} · 已关闭`}{" "}
                    · {entry.files.length} 份文件
                  </p>
                  <p className="break-all font-mono text-foreground-subtle">{entry.candidate}</p>
                  {entry.publishError && (
                    <p className="break-words text-foreground-subtle">
                      {entry.publishError.message}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </main>
  );
}
