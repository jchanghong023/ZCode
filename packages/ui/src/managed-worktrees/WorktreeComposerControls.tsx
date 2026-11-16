import { TID_WORKTREE_TOGGLE } from "@zcode/shared/test-ids";
import { Checkbox } from "@/components/ui/checkbox.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";

export function WorktreeToggle({
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { intl } = useZCodeIntl();
  return (
    <label
      title={intl.formatMessage({ id: "git.managedWorktree.toggle.tooltip" })}
      className={cn(
        "flex h-7 shrink-0 cursor-pointer select-none items-center gap-2 rounded-full px-3 text-ui-base/relaxed text-foreground-subtle hover:bg-hover hover:text-foreground",
        className,
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      <Checkbox
        data-testid={TID_WORKTREE_TOGGLE}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span>{intl.formatMessage({ id: "git.managedWorktree.toggle.label" })}</span>
    </label>
  );
}
