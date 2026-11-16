import { useState } from "react";
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
  const [open, setOpen] = useState(false);
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
      ? "查看当前项目与 Release 的分析任务、执行历史与失败原因。可按需求（IR）筛选，或搜索开发单元（SR）的名称与编号。"
      : "Review analysis tasks, history and failures for the selected project and Release. Filter by requirement (IR) or search development units (SRs) by name or ID."
    : formal
      ? zh
        ? "展开需求查看开发单元（SR），选择需求或开发单元阅读进度报告。"
        : "Expand a requirement to see its development units (SRs), then select a requirement or unit to read its progress report."
      : allProjects
        ? zh
          ? "查看全部项目，进入项目空间处理需求与进度。"
          : "Explore all projects and open a project space to work with requirements and progress."
        : zh
          ? "查看当前范围的需求进度，进入 IR 或 SR 阅读报告。"
          : "Review requirement progress in this scope and open IR or SR reports.";
  const calculation = analysis
    ? zh
      ? "手动分析覆盖全部筛选分页，运行中的开发单元不会重复提交。模拟操作推进全局调度，不受页面筛选限制；当前仅模拟分析，不调用真实模型。"
      : "Manual analysis includes all filtered pages and does not resubmit running units. Simulation advances the global scheduler regardless of page filters. Analysis is simulated; no real model is called."
    : formal
      ? zh
        ? "需求（IR）进度为下属开发单元（SR）的平均值；未分析按 0 计，代码合入为 99%，人工验收通过才为 100%。"
        : "Requirement (IR) progress averages its development units (SRs). Unanalyzed units count as zero; code merge means 99%, and human test acceptance means 100%."
      : allProjects
        ? zh
          ? "进度按项目全部 Release 的正式 SR 等权平均，提案不计入；未分析按 0 并标注，代码合入为 99%，人工验收通过才为 100%。"
          : "Progress averages formal SRs across all project Releases, excluding proposals. Unanalyzed SRs count as zero; code merge means 99%, and human test acceptance means 100%."
        : zh
          ? "进度按范围内正式 SR 等权平均，提案不计入；未分析按 0 并标注，代码合入为 99%，人工验收通过才为 100%。"
          : "Progress averages formal SRs in scope, excluding proposals. Unanalyzed SRs count as zero; code merge means 99%, and human test acceptance means 100%.";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-6 shrink-0 text-foreground-subtle hover:text-foreground"
          aria-label={label}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setOpen(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setOpen(false);
          }}
          onFocus={() => setOpen(true)}
          onClick={(event) => {
            // 复用原生帮助的打开语义：focus／hover 已打开时，点击不能反向关闭。
            event.preventDefault();
            setOpen(true);
          }}
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        role="tooltip"
        aria-label={label}
        align="start"
        collisionPadding={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="max-h-[min(28rem,calc(100vh-2rem))] w-80 max-w-[calc(100vw-1.5rem)] gap-3 overflow-y-auto p-3 text-ui-sm leading-relaxed"
      >
        <p>{description}</p>
        <div className="space-y-1.5">
          <p className="font-medium">
            {analysis
              ? zh
                ? "分析范围与模拟规则"
                : "Analysis scope and simulation"
              : zh
                ? "进度如何计算"
                : "How progress is calculated"}
          </p>
          <p>{calculation}</p>
        </div>
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
