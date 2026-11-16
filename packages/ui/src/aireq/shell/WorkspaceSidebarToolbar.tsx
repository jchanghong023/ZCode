import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";

export interface WorkspaceSidebarToolbarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack(): void;
  onGoForward(): void;
}

/** 导航事实由 Shell 持有；这里仅使用当前 ZCode 原生控件呈现。 */
export function WorkspaceSidebarToolbar({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
}: WorkspaceSidebarToolbarProps) {
  return (
    <div
      className="flex shrink-0 flex-col items-center gap-1 px-2 py-2"
      data-testid="workspace-sidebar-toolbar"
    >
      <ControlHintTooltip title="后退" side="bottom">
        <Button
          variant="ghost"
          size="icon-md"
          aria-label="后退"
          disabled={!canGoBack}
          onClick={onGoBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
      </ControlHintTooltip>
      <ControlHintTooltip title="前进" side="bottom">
        <Button
          variant="ghost"
          size="icon-md"
          aria-label="前进"
          disabled={!canGoForward}
          onClick={onGoForward}
        >
          <ArrowRight className="size-4" />
        </Button>
      </ControlHintTooltip>
    </div>
  );
}
