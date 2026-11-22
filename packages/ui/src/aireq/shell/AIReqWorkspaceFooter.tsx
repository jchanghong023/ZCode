import { AIReqOnlinePresence } from "./AIReqOnlinePresence.js";
import { useRef } from "react";
import { CircleHelp, LogOut, UserRound } from "lucide-react";
import { WorkspaceSidebarFooter } from "@/WorkspaceSidebarFooter.js";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.js";
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
  onHelp: (returnFocusTo?: HTMLButtonElement | null) => void;
}) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const theme = useZCodeStore((state) => state.theme);
  const setTheme = useZCodeStore((state) => state.setTheme);
  const employeeId = getEmployeeId();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <AIReqOnlinePresence />
      <WorkspaceSidebarFooter
        theme={theme}
        onThemeChange={(value) => {
          if (
            value === "system" ||
            value === "zai-dark" ||
            value === "zai-light" ||
            value === "zai-motion"
          )
            setTheme(value);
        }}
        onSettingsButtonClick={onOpenSettings}
        profileTriggerRef={menuTriggerRef}
        profileAriaLabel={zh ? "工号与界面菜单" : "Employee and interface menu"}
        profileLabel={<span title={employeeId}>{employeeId}</span>}
        customMenuContent={
          <>
            {/* 身份是只读信息而非不可用操作，不套用 disabled 的透明度。 */}
            <DropdownMenuLabel className="flex items-center gap-2 font-normal text-foreground">
              <UserRound className="size-4 shrink-0" />
              {zh ? "工号" : "Employee"} {employeeId}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={onLogout}>
              <LogOut className="size-4" />
              {zh ? "切换工号" : "Switch employee"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onHelp(menuTriggerRef.current)}
              data-testid="aireq-workflow-help-open"
            >
              <CircleHelp className="size-4" />
              {zh ? "帮助" : "Help"}
            </DropdownMenuItem>
          </>
        }
      />
    </>
  );
}
