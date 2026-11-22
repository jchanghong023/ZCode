import {
  TID_V4_EDIT_WORKSPACE_CONFLICT_CONVERSATION_ONLY,
  TID_V4_EDIT_WORKSPACE_CONFLICT_DIALOG,
} from "@zcode/shared/test-ids";
import type { V4ConversationFileRewindPreviewResult } from "@zcode/shared/zcode-protocol-v4";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

type FileRewindPreviewFile =
  | V4ConversationFileRewindPreviewResult["unsafeFiles"][number]
  | V4ConversationFileRewindPreviewResult["ignoredFiles"][number];

interface ConversationEditConflictDialogProps {
  onOpenChange: (open: boolean) => void;
  preview: V4ConversationFileRewindPreviewResult;
  onConversationOnly: () => void;
}

function formatReason(reason: string, intl: ReturnType<typeof useZCodeIntl>["intl"]) {
  const fallbackReasonKey = "chat.changeSummary.rewindDialog.reason.unsupportedCheckpoint";
  const keyByReason: Record<string, string> = {
    bash_ignored: "chat.changeSummary.rewindDialog.reason.bashIgnored",
    checkpoint_missing: "chat.changeSummary.rewindDialog.reason.checkpointMissing",
    checkpoint_unreadable: "chat.changeSummary.rewindDialog.reason.checkpointUnreadable",
    external_modified: "chat.changeSummary.rewindDialog.reason.externalModified",
    file_read_failed: "chat.changeSummary.rewindDialog.reason.fileReadFailed",
    unsupported_checkpoint: fallbackReasonKey,
  };
  return intl.formatMessage({ id: keyByReason[reason] ?? fallbackReasonKey });
}

function PreviewFileList({
  files,
  type,
}: {
  files: readonly FileRewindPreviewFile[];
  type: "unsafe" | "ignored";
}) {
  const { intl } = useZCodeIntl();
  if (files.length === 0) return null;
  return (
    <div className="grid gap-1">
      {files.map((file) => (
        <div
          key={`${type}:${file.path}`}
          className="flex items-center justify-between gap-3 rounded-md border border-border bg-input/30 px-2 py-1.5"
        >
          <span className="min-w-0 truncate font-mono text-ui-xs text-foreground">{file.path}</span>
          <span className="shrink-0 text-ui-xs text-foreground-subtle">
            {formatReason(file.reason, intl)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ConversationEditConflictDialog({
  onOpenChange,
  preview,
  onConversationOnly,
}: ConversationEditConflictDialogProps) {
  const { intl } = useZCodeIntl();
  const unsafeCount = preview.unsafeFiles.length;
  const ignoredCount = preview.ignoredFiles.length;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid={TID_V4_EDIT_WORKSPACE_CONFLICT_DIALOG}>
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({ id: "chat.edit.workspaceConflict.title" })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({ id: "chat.edit.workspaceConflict.description" })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[50vh] gap-3 overflow-y-auto pr-1">
          <section className="grid gap-1">
            <h3 className="text-ui-base font-medium">
              {intl.formatMessage(
                { id: "chat.changeSummary.rewindDialog.unsafeTitle" },
                { count: String(unsafeCount) },
              )}
            </h3>
            <PreviewFileList files={preview.unsafeFiles} type="unsafe" />
          </section>
          {ignoredCount > 0 ? (
            <section className="grid gap-1">
              <h3 className="text-ui-base font-medium">
                {intl.formatMessage(
                  { id: "chat.changeSummary.rewindDialog.ignoredTitle" },
                  { count: String(ignoredCount) },
                )}
              </h3>
              <PreviewFileList files={preview.ignoredFiles} type="ignored" />
            </section>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {intl.formatMessage({ id: "common.cancel" })}
          </Button>
          <Button
            type="button"
            data-testid={TID_V4_EDIT_WORKSPACE_CONFLICT_CONVERSATION_ONLY}
            onClick={onConversationOnly}
          >
            {intl.formatMessage({ id: "chat.edit.workspaceConflict.conversationOnly" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
