import { TID_THEME_TOGGLE } from "@zcode/shared/test-ids";
import { DEFAULT_AIREQ_THEME } from "@/useTheme.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { AIReqOnlinePresence } from "./AIReqOnlinePresence.js";
import { CircleHelp, LogOut, Moon, Sun } from "lucide-react";
import { WorkspaceSidebarFooter } from "@/WorkspaceSidebarFooter.js";
import { Button } from "@/components/ui/button.js";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { getEmployeeId } from "../identity.js";

export function AIReqWorkspaceFooter({
  onOpenSettings,
  onLogout,
  onHelp,
}: {
  onOpenSettings: () => void;
  onLogout: () => void;
  onHelp: (trigger: HTMLButtonElement) => void;
}) {
  const { intl, locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const motionTheme = useZCodeStore((state) => state.theme === "zai-motion");
  const setTheme = useZCodeStore((state) => state.setTheme);
  const employeeId = getEmployeeId();
  const nextTheme = motionTheme ? DEFAULT_AIREQ_THEME : "zai-motion";
  const ThemeIcon = motionTheme ? Moon : Sun;

  return (
    <>
      <AIReqOnlinePresence />
      <Button
        type="button"
        variant="ghost"
        size="lg"
        aria-haspopup="dialog"
        data-testid="aireq-workflow-help-open"
        className="gap-1.5 text-foreground-subtle hover:text-foreground focus-visible:border-input-border-focused"
        onClick={(event) => onHelp(event.currentTarget)}
      >
        <CircleHelp aria-hidden="true" className="size-4" />
        {zh ? "帮助" : "Help"}
      </Button>
      <ControlHintTooltip
        title={intl.formatMessage(
          { id: "settings.themeMode.switchTo" },
          { theme: intl.formatMessage({ id: `settings.themeMode.${nextTheme}` }) },
        )}
        side="bottom"
      >
        <Button
          type="button"
          role="switch"
          size="icon-lg"
          variant="outline"
          aria-checked={motionTheme}
          aria-label={intl.formatMessage({ id: "settings.themeMode.zai-motion" })}
          data-testid={TID_THEME_TOGGLE}
          className="relative mx-1.5 w-14 rounded-full border-input-border bg-surface focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-header aria-checked:border-remote-foreground-muted"
          onClick={() => setTheme(nextTheme)}
        >
          <span className="pointer-events-none absolute left-0.75 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground group-aria-checked/button:translate-x-6 group-aria-checked/button:bg-background group-aria-checked/button:text-foreground motion-safe:in-data-aireq-color-motion:transition-transform">
            <ThemeIcon aria-hidden="true" className="size-4" />
          </span>
        </Button>
      </ControlHintTooltip>
      <WorkspaceSidebarFooter
        className="border-l border-border py-0 pr-0 pl-3"
        onSettingsButtonClick={onOpenSettings}
        profileAriaLabel={
          zh ? `工号与界面菜单，当前工号 ${employeeId}` : `Employee and interface menu, ${employeeId}`
        }
        profileLabel={<span title={employeeId}>{employeeId}</span>}
        customMenuContent={
          <>
            <DropdownMenuItem onSelect={onLogout}>
              <LogOut className="size-4" />
              {zh ? "切换工号" : "Switch employee"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        }
      />
    </>
  );
}
