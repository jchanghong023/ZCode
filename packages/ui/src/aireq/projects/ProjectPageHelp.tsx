import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** 项目页共用辅助说明入口，仅持有浮层状态，不改变导航。 */
export function ProjectPageHelp({ scope }: { scope: "all-projects" | "project-overview" }) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const allProjects = scope === "all-projects";
  const label = allProjects
    ? zh
      ? "项目说明"
      : "Projects help"
    : zh
      ? "项目概览说明"
      : "Project overview help";
  const description = allProjects
    ? zh
      ? "版本卡片显示各 Release 的需求总数。进入工作区可查看该版本的需求。"
      : "Release cards show the total requirement count. Open a workspace to see its requirements."
    : zh
      ? "提案完成评审和三方确认后提交文档 PR。合入并核验完整材料后，可在需求共创查阅已归档需求。"
      : "Submit a document PR after review and confirmation. Once the merge and materials are verified, the archived requirement is available in Co-creation.";

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
        {scope === "project-overview" && (
          <p>
            {zh
              ? "待人工处理按提案去重；同一提案可同时等待业务、开发和测试确认，分类数量不能直接相加。"
              : "Pending proposals are counted once. A proposal may await business, development and testing confirmation, so category counts may overlap."}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
