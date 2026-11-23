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
      ? "版本卡片按需求的最新文档版本是否已确认，显示已定版和未定版数量。进入工作区可查看该版本的需求。"
      : "Release cards count requirements by whether their latest document version is confirmed. Open a workspace to see its requirements."
    : zh
      ? "在需求共创进入 Agent 对话，或直接打开每条需求的文档与历史版本。"
      : "In Co-creation, open either Agent or view a requirement’s documents and version history.";

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
      </PopoverContent>
    </Popover>
  );
}
