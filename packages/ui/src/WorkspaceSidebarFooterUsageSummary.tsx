import { BarChart3Icon } from "lucide-react";
import { TID_SIDEBAR_CODING_PLAN_USAGE_BUTTON } from "@zcode/shared/test-ids";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  setPendingSettingsUsageIntent,
  USAGE_STATS_ENTRY_VISIBLE,
} from "@/lib/settingsNavigation.js";

export function WorkspaceSidebarFooterUsageSummaryContent({
  onUsageClick,
}: {
  onUsageClick?: () => void;
}) {
  const { intl } = useZCodeIntl();

  return (
    <>
      {USAGE_STATS_ENTRY_VISIBLE ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid={TID_SIDEBAR_CODING_PLAN_USAGE_BUTTON}
            onSelect={() => {
              setPendingSettingsUsageIntent();
              onUsageClick?.();
            }}
          >
            <BarChart3Icon className="size-4" />
            {intl.formatMessage({ id: "sidebar.usage.plan.openStats" })}
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );
}
