import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";
import { useSettingsSearchTarget, type SettingsSearchId } from "@/settings-search/index.js";

/** 对非 SettingsRow 的业务设置区域复用同一搜索定位与焦点反馈。 */
export function AIReqSettingsTarget({
  id,
  className,
  children,
}: {
  id: SettingsSearchId;
  className?: string;
  children: ReactNode;
}) {
  const { ref, highlighted } = useSettingsSearchTarget(id);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-settings-search-id={id}
      data-settings-search-highlighted={highlighted || undefined}
      className={cn(
        className,
        highlighted && "rounded-lg bg-accent ring-1 ring-input-border-focused",
      )}
    >
      {children}
    </div>
  );
}
