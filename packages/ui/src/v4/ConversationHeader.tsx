import { memo } from "react";
import { TID_V4_PANE_WORKSPACE_BADGE, TID_V4_SPLIT_CLOSE } from "@zcode/shared/test-ids";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** 跨 workspace pane 的归属徽标（未来跨 workspace session 的多路径徽标在此扩展）。 */
export interface PaneWorkspaceBadge {
  /** 展示名（workspacePath basename）。 */
  label: string;
  /** 完整路径（tooltip）。 */
  workspacePath: string;
  /** 远程 workspace（SSH/WSL/Docker）标识。 */
  remote: boolean;
}

export interface ConversationHeaderProps {
  /** 关闭本窗格（仅非 primary pane 下发；关 pane ≠ 停 session）。 */
  onClosePane?: () => void;
  /** 跨 workspace pane 的归属徽标（pane workspace ≠ shell 当前 workspace 时下发）。 */
  workspaceBadge?: PaneWorkspaceBadge;
}

/**
 * pane chrome：不占布局高度，只悬浮 workspace 徽标与关闭入口（拆分入口已下线）。
 */
function ConversationHeaderImpl({ onClosePane, workspaceBadge }: ConversationHeaderProps) {
  const { intl } = useZCodeIntl();
  const hasFloatingActions = Boolean(workspaceBadge) || Boolean(onClosePane);

  return (
    <>
      {hasFloatingActions ? (
        <div
          data-v4-pane-actions="floating"
          className="pointer-events-none absolute left-2 top-2 z-20 flex max-w-[calc(100%-1rem)] items-center gap-1"
        >
          {workspaceBadge ? (
            <span
              data-testid={TID_V4_PANE_WORKSPACE_BADGE}
              data-remote={workspaceBadge.remote ? "true" : "false"}
              title={workspaceBadge.workspacePath}
              className="pointer-events-auto flex h-7 max-w-[10rem] shrink items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-popover)] px-2 font-mono text-ui-base text-[var(--color-foreground-subtle)] shadow-md"
            >
              <span className="truncate">{workspaceBadge.label}</span>
              {workspaceBadge.remote ? (
                <span className="shrink-0">{intl.formatMessage({ id: "v4Pane.remote" })}</span>
              ) : null}
            </span>
          ) : null}
          {onClosePane ? (
            <Button
              type="button"
              variant="outline"
              size="icon-md"
              data-testid={TID_V4_SPLIT_CLOSE}
              onClick={() => onClosePane()}
              title={intl.formatMessage({ id: "v4Pane.closePaneTitle" })}
              aria-label={intl.formatMessage({ id: "v4Pane.closePane" })}
              className="pointer-events-auto bg-[var(--color-popover)] shadow-md"
            >
              <XIcon className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export const ConversationHeader = memo(ConversationHeaderImpl);
