import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export interface WorkspaceSidebarToolbarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack(): void;
  onGoForward(): void;
}

/** 历史状态由 Context 持有；这里仅使用当前 ZCode 原生控件呈现。 */
export function WorkspaceSidebarToolbar({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
}: WorkspaceSidebarToolbarProps) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";

  return (
    <div
      className="absolute top-0 left-0 z-10 flex h-12 items-center gap-1 px-2"
      data-testid="workspace-sidebar-toolbar"
    >
      <ControlHintTooltip title={zh ? "后退" : "Back"} side="bottom">
        <Button
          variant="ghost"
          size="icon-md"
          aria-label={zh ? "后退" : "Back"}
          disabled={!canGoBack}
          onClick={onGoBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
      </ControlHintTooltip>
      <ControlHintTooltip title={zh ? "前进" : "Forward"} side="bottom">
        <Button
          variant="ghost"
          size="icon-md"
          aria-label={zh ? "前进" : "Forward"}
          disabled={!canGoForward}
          onClick={onGoForward}
        >
          <ArrowRight className="size-4" />
        </Button>
      </ControlHintTooltip>
    </div>
  );
}
