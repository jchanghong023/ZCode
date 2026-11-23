import { useRef } from "react";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
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
import { AIReqProposalReturn } from "./AIReqProposalReturn.js";
import { proposalNextTask, proposalTaskStatus, proposalTaskTitles } from "./proposalTasks.js";

const roles = [
  ["business", "业务"],
  ["development", "开发"],
  ["testing", "测试"],
] as const;

export function AIReqProposalDeliveryPage({ group }: { group: AIReqRequirementGroup }) {
  // 前置条件和发布意图读取同一 IR 投影，不根据用户所看的任务阶段推进。
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const heading = useRef<HTMLHeadingElement>(null);
  const state = proposalState(group);
  const submissionPending = state === "submission-pending";
  const irStatus = proposalTaskStatus(group, "requirementsReview");
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
  return (
    <main className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable_both-edges]">
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-6`}>
        <header className="flex flex-wrap items-baseline gap-3">
          <h1 ref={heading} tabIndex={-1} className={AIREQ_PAGE_TITLE_CLASSNAME}>
            交付确认
          </h1>
          <span
            className={`rounded-full border border-border/60 px-2 py-0.5 text-ui-sm ${deliveryStatus === "待提交" ? "text-interaction-confirmation-foreground" : "text-foreground-subtle"}`}
          >
            {deliveryStatus}
          </span>
          {submissionPending && source.capabilities.proposalDiscussion && (
            <div className="ml-auto">
              <AIReqProposalReturn group={group} target="solution" focusFallback={heading} />
            </div>
          )}
        </header>
        {submissionPending && fileCount > 0 ? (
          <p className="text-ui-sm text-foreground-subtle">
            三方已确认当前版本。请核对 {fileCount} 份文件并提交归档。
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
                <dt className="font-medium">需求评审</dt>
                <dd className="text-foreground-subtle">{irStatus}</dd>
              </div>
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
        {submissionPending && (
          <details className="text-ui-sm">
            <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
              查看三方确认记录
            </summary>
            <div className="mt-3">
              <AIReqProposalAlignment group={group} readOnly />
            </div>
          </details>
        )}
      </div>
    </main>
  );
}
