import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function ProjectPageHelp() {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const label = zh ? "项目说明" : "Projects help";
  const description = zh
    ? "版本卡片显示各 Release 的需求总数。进入工作区可查看该版本的需求。"
    : "Release cards show the total requirement count. Open a workspace to see its requirements.";

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
