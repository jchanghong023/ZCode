import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { resolveMrLink } from "./AIReqDocumentPrStatus.js";
import { useAIReq } from "../AIReqContext.js";
import {
  proposalReviewCanRetry,
  proposalState,
  proposalStateLabel,
  type AIReqRequirementGroup,
} from "../contract.js";

export function AIReqProposalRow({ item, zh }: { item: AIReqRequirementGroup; zh: boolean }) {
  const ai = useAIReq()!;
  const state = proposalState(item);
  const needsConfirmation =
    state === "ir-confirmation-pending" || state === "solution-confirmation-pending";
  let actionHint: string | undefined;
  if (needsConfirmation) actionHint = zh ? "需人工确认" : "Human sign-off";
  if (state === "submission-pending") actionHint = zh ? "需人工提交" : "Submit manually";
  const failed =
    (state === "ir-review-pending" && proposalReviewCanRetry(item, false)) ||
    (state === "solution-review-pending" && proposalReviewCanRetry(item, true));
  if (failed)
    actionHint = zh ? "上次评审失败 · 可重试" : "Previous review failed · Retry available";
  if (state === "merge-pending") {
    const untracked = item.proposalDelivery?.mergeCheck?.status === "untracked";
    const external =
      item.requirementsPr?.status === "opened" && Boolean(resolveMrLink(item.requirementsPr.url));
    actionHint = untracked
      ? zh
        ? "需要开始跟踪"
        : "Tracking not started"
      : external
        ? zh
          ? "等待仓库合入"
          : "Awaiting repository merge"
        : zh
          ? "后台跟踪中"
          : "Tracking in background";
  }
  const submittedAt = new Date(item.createdAt);
  const date = (
    <time
      dateTime={item.createdAt}
      title={`${submittedAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} ${zh ? "北京时间" : "Beijing time"}`}
    >
      {submittedAt.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}
    </time>
  );
  return (
    <tr data-aireq-motion-row="" className="group/row border-b border-border/50 hover:bg-hover">
      <td data-aireq-motion-cell="" className="px-4 py-3">
        {/* 项目页用提案名识别对象；列表沿用同一名称，标题和原文共用一个键盘入口。 */}
        <ControlHintTooltip title={item.originalText}>
          <Button
            data-aireq-proposal-entry={item.id}
            variant="link"
            className="h-auto max-w-full flex-col items-start gap-1 whitespace-normal break-words p-0 text-left text-foreground hover:no-underline"
            aria-label={
              zh ? `打开需求工作台：${item.title}` : `Open requirement workspace for ${item.title}`
            }
            onClick={() => ai.select({ projectId: item.projectId, irId: item.id })}
          >
            <span className="flex max-w-full items-baseline gap-1.5 font-semibold group-hover/button:underline">
              <span className="min-w-0 break-words">{item.title}</span>
              <ArrowUpRight
                className="size-3.5 self-start mt-1 text-foreground-subtle group-hover/row:text-foreground"
                aria-hidden="true"
              />
            </span>
            {item.originalText !== item.title && (
              <span className="line-clamp-3 max-w-full whitespace-pre-wrap text-ui-caption text-foreground-subtle group-hover/row:text-foreground">
                {item.originalText}
              </span>
            )}
          </Button>
        </ControlHintTooltip>
        <p className="mt-1 text-ui-sm text-foreground-subtle group-hover/row:text-foreground @min-[640px]/conversation:hidden">
          {item.submittedBy} · {date}
        </p>
      </td>
      <td className="hidden px-4 py-3 text-ui-caption text-foreground-subtle group-hover/row:text-foreground @min-[640px]/conversation:table-cell">
        {item.submittedBy}
      </td>
      <td className="hidden px-4 py-3 text-ui-caption text-foreground-subtle group-hover/row:text-foreground @min-[640px]/conversation:table-cell">
        {date}
      </td>
      <td className="px-4 py-3">
        {proposalStateLabel(item, zh ? "zh-CN" : "en-US")}
        {actionHint && (
          <span
            className={`mt-1 block w-fit max-w-full rounded-sm px-1.5 py-0.5 text-ui-sm font-medium ${failed ? "text-destructive" : "bg-interaction-confirmation-surface text-interaction-confirmation-foreground"}`}
          >
            {actionHint}
          </span>
        )}
      </td>
    </tr>
  );
}
