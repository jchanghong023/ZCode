import { CheckCircle2, Circle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { getEmployeeId } from "../identity.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import {
  alignmentBlocker,
  hasProjectRole,
  fullReviewReadyBlocker,
  proposalAlignmentCurrent,
  proposalVersion,
} from "../contract.js";
import type { AIReqRequirementGroup } from "../contract.js";

const perspectives = [
  ["business", "业务", "Business"],
  ["development", "开发", "Development"],
  ["testing", "测试", "Testing"],
] as const;

/** 三方确认只读取同版服务端事实；阶段主体与提交共用原有命令入口。 */
export function AIReqProposalAlignment({
  group,
  readOnly = false,
}: {
  group: AIReqRequirementGroup;
  readOnly?: boolean;
}) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const blockerId = useId();
  const [confirming, setConfirming] = useState<string>();
  const inFlight = useRef(false);
  const review = group.review;
  const version = proposalVersion(group);
  const employeeId = getEmployeeId();
  const reviewBlocker = fullReviewReadyBlocker(group);
  const roles = perspectives.map(([perspective, label, labelEn]) => ({
    perspective,
    label,
    labelEn,
    confirmation: reviewBlocker
      ? undefined
      : group.alignment?.find(
          (item) => item.perspective === perspective && proposalAlignmentCurrent(group, item),
        ),
  }));
  const confirmedCount = roles.filter(({ confirmation }) => confirmation).length;
  const blocker = alignmentBlocker(group);
  const pending =
    Boolean(confirming) ||
    ai.pending ||
    ai.view?.running.some((item) => item.projectId === group.projectId && item.irId === group.id);
  return (
    <section
      className="space-y-3"
      aria-label={zh ? "当前材料三方确认" : "Confirm the current materials"}
      data-testid="proposal-alignment"
    >
      <div className="space-y-1">
        <h2 className="text-ui-base font-medium">
          {zh
            ? `三方确认 · ${confirmedCount} / ${roles.length}`
            : `Role confirmations · ${confirmedCount} / ${roles.length}`}
        </h2>
        <p className="text-ui-sm text-foreground-subtle">
          {zh
            ? "确认你在当前项目中拥有的角色，记录会绑定当前材料版本。"
            : "Confirm the roles you hold in this project. Each decision is tied to the current document version."}
        </p>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
        {roles.map(({ perspective, label, labelEn, confirmation }) => {
          const Icon = confirmation ? CheckCircle2 : Circle;
          const canConfirm =
            !confirmation &&
            !readOnly &&
            hasProjectRole(ai.view, group.projectId, employeeId, perspective);
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
                  <p className="text-ui-base font-medium">{zh ? label : labelEn}</p>
                  <p className="break-words text-ui-sm text-foreground-subtle">
                    {confirmation
                      ? `${zh ? "已确认" : "Confirmed"} · ${confirmation.employeeId} · ${new Date(confirmation.confirmedAt).toLocaleString(locale, { timeZone: "Asia/Shanghai" })}${zh ? "（北京时间）" : " (Beijing time)"} · ${zh ? `第 ${review?.round ?? 1} 轮` : `Round ${review?.round ?? 1}`}`
                      : zh
                        ? canConfirm
                          ? "待你确认当前版本"
                          : `等待项目${label}人员确认`
                        : canConfirm
                          ? "This version awaits your confirmation"
                          : `Awaiting a project ${labelEn.toLowerCase()} reviewer`}
                  </p>
                </div>
              </div>
              {canConfirm && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    Boolean(pending) ||
                    Boolean(reviewBlocker) ||
                    !source.capabilities.proposalDiscussion
                  }
                  aria-describedby={reviewBlocker ? blockerId : undefined}
                  onClick={async () => {
                    if (!review || inFlight.current) return;
                    inFlight.current = true;
                    setConfirming(perspective);
                    try {
                      await ai.command({
                        type: "confirmAlignment",
                        projectId: group.projectId,
                        irId: group.id,
                        perspective,
                        version,
                        reviewId: review.id,
                        snapshotDigest: review.snapshotDigest,
                      });
                    } finally {
                      inFlight.current = false;
                      setConfirming(undefined);
                    }
                  }}
                >
                  {confirming === perspective
                    ? zh
                      ? "正在确认…"
                      : "Confirming…"
                    : zh
                      ? `以${label}身份确认本版`
                      : `Confirm this version as ${labelEn.toLowerCase()}`}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {!readOnly &&
        roles.some(
          ({ perspective, confirmation }) =>
            !confirmation && !hasProjectRole(ai.view, group.projectId, employeeId, perspective),
        ) && (
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => ai.navigate(() => ai.setMainView("roles"))}
          >
            {zh ? "查看项目角色名单" : "View project role lists"}
          </Button>
        )}
      <p id={blockerId} className="text-ui-sm text-foreground-subtle" role="status">
        {readOnly
          ? zh
            ? "以上为当前材料的确认记录。"
            : "These are the confirmations for the current materials."
          : (reviewBlocker ??
            blocker ??
            (zh
              ? "三方已确认，可以核对完整材料并提交归档。"
              : "All roles have confirmed. Review the complete materials and submit them for archiving."))}
      </p>
    </section>
  );
}
