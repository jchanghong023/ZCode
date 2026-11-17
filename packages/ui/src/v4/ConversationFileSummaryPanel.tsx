import { useMemo, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import type {
  TurnHeaderRow,
  V4ConversationFileChangesResult,
} from "@zcode/shared/zcode-protocol-v4";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { FileDisplayInline } from "@/lib/fileDisplay.js";
import { toWorkspaceRelativePath } from "@/lib/taskChangeSummary.js";
import { buildChangeSummaryFilePreviewSource } from "@/messageChangeSummaryPreview.js";
import { OpenSplitButton } from "@/OpenSplitButton.js";
import { collectGenUiSourcePaths, matchesGenUiSourcePath } from "@/gen-ui/contract.js";
import type { ConversationRowRenderContext } from "@/v4/conversationRowContext.js";

type FileChangeItem = V4ConversationFileChangesResult["items"][number];

interface ConversationFileSummaryPanelProps {
  header: TurnHeaderRow;
  context: ConversationRowRenderContext;
  assistantText?: string;
  details?: V4ConversationFileChangesResult;
}

function formatPatch(path: string, patches: FileChangeItem["patches"]): string {
  if (patches.length === 0) return "";
  const lines = [`--- a/${path}`, `+++ b/${path}`];
  for (const patch of patches) {
    lines.push(
      `@@ -${patch.oldStart},${patch.oldLines} +${patch.newStart},${patch.newLines} @@`,
      ...patch.lines,
    );
  }
  return lines.join("\n");
}

function openDiff(
  item: FileChangeItem,
  context: Pick<
    ConversationRowRenderContext,
    "workspacePath" | "workspaceIdentity" | "workspaceRemoteSessionId" | "onOpenCodeViewer"
  >,
) {
  const patch = formatPatch(item.path, item.patches);
  const { workspacePath, workspaceIdentity, workspaceRemoteSessionId, onOpenCodeViewer } = context;
  if (!patch || !onOpenCodeViewer) return;
  const relativePath = toWorkspaceRelativePath(workspacePath, item.path);
  onOpenCodeViewer({
    type: "patch",
    title: relativePath,
    path: item.path,
    patch,
    workspacePath,
    ...(workspaceIdentity ? { workspaceIdentity } : {}),
    ...(workspaceRemoteSessionId ? { workspaceRemoteSessionId } : {}),
  });
}

export function ConversationFileSummaryPanel({
  header,
  context,
  assistantText = "",
  details,
}: ConversationFileSummaryPanelProps) {
  const { intl } = useZCodeIntl();
  const genUiSources = useMemo(() => collectGenUiSourcePaths(assistantText), [assistantText]);
  const [open, setOpen] = useState(false);
  const items = useMemo(
    () => details?.items.filter((item) => !matchesGenUiSourcePath(item.path, genUiSources)) ?? [],
    [details, genUiSources],
  );
  const summary =
    details && items.length !== details.items.length && header.fileChanges
      ? {
          ...header.fileChanges,
          files: items.length,
          additions: items.reduce((sum, item) => sum + (item.additions ?? 0), 0),
          deletions: items.reduce((sum, item) => sum + (item.deletions ?? 0), 0),
        }
      : header.fileChanges;

  const filesChangedLabel = intl.formatMessage(
    {
      id:
        summary?.files === 1
          ? "chat.changeSummary.filesChanged.one"
          : "chat.changeSummary.filesChanged.other",
    },
    { count: String(summary?.files ?? 0) },
  );
  const isReverted = summary?.state === "reverted";

  if (!summary || summary.files <= 0) return null;

  return (
    <>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="overflow-hidden rounded-xl border border-border bg-card shadow-none"
      >
        <div className="flex h-10 items-center justify-between gap-3 px-2 transition-colors hover:bg-hover">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              disabled={details === undefined}
              className="flex h-full min-w-0 flex-1 items-center gap-2 px-1 text-left text-ui-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
              aria-label={intl.formatMessage({
                id: open ? "chat.changeSummary.collapse" : "chat.changeSummary.expand",
              })}
            >
              <ChevronRightIcon
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 text-foreground-subtlest transition-transform",
                  open ? "rotate-90" : "rotate-0",
                )}
              />
              <span className="min-w-0 truncate font-medium">{filesChangedLabel}</span>
              <span className="shrink-0 tabular-nums">
                <span className="text-diff-added">+{summary.additions}</span>{" "}
                <span className="text-diff-removed">-{summary.deletions}</span>
              </span>
              {isReverted ? (
                <span className="shrink-0 rounded-sm bg-input px-1.5 py-0.5 text-ui-xs text-foreground-subtle">
                  {intl.formatMessage({ id: "chat.changeSummary.reverted" })}
                </span>
              ) : null}
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="grid w-full border-t border-border">
            {details && items.length === 0 ? (
              <div className="px-2 py-1.5 text-ui-base text-foreground-subtle">
                {intl.formatMessage({
                  id: "chat.changeSummary.diffUnavailable",
                })}
              </div>
            ) : (
              items.map((item) => {
                const relativePath = toWorkspaceRelativePath(context.workspacePath, item.path);
                const canReview = item.patches.length > 0 && Boolean(context.onOpenCodeViewer);
                const filePreviewSource = buildChangeSummaryFilePreviewSource({
                  path: item.path,
                  relativePath,
                  workspacePath: context.workspacePath,
                  workspaceIdentity: context.workspaceIdentity,
                  workspaceRemoteSessionId: context.workspaceRemoteSessionId,
                });
                return (
                  <div key={item.path} className="w-full bg-background/50 overflow-hidden">
                    <div
                      aria-disabled={!canReview}
                      className={cn(
                        "flex w-full items-center gap-1 px-2 py-2 text-left transition-colors",
                        canReview ? "cursor-pointer hover:bg-hover/30" : "cursor-default",
                      )}
                      onClick={() => openDiff(item, context)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        openDiff(item, context);
                      }}
                      role="button"
                      tabIndex={canReview ? 0 : -1}
                      title={item.path}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="min-w-0 flex items-center">
                          <FileDisplayInline
                            path={item.path}
                            options={{
                              basePath: context.workspacePath,
                              showFilePath: true,
                              className: "inline-flex min-w-0 max-w-full items-center gap-1.5",
                              fileNameClassName:
                                "truncate text-ui-base font-medium text-foreground",
                              filePathClassName: "truncate text-ui-base text-foreground-subtlest",
                            }}
                          />
                        </div>
                        {/* 修复原因：writeCount 是撤销预检使用的操作轨迹，摘要行已经用 +/- 表达最终结果；
                            在这里展示会把内部操作次数误当成变更指标，因此只在撤销弹窗保留。 */}
                        <span className="flex shrink-0 items-center gap-2 tabular-nums text-ui-base">
                          {item.additions > 0 ? (
                            <span className="text-diff-added">+{item.additions}</span>
                          ) : null}
                          {item.deletions > 0 ? (
                            <span className="text-diff-removed">-{item.deletions}</span>
                          ) : null}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="default"
                          aria-label={intl.formatMessage({
                            id: "chat.changeSummary.review",
                          })}
                          title={intl.formatMessage({
                            id: "chat.changeSummary.review",
                          })}
                          disabled={!canReview}
                          className="h-7 gap-1.5 rounded-lg bg-input px-2 text-ui-base"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDiff(item, context);
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <span>
                            {intl.formatMessage({
                              id: "chat.changeSummary.review",
                            })}
                          </span>
                        </Button>
                        <OpenSplitButton
                          target={{
                            type: "file",
                            path: item.path,
                            title: relativePath,
                            label: relativePath,
                            previewSource: filePreviewSource,
                          }}
                          onOpenCodeViewer={context.onOpenCodeViewer}
                          hideOpenWithMenu={context.compactForRemoteControl === true}
                          stopPropagation
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
