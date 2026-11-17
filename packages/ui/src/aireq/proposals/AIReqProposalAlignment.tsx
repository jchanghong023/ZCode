import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import {
  alignmentBlocker,
  fullReviewReadyBlocker,
  proposalProgressIndex,
  proposalVersion,
  proposalViewedIndex,
} from "../contract.js";
import type { AIReqRequirementGroup } from "../contract.js";

const perspectives = [
  ["business", "业务", "Business"],
  ["development", "开发", "Development"],
  ["testing", "测试", "Testing"],
] as const;

/** 三方确认只读取同版服务端事实；阶段主体与提交共用原有命令入口。 */
export function AIReqProposalAlignment({ group }: { group: AIReqRequirementGroup }) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const version = proposalVersion(group);
  const history =
    proposalProgressIndex(group, ai.selection) !== 3 ||
    proposalViewedIndex(group, ai.selection) !== 3;
  const frozen = group.status === "requirements-pr";
  const reviewBlocker =
    fullReviewReadyBlocker(group) ??
    (!group.review?.passed || group.review.humanDecision?.reviewId !== group.review.id
      ? zh
        ? "完整审查完成后仍需人工放行。"
        : "Human approval is required after the full review."
      : undefined);
  const blocker = alignmentBlocker(group);
  const pending =
    ai.pending ||
    ai.view?.running.some((item) => item.projectId === group.projectId && item.irId === group.id);
  return (
    <section
      className="space-y-3"
      aria-label={zh ? "当前材料三方确认" : "Confirm the current materials"}
      data-testid="proposal-alignment"
    >
      <div className="space-y-1">
        <h3 className="text-ui-base font-medium">
          {zh ? "当前材料确认" : "Confirm current materials"}
        </h3>
        <p className="text-ui-sm text-foreground-subtle">
          {zh
            ? "业务、开发和测试分别确认同一完整材料版本；同一人可以兼任。材料变化后需要重新确认。"
            : "Business, development and testing confirm the same material version. One person may cover multiple perspectives. Changes require new confirmations."}
        </p>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
        {perspectives.map(([perspective, label, labelEn]) => {
          // 旧版本的确认不计入当前结果，不能因重新组织页面而恢复旧批准。
          const confirmation = group.alignment?.find(
            (item) => item.perspective === perspective && item.version === version,
          );
          const Icon = confirmation ? CheckCircle2 : Circle;
          return (
            <li
              key={perspective}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 items-start gap-2">
                <Icon
                  aria-hidden="true"
                  className={`mt-0.5 size-4 shrink-0 ${confirmation ? "text-success" : "text-foreground-subtle"}`}
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-ui-base font-medium">{zh ? `${label}视角` : labelEn}</p>
                  <p className="break-words text-ui-sm text-foreground-subtle">
                    {confirmation
                      ? `${zh ? "已确认" : "Confirmed"} · ${confirmation.employeeId} · ${new Date(confirmation.confirmedAt).toLocaleString(locale, { timeZone: "Asia/Shanghai" })}`
                      : zh
                        ? "待确认当前版本"
                        : "Awaiting confirmation of this version"}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  history ||
                  frozen ||
                  Boolean(pending) ||
                  Boolean(confirmation) ||
                  Boolean(reviewBlocker) ||
                  !source.capabilities.proposalDiscussion
                }
                onClick={() =>
                  void ai.command({
                    type: "confirmAlignment",
                    projectId: group.projectId,
                    irId: group.id,
                    perspective,
                    version,
                  })
                }
              >
                {confirmation
                  ? zh
                    ? "已确认"
                    : "Confirmed"
                  : zh
                    ? `确认${label}视角`
                    : `Confirm ${labelEn.toLowerCase()}`}
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="text-ui-sm text-foreground-subtle" role="status">
        {history
          ? zh
            ? "历史环节只读，请返回当前操作环节继续处理。"
            : "This historical stage is read-only. Return to the current stage to continue."
          : frozen
            ? zh
              ? "文档 PR 已提交，当前材料冻结，等待人工合入与后台核验。"
              : "The document PR is submitted. Materials are frozen pending merge and verification."
            : blocker
              ? `${zh ? "提交前还需：" : "Before submission: "}${blocker}`
              : zh
                ? "三个视角已确认当前版本，可以核对完整材料并提交文档 PR。"
                : "All perspectives confirmed this version. Review the complete materials and submit the document PR."}
      </p>
    </section>
  );
}
