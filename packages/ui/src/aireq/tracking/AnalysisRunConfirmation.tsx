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

/** 人工批量分析的共同成本确认；打开或取消不提交任务。 */
export function AnalysisRunConfirmation({
  open,
  onOpenChange,
  scope,
  count,
  unit,
  disabled,
  onConfirm,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  scope: string;
  count: number;
  unit: "SR" | "Issue";
  disabled: boolean;
  onConfirm(): void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>确认开始分析？</AlertDialogTitle>
          <AlertDialogDescription>
            本原型仅模拟 AI 分析，不调用真实模型。实际使用 AI 时会消耗 Token
            并需要等待；这里不代表真实用量或耗时。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 break-words text-ui-base">
          <p>{scope}</p>
          <p className="text-foreground-subtle">
            本次提交 {count} 个 {unit}，以提交时的可分析状态为准。
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction disabled={disabled || count < 1} onClick={onConfirm}>
            开始分析
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
