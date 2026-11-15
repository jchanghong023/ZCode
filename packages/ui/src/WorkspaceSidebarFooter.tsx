import { useSetInterfaceModeWithTelemetry } from "@/lib/appTelemetry.js";
import { SidebarNativeTooltip, ControlHintTooltip } from "@/ControlHintTooltip.js";
/* oxlint-disable eslint(max-lines) -- footer 聚合账户、主题、模式和快捷键菜单。 */
import type { UserInfo } from "@zcode/shared";
import { memo, useState, type ReactNode, type Ref } from "react";
import {
  TID_LOGIN_MENU_ITEM,
  TID_LOGIN_TRIGGER,
  TID_LOGOUT_BUTTON,
  TID_TASK_SETTINGS_BUTTON,
} from "@zcode/shared/test-ids";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { toast } from "@/components/ui/toast.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import {
  Copy,
  PencilRuler,
  LogInIcon,
  LogOut,
  Maximize,
  Palette,
  Settings,
  User,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { normalizeInterfaceMode } from "@/lib/interfaceMode.js";
import { formatCommandShortcutLabel } from "@/lib/keyboardShortcuts.js";
import type { Theme } from "@/useTheme.js";
import {
  WorkspaceSidebarFooterPlanBadge,
  WorkspaceSidebarFooterUsageSummaryContent,
  useWorkspaceSidebarFooterUsageSummaryState,
} from "@/WorkspaceSidebarFooterUsageSummary.js";

function getSidebarProfileName(user?: UserInfo | null): string {
  const displayName = user?.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  const username = user?.username?.trim();
  if (username) {
    return username;
  }

  return "ZCode";
}

function getSidebarProfileBadge(
  user: UserInfo | null | undefined,
  formatMessage: ReturnType<typeof useZCodeIntl>["intl"]["formatMessage"],
): string {
  if (user) {
    return getSidebarProfileName(user);
  }

  return formatMessage({ id: "sidebar.profile.notLoggedIn" });
}

function getAvatarFallbackText(user: UserInfo | null | undefined): string {
  const source = user?.displayName?.trim() || user?.username?.trim() || "Z";
  return source[0]?.toUpperCase() ?? "Z";
}

interface WorkspaceSidebarFooterProps {
  theme: Theme;
  onThemeChange: (value: string) => void;
  onSettingsButtonClick?: () => void;
  onUsageClick?: () => void;
  onLogin?: () => void;
  onLogout?: () => void;
  settingsButtonMode?: "settings" | "back";
  user?: UserInfo | null;
  workspacePath?: string;
  workspaceIdentity?: string;
  isDesktop?: boolean;
  className?: string;
  customMenuContent?: ReactNode;
  profileLabel?: ReactNode;
  profileDescription?: ReactNode;
  profileAriaLabel?: string;
  profileTriggerRef?: Ref<HTMLButtonElement>;
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

// 业务菜单不能只隐藏账户项：原用量 hook 仍会读取设置和 entitlement，故仅在默认模式挂载。
function WorkspaceSidebarFooterNativeMenu({
  theme,
  onThemeChange,
  user,
  workspaceIdentity,
  workspacePath,
  onUsageClick,
  onSettingsButtonClick,
  onLogin,
  onLogout,
}: Pick<
  WorkspaceSidebarFooterProps,
  | "theme"
  | "onThemeChange"
  | "user"
  | "workspaceIdentity"
  | "workspacePath"
  | "onUsageClick"
  | "onSettingsButtonClick"
  | "onLogin"
  | "onLogout"
>) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const profileBadge = getSidebarProfileBadge(user, intl.formatMessage);
  const avatarFallbackText = getAvatarFallbackText(user);
  const avatarKey = user?.avatarUrl ?? user?.id ?? "guest";
  const interfaceMode = useZCodeStore((state) => state.interfaceMode);
  const setInterfaceMode = useSetInterfaceModeWithTelemetry(platform, "app.profile");
  const usageSummaryState = useWorkspaceSidebarFooterUsageSummaryState({
    enabled: true,
    workspaceIdentity,
    workspacePath,
  });
  const copyUserId = async () => {
    if (!user?.id) return;
    try {
      await navigator.clipboard.writeText(user.id);
      toast(intl.formatMessage({ id: "sidebar.profile.userIdCopied" }));
    } catch {
      toast(intl.formatMessage({ id: "sidebar.profile.userIdCopyFailed" }));
    }
  };
  const usageButtonClick = onUsageClick ?? onSettingsButtonClick;
  return (
    <>
      {user ? (
        <>
          <div
            data-testid="profile-menu-header"
            className="flex max-w-80 items-center gap-2 px-2 py-1.5"
          >
            <Avatar key={avatarKey} size="default">
              {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={profileBadge} /> : null}
              <AvatarFallback className="bg-background text-foreground">
                {avatarFallbackText}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-w-0 items-center gap-1.5">
                <span data-testid="profile-menu-name" className="truncate text-ui-base font-medium">
                  {profileBadge}
                </span>
                <span
                  data-testid="profile-menu-plan"
                  className="flex shrink-0 [&>span]:border-border/50 [&>span]:bg-transparent [&>span]:font-normal"
                >
                  <WorkspaceSidebarFooterPlanBadge state={usageSummaryState} />
                </span>
              </div>
              {user.id ? (
                <div className="flex min-w-0 items-center gap-1 text-ui-sm text-foreground-subtle">
                  <span data-testid="profile-menu-id" className="min-w-0 truncate">
                    {intl.formatMessage({ id: "sidebar.profile.accountId" }, { id: user.id })}
                  </span>
                  <DropdownMenuItem
                    asChild
                    className="data-[highlighted]:bg-transparent data-[highlighted]:hover:bg-menu-hover data-[highlighted]:focus-visible:bg-menu-hover"
                    onSelect={(event) => {
                      event.preventDefault();
                      void copyUserId();
                    }}
                  >
                    <SidebarNativeTooltip>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        data-testid="copy-user-id"
                        className="min-h-0 p-0 text-foreground-subtle"
                        aria-label={intl.formatMessage({ id: "sidebar.profile.copyUserId" })}
                        title={intl.formatMessage({ id: "sidebar.profile.copyUserId" })}
                      >
                        <Copy className="size-3" />
                      </Button>
                    </SidebarNativeTooltip>
                  </DropdownMenuItem>
                </div>
              ) : null}
            </div>
          </div>
          <DropdownMenuSeparator />
        </>
      ) : null}
      <WorkspaceSidebarFooterThemeMenu theme={theme} onThemeChange={onThemeChange} />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <PencilRuler className="size-4" />
          {intl.formatMessage({ id: "settings.interfaceMode" })}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-48">
          <DropdownMenuRadioGroup
            value={interfaceMode}
            onValueChange={(value) => setInterfaceMode(normalizeInterfaceMode(value))}
          >
            <DropdownMenuRadioItem value="coding">
              {intl.formatMessage({ id: "settings.interfaceMode.coding" })}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="office">
              {intl.formatMessage({ id: "settings.interfaceMode.office" })}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <WorkspaceSidebarFooterZoomMenu />
      <WorkspaceSidebarFooterUsageSummaryContent onUsageClick={usageButtonClick} />
      {onLogin && !user ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onLogin} data-testid={TID_LOGIN_MENU_ITEM}>
            <LogInIcon className="size-4" />
            {intl.formatMessage({ id: "app.login" })}
          </DropdownMenuItem>
        </>
      ) : null}
      {onLogout ? <DropdownMenuSeparator /> : null}
      {onLogout ? (
        <DropdownMenuItem onSelect={onLogout} data-testid={TID_LOGOUT_BUTTON}>
          <LogOut className="size-4" />
          {intl.formatMessage({ id: "app.logout" })}
        </DropdownMenuItem>
      ) : null}
    </>
  );
}

export const WorkspaceSidebarFooter = memo(function WorkspaceSidebarFooterComponent({
  theme,
  onThemeChange,
  onSettingsButtonClick,
  onUsageClick,
  onLogin,
  onLogout,
  settingsButtonMode = "settings",
  user,
  workspacePath,
  workspaceIdentity,
  className,
  customMenuContent,
  profileLabel,
  profileDescription,
  profileAriaLabel,
  profileTriggerRef,
}: WorkspaceSidebarFooterProps) {
  const { intl } = useZCodeIntl();
  const profileBadge = getSidebarProfileBadge(user, intl.formatMessage);
  const avatarFallbackText = getAvatarFallbackText(user);
  const avatarKey = user?.avatarUrl ?? user?.id ?? "guest";
  const profileContent = (
    <>
      <Avatar key={avatarKey} size="default">
        {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={profileBadge} /> : null}
        <AvatarFallback className="bg-background text-foreground">
          {user ? avatarFallbackText : <User className="size-4" />}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 overflow-hidden text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-ui-base font-semibold text-foreground">
            {profileLabel ?? profileBadge}
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
  return (
    // footer 被 Settings 复用，页面专属边距由调用方传入，避免修改共享默认样式。
    <footer className={cn("flex shrink-0 flex-col gap-2.5 px-4 pt-2 pb-4", className)}>
      <div className="flex min-w-0 gap-2">
        <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
          <DropdownMenuTrigger asChild>
            {/* Bugfix: 头像和 Login 之前直接绑定到登录动作，导致用户无法从这里打开偏好设置。
              现在把这一块改成统一的设置菜单入口，登录/退出留在菜单项里，交互职责更清晰。 */}
            <Button
              type="button"
              variant="ghost"
              size={"lg"}
              className="min-w-0 flex-1 justify-start gap-2 overflow-hidden rounded-tl-2xl rounded-bl-2xl border-0 pl-0"
              data-testid={TID_LOGIN_TRIGGER}
              ref={profileTriggerRef}
              aria-label={profileAriaLabel ?? profileBadge}
            >
              {/* Bugfix: Button 默认 shrink-0 且带 whitespace-nowrap，超长用户名会把 footer 撑出 sidebar。
                这里让触发按钮和文本列都允许收缩，并只在用户名自身做单行截断。 */}
              {profileContent}
            </Button>
          </DropdownMenuTrigger>
          {/* Bugfix: 菜单内容保持挂载，避免每次点击头像菜单都重建 footer 内部状态。 */}
          <DropdownMenuContent
            align="start"
            className="w-max min-w-50 max-w-[calc(100vw-2rem)]"
            forceMount
          >
            {customMenuContent !== undefined ? (
              <>
                {customMenuContent}
                <WorkspaceSidebarFooterThemeMenu theme={theme} onThemeChange={onThemeChange} />
                <WorkspaceSidebarFooterZoomMenu />
              </>
            ) : (
              <WorkspaceSidebarFooterNativeMenu
                theme={theme}
                onThemeChange={onThemeChange}
                user={user}
                workspaceIdentity={workspaceIdentity}
                workspacePath={workspacePath}
                onUsageClick={onUsageClick}
                onSettingsButtonClick={onSettingsButtonClick}
                onLogin={onLogin}
                onLogout={onLogout}
              />
            )}
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
