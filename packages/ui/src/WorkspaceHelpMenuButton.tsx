import { useState } from "react";
import { TID_WORKSPACE_HELP_MENU_TRIGGER } from "@zcode/shared/test-ids";
import { BookOpenIcon, CircleHelpIcon, UsersIcon, ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { cn } from "@/components/lib/utils.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useVulnerabilityReportUrl } from "@/hooks/useVulnerabilityReportUrl.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { createHelpMenuActionHandlers } from "@/lib/helpMenuActions.js";

export function WorkspaceHelpMenuButton({ className }: { className?: string }) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const [open, setOpen] = useState(false);
  const { url: vulnerabilityReportUrl, loading: vulnerabilityReportLoading } =
    useVulnerabilityReportUrl(open);
  const helpMenuLabel = intl.formatMessage({ id: "workspaceHeader.help.menu" });
  const helpMenuActions = createHelpMenuActionHandlers({ platform });
  const handleOpenCommunity = () => {
    void platform.openCommunity();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <ControlHintTooltip title={helpMenuLabel} side="bottom">
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-md"
            // Settings 页会把帮助按钮绝对定位在 Electron 顶部拖拽区上方。
            // 只依赖外层容器 no-drag 时，真实 trigger 仍可能被标题栏 drag 区吞掉点击。
            className={cn(
              "text-foreground hover:bg-hover hover:text-foreground [app-region:no-drag]",
              className,
            )}
            aria-label={helpMenuLabel}
            data-testid={TID_WORKSPACE_HELP_MENU_TRIGGER}
          >
            <CircleHelpIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
      </ControlHintTooltip>
      <DropdownMenuContent
        align="end"
        className="min-w-0 w-max [&_[data-slot=dropdown-menu-item]]:pr-6"
      >
        <DropdownMenuItem onSelect={helpMenuActions.openProductDocs}>
          <BookOpenIcon className="size-4" />
          {intl.formatMessage({ id: "workspaceHeader.help.docs" })}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleOpenCommunity}>
          <UsersIcon className="size-4" />
          {intl.formatMessage({ id: "workspaceHeader.help.community" })}
        </DropdownMenuItem>
        {vulnerabilityReportLoading || vulnerabilityReportUrl ? (
          <DropdownMenuItem
            disabled={vulnerabilityReportLoading}
            aria-busy={vulnerabilityReportLoading}
            onSelect={
              vulnerabilityReportUrl
                ? () => platform.openExternal(vulnerabilityReportUrl)
                : undefined
            }
          >
            <ShieldAlertIcon className="size-4" />
            {intl.formatMessage({ id: "workspaceHeader.help.reportVulnerability" })}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
