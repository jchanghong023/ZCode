import { TriangleAlert } from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { planningDate } from "../contract.js";

/** 开发任务表的人员与计划单元格；固定两行，完整事实由提示承载。 */
export function PersonnelPlan({
  developer,
  tester,
  start,
  end,
  incomplete,
  warnings,
}: {
  developer: string;
  tester: string;
  start?: string;
  end?: string;
  incomplete?: boolean;
  warnings: string[];
}) {
  // 人员分行和重复未排期文案会撑高单元格；固定两行，完整事实仍由提示承载。
  const personnel = `开发：${developer} · 测试：${tester}`;
  const plan =
    !start && !end
      ? "计划：未排期"
      : `计划：${planningDate(start).split(" ")[0]} → ${planningDate(end).split(" ")[0]}`;
  const planDetail = [
    `计划开始：${start?.replace("T", " ") || "未排期"}`,
    `计划结束：${end?.replace("T", " ") || "未排期"}`,
    ...(incomplete && (start || end) ? ["部分未排期"] : []),
    ...warnings,
  ].join("\n");
  return (
    // 修复：展开长表后 sr-only 绝对定位曾越出滚动域，撑高 document；就地定位使排期读屏文本随单元格裁剪。
    <div className="relative min-w-0 space-y-1 text-ui-sm">
      <ControlHintTooltip title={personnel}>
        <p
          tabIndex={0}
          className="truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {personnel}
        </p>
      </ControlHintTooltip>
      <ControlHintTooltip title={planDetail}>
        <p
          tabIndex={0}
          className="flex min-w-0 items-center gap-1 rounded-sm text-foreground-subtle tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {warnings.length > 0 && (
            <>
              <TriangleAlert
                aria-hidden="true"
                className="size-3.5 shrink-0 text-warning-surface-foreground"
              />
              <span className="sr-only">排期冲突／需协调：</span>
            </>
          )}
          <span className="min-w-0 truncate">{plan}</span>
        </p>
      </ControlHintTooltip>
    </div>
  );
}
