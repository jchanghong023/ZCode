import { useLayoutEffect, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  requirementMaterialName,
  type AIReqDiscussionAgent,
  type AIReqDocumentValidation,
  type AIReqRequirementGroup,
} from "../contract.js";

const englishFileNames = new Map([
  ["requirements.md", "Business requirements"],
  ["sr-dependencies.json", "SR dependency manifest"],
  ["proposal.md", "SR proposal"],
  ["design.md", "Technical design"],
  ["spec.md", "SR specification"],
  ["tasks.md", "Development tasks"],
  ["test-plan.md", "Test plan"],
]);

function documentName(path: string, zh: boolean) {
  const fileName = path.split("/").at(-1) || path;
  if (!zh) return englishFileNames.get(fileName) ?? fileName;
  return fileName === "sr-dependencies.json"
    ? "SR 依赖清单"
    : (requirementMaterialName(path) ?? fileName);
}

interface Props {
  canConfirm: boolean;
  sessions: AIReqRequirementGroup["sessions"];
  requirementsPath: string;
  validateVersion(): Promise<AIReqDocumentValidation>;
  confirmVersion(snapshot: string): Promise<AIReqDocumentValidation | undefined>;
  focusVersion(): void;
  openRepairAgent(agent: AIReqDiscussionAgent): void;
}

export function AIReqDocumentConfirmation({
  canConfirm,
  sessions,
  requirementsPath,
  validateVersion,
  confirmVersion,
  focusVersion,
  openRepairAgent,
}: Props) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<AIReqDocumentValidation | { error: string }>();
  const [busy, setBusy] = useState<"check" | "confirm">();
  const flight = useRef(false);
  const saved = useRef(false);
  const repairDestination = useRef<AIReqDiscussionAgent>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const error = result && "error" in result ? result.error : undefined;
  const validation = result && "issues" in result ? result : undefined;
  const snapshot = validation?.issues.length === 0 ? validation.snapshot : undefined;
  const passed = snapshot !== undefined;
  const repairActions = [
    {
      agent: "requirements",
      visible:
        sessions.some((session) => session.phase === "requirements") &&
        validation?.issues.some(({ path }) => path === requirementsPath),
      label: zh ? "前往需求 Agent" : "Go to Requirements Agent",
    },
    {
      agent: "solution",
      visible:
        sessions.some((session) => session.phase === "solution") &&
        validation?.issues.some(({ path }) => path !== requirementsPath),
      label: zh ? "前往方案 Agent" : "Go to Solution Agent",
    },
  ] as const;

  useLayoutEffect(() => {
    // 复核或重试报告新问题时，原操作可能已移除，焦点回到可用的关闭按钮。
    if (open && result && !passed) cancel.current?.focus();
  }, [open, passed, result]);

  const run = async (snapshot?: string) => {
    if (flight.current || !canConfirm) return;
    flight.current = true;
    setBusy(snapshot === undefined ? "check" : "confirm");
    try {
      const validation = await (snapshot === undefined ? validateVersion() : confirmVersion(snapshot));
      if (validation) {
        setResult(validation);
        setOpen(true);
      } else {
        saved.current = true;
        setOpen(false);
      }
    } catch (cause) {
      setResult({
        error: formatUserFacingError(
          cause,
          zh ? "操作暂未完成，请重新检查。" : "Could not finish. Check the files again.",
        ),
      });
      setOpen(true);
    } finally {
      flight.current = false;
      setBusy(undefined);
    }
  };

  return (
    <>
      {canConfirm && (
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          size="lg"
          aria-disabled={busy !== undefined}
          aria-busy={busy === "check"}
          className="aria-disabled:opacity-60"
          data-testid="confirm-document-version"
          onClick={() => void run()}
        >
          {busy === "check"
            ? zh
              ? "正在检查…"
              : "Checking…"
            : zh
              ? "确认版本"
              : "Confirm version"}
        </Button>
      )}
      <AlertDialog
        open={open}
        onOpenChange={(open) => {
          if (!open && !flight.current) setOpen(false);
        }}
      >
        <AlertDialogContent
          className="flex max-h-[80dvh] flex-col gap-4 sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (saved.current || !trigger.current) focusVersion();
            else trigger.current.focus();
            saved.current = false;
            const destination = repairDestination.current;
            repairDestination.current = undefined;
            // 等当前弹窗释放焦点后再导航，避免和未保存门禁弹窗抢焦点。
            if (destination) openRepairAgent(destination);
          }}
        >
          <AlertDialogHeader className="shrink-0">
            <AlertDialogTitle>
              {passed
                ? zh
                  ? `确认定版 V${validation?.version}`
                  : `Confirm V${validation?.version}`
                : zh
                  ? "文档检查未通过"
                  : "Document check failed"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {error ??
                (passed
                  ? zh
                    ? `${validation?.fileCount} 个文件已通过检查。定版将保存全部文件，并记录确认人和时间。`
                    : `${validation?.fileCount} files passed the checks. Confirmation saves all files and records who confirmed and when.`
                  : zh
                    ? "请通过对应 Agent 补齐或修正文件，再次检查。"
                    : "Use the corresponding Agent to add or correct these files, then check again.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {validation && !passed && (
            <div
              tabIndex={0}
              role="region"
              aria-label={zh ? "文件检查结果" : "File check results"}
              className="min-h-0 space-y-4 overflow-y-auto overscroll-contain"
              data-testid="document-validation-issues"
            >
              {(["missing", "invalid"] as const).map((kind) => {
                const issues = validation.issues.filter((item) => item.kind === kind);
                if (!issues.length) return null;
                const label =
                  kind === "missing"
                    ? zh
                      ? "缺失文件"
                      : "Missing files"
                    : zh
                      ? "不合法的文件"
                      : "Invalid files";
                return (
                  <section key={kind}>
                    <h3 className="mb-2 text-ui-base font-semibold">
                      {label}{" "}
                      <span className="text-foreground-subtle tabular-nums">{issues.length}</span>
                    </h3>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {issues.map(({ path, reason }) => (
                        <li key={path} className="space-y-1 px-3 py-2">
                          <p className="wrap-anywhere text-ui-base font-medium">
                            {documentName(path, zh)}
                          </p>
                          <code className="block font-mono wrap-anywhere text-ui-caption text-foreground-subtle">
                            {path}
                          </code>
                          <p className="wrap-anywhere text-ui-caption">{reason}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
          <AlertDialogFooter className="shrink-0 sm:flex-wrap">
            <AlertDialogCancel ref={cancel} aria-disabled={busy !== undefined}>
              {passed ? (zh ? "取消" : "Cancel") : zh ? "关闭" : "Close"}
            </AlertDialogCancel>
            {repairActions.map(({ agent, visible, label }) =>
              visible ? (
                <Button
                  key={agent}
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (flight.current) return;
                    repairDestination.current = agent;
                    setOpen(false);
                  }}
                >
                  {label}
                </Button>
              ) : null,
            )}
            {(passed || error) && (
              <AlertDialogAction
                aria-disabled={busy !== undefined || !canConfirm}
                aria-busy={busy !== undefined}
                className="aria-disabled:opacity-60"
                onClick={(event) => {
                  event.preventDefault();
                  void run(snapshot);
                }}
              >
                {busy === "confirm"
                  ? zh
                    ? "正在定版…"
                    : "Confirming…"
                  : busy === "check"
                    ? zh
                      ? "正在检查…"
                      : "Checking…"
                    : passed
                      ? zh
                        ? "确认定版"
                        : "Confirm version"
                      : zh
                        ? "重新检查"
                        : "Check again"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
