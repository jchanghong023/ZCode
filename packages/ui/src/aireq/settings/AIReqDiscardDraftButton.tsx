import { useRef, type ComponentProps, type RefObject } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.js";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function AIReqDiscardDraftButton({
  description,
  disabled,
  onDiscard,
  focusAfterDiscard,
  size,
}: {
  description: string;
  disabled: boolean;
  onDiscard(): void;
  focusAfterDiscard: RefObject<HTMLElement | null>;
  size?: ComponentProps<typeof Button>["size"];
}) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const discarded = useRef(false);
  const label = zh ? "放弃全部草稿" : "Discard all drafts";

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size={size} disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            // 放弃确认仍待决定，不能让全局快捷键先提交这些草稿。
            event.stopPropagation();
          }
        }}
        onCloseAutoFocus={(event) => {
          // 放弃后触发按钮会禁用；确认时回到正文，继续编辑则由弹窗恢复到触发按钮。
          if (discarded.current && focusAfterDiscard.current?.isConnected) {
            event.preventDefault();
            focusAfterDiscard.current.focus();
          }
          discarded.current = false;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{zh ? "放弃全部草稿？" : "Discard all drafts?"}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{zh ? "继续编辑" : "Keep editing"}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={disabled}
            className="border-destructive/40 bg-destructive-surface text-destructive-surface-foreground hover:bg-destructive-surface/80 focus-visible:border-destructive"
            onClick={() => {
              discarded.current = true;
              onDiscard();
            }}
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
