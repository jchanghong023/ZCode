import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** 项目页共用辅助说明入口，仅持有浮层状态，不改变进度或导航。 */
export function ProjectPageHelp({
  scope,
}: {
  scope: "all-projects" | "project-overview" | "formal-requirements" | "analysis-runs";
}) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const allProjects = scope === "all-projects";
  const formal = scope === "formal-requirements";
  const analysis = scope === "analysis-runs";
  const label = analysis
    ? zh
      ? "分析运行说明"
      : "Analysis runs help"
    : formal
      ? zh
        ? "正式需求说明"
        : "Formal requirements help"
      : allProjects
        ? zh
          ? "项目说明"
          : "Projects help"
        : zh
          ? "项目概览说明"
          : "Project overview help";
  const description = analysis
    ? zh
      ? "查看当前项目与 Release 的分析任务、执行历史与失败原因。可按需求（IR）筛选，或搜索开发单元（SR）的名称。"
      : "Review analysis tasks, history and failures for the selected project and Release. Filter by requirement (IR) or search development units (SRs) by name."
    : formal
      ? zh
        ? "展开需求查看开发单元（SR），选择需求或开发单元阅读进度报告。"
        : "Expand a requirement to see its development units (SRs), then select a requirement or unit to read its progress report."
      : allProjects
        ? zh
          ? "比较各项目与版本的需求及进展。一条正式需求（IR）可拆分为多个开发任务（SR）。"
          : "Compare requirements and progress across projects and releases. A formal requirement (IR) can be split into multiple development tasks (SRs)."
        : zh
          ? "查看当前范围的需求进度，进入 IR 或 SR 阅读报告。"
          : "Review requirement progress in this scope and open IR or SR reports.";
  const calculation = analysis
    ? zh
      ? "手动分析覆盖全部筛选分页，运行中的开发单元不会重复提交。自动分析的开关、周期和项目范围可在分析设置中调整。"
      : "Manual analysis includes all filtered pages and does not resubmit running units. Configure automatic analysis, its interval and project scope in analysis settings."
    : formal
      ? zh
        ? "需求（IR）进度为下属开发单元（SR）的平均值；未分析按 0 计，代码合入为 99%，人工验收通过才为 100%。"
        : "Requirement (IR) progress averages its development units (SRs). Unanalyzed units count as zero; code merge means 99%, and human test acceptance means 100%."
      : allProjects
        ? zh
          ? "版本进度为所有正式开发任务（SR）的等权平均，提案不参与计算。未分析任务按 0 计，代码合入为 99%，人工验收通过才为 100%。没有正式需求或开发任务时不显示百分比。"
          : "Release progress is the equally weighted average of its formal development tasks (SRs); proposals are excluded. Unanalyzed tasks count as zero, code merge means 99%, and human test acceptance means 100%. No percentage is shown without formal requirements or development tasks."
        : zh
          ? "进度按范围内正式 SR 等权平均，提案不计入；未分析按 0 并标注，代码合入为 99%，人工验收通过才为 100%。"
          : "Progress averages formal SRs in scope, excluding proposals. Unanalyzed SRs count as zero; code merge means 99%, and human test acceptance means 100%.";

  return (
    // 长说明需稳定阅读；开合与焦点交还原生 Popover，避免离开问号就消失。
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-6 shrink-0 text-foreground-subtle hover:text-foreground focus-visible:border-remote-foreground-muted"
          aria-label={label}
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={label}
        align="start"
        collisionPadding={12}
        className="max-h-[min(28rem,calc(100vh-2rem))] w-80 max-w-[calc(100vw-1.5rem)] gap-3 overflow-y-auto p-3 text-ui-sm leading-relaxed"
      >
        <p>{description}</p>
        <div className="space-y-1.5">
          <p className="font-medium">
            {analysis
              ? zh
                ? "分析范围与调度规则"
                : "Analysis scope and scheduling"
              : zh
                ? "进度如何计算"
                : "How progress is calculated"}
          </p>
          <p>{calculation}</p>
        </div>
        {scope === "project-overview" && (
          <p>
            {zh
              ? "待人工处理按提案去重；同一提案可同时等待业务、开发和测试确认，分类数量不能直接相加。"
              : "Pending proposals are counted once. A proposal may await business, development and testing confirmation, so category counts may overlap."}
          </p>
        )}
        {formal && (
          <p>
            {zh
              ? "需求的计划日期由下属开发单元的计划汇总。"
              : "Requirement dates summarize the plans of its development units."}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
