import { isTheme } from "@/useTheme.js";
import { AIReqOnlinePresence } from "./AIReqOnlinePresence.js";
import { CircleHelp, LogOut } from "lucide-react";
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
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const theme = useZCodeStore((state) => state.theme);
  const setTheme = useZCodeStore((state) => state.setTheme);
  const employeeId = getEmployeeId();

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
      <WorkspaceSidebarFooter
        className="border-l border-border py-0 pr-0 pl-3"
        theme={theme}
        onThemeChange={(value) => {
          if (isTheme(value)) setTheme(value);
        }}
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
