import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { memo, useState, type ReactNode } from "react";
import { TID_LOGIN_TRIGGER, TID_TASK_SETTINGS_BUTTON } from "@zcode/shared/test-ids";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Maximize, Palette, Settings, User, ZoomIn, ZoomOut } from "lucide-react";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { formatCommandShortcutLabel } from "@/lib/keyboardShortcuts.js";
import { AIREQ_THEMES, type Theme } from "@/useTheme.js";

interface WorkspaceSidebarFooterProps {
  theme: Theme;
  onThemeChange: (value: string) => void;
  onSettingsButtonClick?: () => void;
  settingsButtonMode?: "settings" | "back";
  className?: string;
  customMenuContent: ReactNode;
  profileLabel: ReactNode;
  profileDescription?: ReactNode;
  profileAriaLabel: string;
  compact?: boolean;
}

function WorkspaceSidebarFooterThemeMenu({
  theme,
  onThemeChange,
}: {
  theme: Theme;
  onThemeChange: (value: string) => void;
}) {
  const { intl } = useZCodeIntl();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette className="size-4" />
        {intl.formatMessage({ id: "settings.themeMode" })}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        <DropdownMenuRadioGroup value={theme} onValueChange={onThemeChange}>
          {AIREQ_THEMES.map((mode) => (
            <DropdownMenuRadioItem key={mode} value={mode}>
              {intl.formatMessage({ id: `settings.themeMode.${mode}` })}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value="zai-motion">
            {intl.formatMessage({ id: "sidebar.settings.theme.zai-motion" })}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            {intl.formatMessage({
              id: "sidebar.settings.systemDefault",
            })}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="zai-dark">
            {intl.formatMessage({
              id: "sidebar.settings.theme.zai-dark",
            })}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="zai-light">
            {intl.formatMessage({
              id: "sidebar.settings.theme.zai-light",
            })}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function WorkspaceSidebarFooterZoomMenu() {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ZoomIn className="size-4" />
        {intl.formatMessage({ id: "sidebar.settings.interfaceZoom" })}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        <DropdownMenuItem onSelect={() => platform.changeInterfaceZoom("in")}>
          <ZoomIn className="size-4" />
          {intl.formatMessage({ id: "titleBar.menu.view.zoomIn" })}
          <DropdownMenuShortcut>{formatCommandShortcutLabel("+")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => platform.changeInterfaceZoom("out")}>
          <ZoomOut className="size-4" />
          {intl.formatMessage({ id: "titleBar.menu.view.zoomOut" })}
          <DropdownMenuShortcut>{formatCommandShortcutLabel("-")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => platform.changeInterfaceZoom("reset")}>
          <Maximize className="size-4" />
          {intl.formatMessage({ id: "titleBar.menu.view.actualSize" })}
          <DropdownMenuShortcut>{formatCommandShortcutLabel("0")}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export const WorkspaceSidebarFooter = memo(function WorkspaceSidebarFooterComponent({
  theme,
  onThemeChange,
  onSettingsButtonClick,
  settingsButtonMode = "settings",
  className,
  customMenuContent,
  profileLabel,
  profileDescription,
  profileAriaLabel,
  compact = false,
}: WorkspaceSidebarFooterProps) {
  const { intl } = useZCodeIntl();
  const profileContent = (
    <>
      <Avatar size="default">
        <AvatarFallback className="bg-background text-foreground">
          <User className="size-4" />
        </AvatarFallback>
      </Avatar>
      <div className={cn("min-w-0 flex-1 overflow-hidden text-left", compact && "sr-only")}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            data-aireq-control-label=""
            className="min-w-0 truncate text-ui-base font-semibold text-foreground"
          >
            {profileLabel}
          </span>
        </div>
        {profileDescription != null ? (
          <div className="truncate text-ui-xs text-foreground-subtle">{profileDescription}</div>
        ) : null}
      </div>
    </>
  );
  const settingsButtonLabel =
    settingsButtonMode === "back"
      ? intl.formatMessage({ id: "workspace.backToWorkspace" })
      : intl.formatMessage({ id: "settings.title" });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileTrigger = (
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="lg"
        className={cn(
          "min-w-0 flex-1 justify-start gap-2 overflow-hidden rounded-tl-2xl rounded-bl-2xl border-0 pl-0",
          compact && "size-10 flex-none justify-center rounded-xl p-0",
        )}
        data-testid={TID_LOGIN_TRIGGER}
        aria-label={profileAriaLabel}
      >
        {profileContent}
      </Button>
    </DropdownMenuTrigger>
  );
  return (
    // footer 被 Settings 复用，页面专属边距由调用方传入，避免修改共享默认样式。
    <footer
      className={cn(
        "flex shrink-0 flex-col gap-2.5 px-4 pt-2 pb-4",
        compact && "items-center px-2",
        className,
      )}
    >
      <div className={cn("flex min-w-0 gap-2", compact && "flex-col items-center gap-1")}>
        <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
          {/* 保留统一的账户菜单入口；紧凑侧栏还需在键盘聚焦时显示名称。 */}
          {compact ? (
            <ControlHintTooltip title={profileAriaLabel} side="right">
              {profileTrigger}
            </ControlHintTooltip>
          ) : (
            profileTrigger
          )}
          {/* Bugfix: 菜单内容保持挂载，避免每次点击头像菜单都重建 footer 内部状态。 */}
          <DropdownMenuContent
            align="start"
            className="w-max min-w-50 max-w-[calc(100vw-2rem)]"
            forceMount
          >
            {customMenuContent}
            <WorkspaceSidebarFooterThemeMenu theme={theme} onThemeChange={onThemeChange} />
            <WorkspaceSidebarFooterZoomMenu />
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex shrink-0 items-center gap-1.5">
          <ControlHintTooltip title={settingsButtonLabel}>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              data-testid={TID_TASK_SETTINGS_BUTTON}
              aria-label={settingsButtonLabel}
              disabled={!onSettingsButtonClick}
              onClick={onSettingsButtonClick}
            >
              <Settings className="size-4" />
            </Button>
          </ControlHintTooltip>
        </div>
      </div>
    </footer>
  );
});
