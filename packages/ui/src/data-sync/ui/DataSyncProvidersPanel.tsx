import { ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { DataSyncProvidersState } from "@/data-sync/app/useDataSyncProviders.js";

/** 模型提供商分类页：只读本机提供商列表，不提供自动同步或重试。 */
export function DataSyncProvidersPanel(props: { state: DataSyncProvidersState }) {
  const { intl } = useZCodeIntl();
  const { formatMessage } = intl;
  const { state } = props;
  return (
    <div
      data-testid="remote-sync-resource-panel"
      className="flex h-full min-h-0 flex-col gap-3 overflow-hidden"
    >
      <div
        data-testid="remote-sync-resource-list"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-xl border border-border bg-background/50 p-2"
      >
        {state.list.phase === "loading" ? (
          <p className="px-3 py-6 text-center text-ui-sm text-foreground-subtle">
            {formatMessage({ id: "remoteSync.overview.loading" })}
          </p>
        ) : state.list.phase === "error" ? (
          <p className="px-3 py-6 text-center text-ui-sm text-destructive">
            {formatMessage({ id: "remoteSync.overview.loadFailed" })}
          </p>
        ) : state.list.rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-ui-sm text-foreground-subtle">
            {formatMessage({ id: "remoteSync.providers.empty" })}
          </p>
        ) : (
          state.list.rows.map((row) => (
            <div
              key={row.providerId}
              data-testid={`remote-sync-provider-${row.providerId}`}
              className="flex gap-3 rounded-lg bg-background p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui-base font-medium text-foreground">
                  {row.name}
                </span>
                <span className="mt-0.5 block truncate text-ui-sm text-foreground-subtle">
                  {[
                    row.endpoint,
                    row.models.join(formatMessage({ id: "remoteSync.dependency.nameSeparator" })),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {row.maskedApiKey ? (
                <span
                  data-testid={`remote-sync-provider-key-${row.providerId}`}
                  className="mt-0.5 shrink-0 self-start font-mono text-ui-xs text-foreground-subtle"
                >
                  {formatMessage({ id: "remoteSync.providers.apiKey" }, { key: row.maskedApiKey })}
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** 概览中模型提供商一行：只展示本机数量，不参与同步。 */
export function DataSyncProvidersOverviewRow(props: {
  state: DataSyncProvidersState;
  label: string;
  onNavigate(): void;
}) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-4 rounded-lg bg-background px-4 transition-colors hover:bg-surface-hover/50">
      <Checkbox
        data-testid="remote-sync-overview-checkbox-providers"
        aria-label={props.label}
        checked={false}
        disabled
      />
      <button
        type="button"
        data-testid="remote-sync-overview-providers"
        onClick={props.onNavigate}
        className="grid w-full grid-cols-[minmax(0,1fr)_64px_64px_minmax(120px,220px)] items-center gap-4 py-3 text-left text-ui-base"
      >
        <span className="truncate font-medium text-foreground">{props.label}</span>
        <span
          data-testid="remote-sync-overview-local-providers"
          className="text-center tabular-nums text-foreground-subtle"
        >
          {props.state.list.phase === "ready" ? props.state.list.rows.length : "–"}
        </span>
        <span
          data-testid="remote-sync-overview-remote-providers"
          className="text-center tabular-nums text-foreground-subtle"
        >
          –
        </span>
        <span className="flex min-w-0 items-center justify-end gap-2 text-foreground-subtle">
          <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}
