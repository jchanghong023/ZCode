import { DeliveryContext } from "@/v4/botGroupDeliveryContext.js";
import { useContext, useMemo, type ReactNode } from "react";
import { CircleAlertIcon } from "lucide-react";
import type { BotGroupDelivery } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useBotGroupTask } from "@/hooks/useBotGroupTask.js";

import { useBotGroupMemberNames } from "@/hooks/useBotGroupMemberNames.js";
import { BotGroupMemberNamesContext } from "@/v4/BotGroupMemberNamesContext.js";

export function BotGroupDeliveryProvider({
  taskId,
  workspacePath,
  workspaceIdentity,
  children,
}: {
  taskId: string | null;
  workspacePath: string;
  workspaceIdentity?: string;
  children: ReactNode;
}) {
  // 同一任务只订阅一次群状态，历史回复不各自请求全量 Bot 状态。
  const { context, provider } = useBotGroupTask(taskId, workspacePath, workspaceIdentity);
  const memberNames = useBotGroupMemberNames(context);
  const value = useMemo(
    () => ({
      context,
      provider,
      taskId,
    }),
    [context, provider, taskId],
  );
  return (
    <DeliveryContext.Provider value={value}>
      <BotGroupMemberNamesContext.Provider value={memberNames}>
        {children}
      </BotGroupMemberNamesContext.Provider>
    </DeliveryContext.Provider>
  );
}

export function BotGroupDeliveryAction({
  turnId,
  sourceCommandIds,
  results,
}: {
  turnId: string;
  sourceCommandIds: readonly string[];
  results: BotGroupDelivery[];
}) {
  const { intl } = useZCodeIntl();
  // 当前仅展示真实群投递状态；没有正式动作 owner，不提供重发或协调按钮。
  const unresolved = results.filter(
    (result) =>
      result.sourceCommandId &&
      sourceCommandIds.includes(result.sourceCommandId) &&
      (result.status === "failed" || result.status === "unknown"),
  );
  if (!unresolved.length) return null;
  const label = intl.formatMessage({
    id: unresolved.some((result) => result.status === "unknown")
      ? "bots.group.deliveryUnknown"
      : "bots.group.deliveryFailed",
  });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-warning"
          aria-label={label}
          title={label}
          data-bot-group-delivery={turnId}
        >
          <CircleAlertIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-w-[calc(100vw-2rem)] gap-2"
        data-bot-group-delivery-actions={turnId}
      >
        {unresolved.map((result, index) => (
          <div key={result.id} className="flex flex-col gap-1">
            <span className="text-ui-sm text-foreground-subtle">
              {intl.formatMessage({
                id:
                  result.status === "unknown"
                    ? "bots.group.deliveryUnknown"
                    : "bots.group.deliveryFailed",
              })}
              {unresolved.length > 1 ? ` (${index + 1}/${unresolved.length})` : null}
            </span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function ConnectedBotGroupDeliveryAction({
  turnId,
  sourceCommandIds,
}: {
  turnId: string;
  sourceCommandIds: readonly string[];
}) {
  const value = useContext(DeliveryContext);
  const context = value?.context;
  if (!value || !context?.group) return null;
  return (
    <BotGroupDeliveryAction
      turnId={turnId}
      sourceCommandIds={sourceCommandIds}
      results={Object.values(context.group.deliveries ?? {}).filter(
        (result) => result.taskId === value.taskId,
      )}
    />
  );
}
