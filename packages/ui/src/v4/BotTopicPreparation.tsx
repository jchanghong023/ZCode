import { pendingTopicPreparations } from "@/v4/topicPreparationRenderUnits.js";
import { useMemo } from "react";
import { LoaderCircle } from "lucide-react";
import type {
  BotGroupInputSource,
  BotTopicPreparation as Preparation,
  FeishuBotProvider,
} from "@zcode/shared";
import type { ConversationRow } from "@zcode/shared/zcode-protocol-v4";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ConversationUserInputBubble } from "@/v4/ConversationUserInputBubble.js";

const EMPTY_ROWS: readonly ConversationRow[] = [];

export function BotTopicPreparationList({
  items,
  acceptedRows = EMPTY_ROWS,
  provider,
}: {
  items: readonly Preparation[];
  acceptedRows?: readonly ConversationRow[];
  provider?: FeishuBotProvider;
}) {
  const { intl } = useZCodeIntl();
  const pending = useMemo(
    () => pendingTopicPreparations(items, acceptedRows),
    [items, acceptedRows],
  );
  if (!pending.length) return null;
  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      {pending.map((item) => (
        <div
          key={item.messageId}
          data-topic-preparation={item.messageId}
          className="flex min-w-0 flex-col items-end"
        >
          <div
            data-topic-preparation-source="true"
            className="mb-2 flex min-w-0 max-w-full items-center gap-1.5 text-ui-sm text-foreground-subtle"
          >
            <span className="min-w-0 truncate" title={item.senderName}>
              {provider
                ? `${provider === "lark" ? "Lark" : intl.formatMessage({ id: "bots.group.provider.feishu" })} · `
                : ""}
              {item.senderName}
            </span>
            {item.status !== "failed" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    role="img"
                    aria-label={intl.formatMessage({ id: `chat.topicPreparation.${item.status}` })}
                    data-topic-preparation-loading="true"
                    className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm focus-visible:outline focus-visible:outline-ring"
                  >
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-3 animate-spin motion-reduce:animate-none"
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {intl.formatMessage({ id: `chat.topicPreparation.${item.status}` })}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <ConversationUserInputBubble
            text={item.text}
            contentParts={item.contentParts}
            rowId={item.messageId}
          />
        </div>
      ))}
    </div>
  );
}

export function BotGroupSourceLabel({ source }: { source?: BotGroupInputSource }) {
  const { intl } = useZCodeIntl();
  if (!source) return null;
  const provider =
    source.provider === "lark" ? "Lark" : intl.formatMessage({ id: "bots.group.provider.feishu" });
  const savedName = source.senderName.trim();
  const name = (savedName !== source.senderId ? savedName : "") || source.senderId.slice(-6);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-bot-group-source="true"
          title={source.senderId}
          className="min-w-0 max-w-full truncate rounded-sm text-ui-sm text-foreground-subtle hover:text-foreground focus-visible:outline focus-visible:outline-ring"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {provider} · {name}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-w-[calc(100vw-2rem)] gap-1 text-ui-sm"
        data-bot-group-member-details="true"
      >
        <span className="break-words">{name}</span>
        <span className="select-text break-all text-foreground-subtle">{source.senderId}</span>
      </PopoverContent>
    </Popover>
  );
}
