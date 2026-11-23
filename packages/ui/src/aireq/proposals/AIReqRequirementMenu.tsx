import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqRequirementGroup } from "../contract.js";

export function AIReqRequirementMenu({ group }: { group: AIReqRequirementGroup }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmed = Boolean(group.documentVersion?.confirmation || group.documentHistory.length);
  if (confirmed && !open) return null;
  const remove = async () => {
    if (confirmed || inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    try {
      const result = await ai.command({
        type: "deleteRequirement",
        projectId: group.projectId,
        irId: group.id,
      });
      if (result?.receipt.status === "completed") setOpen(false);
    } finally {
      inFlight.current = false;
      setDeleting(false);
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="icon-lg"
            aria-label={zh ? "更多需求操作" : "More requirement actions"}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive-surface-foreground data-highlighted:bg-destructive-surface data-highlighted:text-destructive-surface-foreground"
            disabled={confirmed}
            onSelect={() => setOpen(true)}
          >
            {zh ? "移除需求" : "Remove requirement"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!inFlight.current) setOpen(next);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {zh ? `移除需求「${group.title}」？` : `Remove “${group.title}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {zh
                ? "此需求的文档和对话将无法再访问。"
                : "This requirement's documents and conversations will no longer be available."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {ai.error && (
            <p className="text-ui-sm text-destructive" role="alert">
              {ai.error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{zh ? "取消" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="border-destructive/40 bg-destructive-surface text-destructive-surface-foreground hover:border-destructive/70 hover:bg-destructive-surface"
              disabled={deleting || confirmed}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {zh ? "确认移除" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
