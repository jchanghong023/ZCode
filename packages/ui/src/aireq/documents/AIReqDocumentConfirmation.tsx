import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  fileVersions,
  type AIReqDiscussionAgent,
  type AIReqDocumentValidation,
  type AIReqMaterialView,
  type AIReqRequirementGroup,
} from "../contract.js";
import { materialName } from "./materialName.js";

interface Props {
  group: AIReqRequirementGroup;
  materials: AIReqMaterialView[];
  srName(id: string): string | undefined;
  validateVersion(): Promise<AIReqDocumentValidation>;
  confirmVersion(snapshot: string): Promise<AIReqDocumentValidation | undefined>;
  focusVersion(): void;
  readFile(path: string): void;
  openRepairAgent(agent: AIReqDiscussionAgent): void;
}

export function AIReqDocumentConfirmation({
  group,
  materials,
  srName,
  validateVersion,
  confirmVersion,
  focusVersion,
  readFile,
  openRepairAgent,
}: Props) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [validation, setValidation] = useState<AIReqDocumentValidation>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<"check" | "confirm">();
  const flight = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const footer = useRef<HTMLElement>(null);
  const manifest = useRef<HTMLDetailsElement>(null);
  const open = Boolean(validation || error);
  const eligible = !!group.documentVersion && !group.documentVersion.confirmation;
  const requirementOnly = validation?.scope === "requirements";
  const scopeName = requirementOnly ? (zh ? "需求" : "requirements") : zh ? "方案" : "solution";
  const scoped = requirementOnly
    ? materials.filter((m) => m.path === group.documentPath)
    : materials;
  // 同版草稿可继续修改。展示中的正文与预检清单不再一致时，不能签署旧结果。
  const changed =
    validation &&
    (group.documentVersion?.number !== validation.version ||
      !eligible ||
      fileVersions(scoped) !== fileVersions(validation.files));
  const passed = validation && !validation.issues.length && !changed && !error && eligible;
  const owners = new Map(materials.map((file) => [file.path, file.srId]));
  const fileGroups = new Map<string | undefined, string[]>();
  for (const { path } of validation?.files ?? []) {
    const sr = owners.get(path);
    const paths = fileGroups.get(sr);
    if (paths) paths.push(path);
    else fileGroups.set(sr, [path]);
  }
  useLayoutEffect(() => {
    if (open) cancel.current?.focus({ preventScroll: true });
  }, [open]);

  async function run(snapshot?: string) {
    if (flight.current || !eligible) return;
    flight.current = true;
    setBusy(snapshot === undefined ? "check" : "confirm");
    setError(undefined);
    try {
      if (snapshot === undefined) {
        setValidation(await validateVersion());
      } else {
        const result = await confirmVersion(snapshot);
        setValidation(result);
        if (!result && footer.current?.isConnected) focusVersion();
      }
    } catch (cause) {
      setValidation(undefined);
      setError(
        formatUserFacingError(cause, zh ? "操作未完成，请重新检查。" : "Check the files again."),
      );
    } finally {
      flight.current = false;
      setBusy(undefined);
    }
  }
  function dismiss() {
    if (flight.current) return;
    setValidation(undefined);
    setError(undefined);
    if (eligible) requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
    else focusVersion();
  }

  if (!eligible && !open && !busy) return null;
  return (
    <section
      ref={footer}
      aria-label={zh ? "定版核对" : "Version confirmation"}
      className="max-h-[42%] shrink-0 overflow-y-auto border-t border-border bg-card px-4 py-2 text-ui-sm"
    >
      {!open ? (
        <Button
          ref={trigger}
          variant="outline"
          disabled={!!busy}
          data-testid="confirm-document-version"
          onClick={() => void run()}
        >
          {busy
            ? zh
              ? "正在检查…"
              : "Checking…"
            : zh
              ? "检查定版条件"
              : "Check version for confirmation"}
        </Button>
      ) : (
        <>
          <p className="font-medium wrap-anywhere">
            {group.title} · {group.id}
          </p>
          {validation && (
            <p role="status" className="mt-1">
              {zh
                ? `${scopeName} V${validation.version ?? "—"} · ${validation.fileCount} 个文件`
                : `${scopeName} V${validation.version ?? "—"} · ${validation.fileCount} files`}
            </p>
          )}
          {(error || changed) && (
            <p role="alert" className="mt-1 text-destructive">
              {error ??
                (zh
                  ? "文档已变化，请重新检查。"
                  : "Documents changed. Check the current version again.")}
            </p>
          )}
          {validation && !changed && !!validation.files.length && (
            <details ref={manifest} className="my-1">
              <summary className="cursor-pointer py-1">
                {zh ? "本次定版文件" : "Files in this version"}
              </summary>
              {[...fileGroups].map(([sr, paths]) => (
                <div key={sr ?? ""} className="mt-2">
                  <p className="font-medium">
                    {sr ? `SR · ${srName(sr) ?? sr}` : zh ? "IR 共享材料" : "IR documents"}
                  </p>
                  {paths.map((path) => (
                    <button
                      type="button"
                      key={path}
                      title={path}
                      onClick={() => {
                        // 展开清单只是为了选文件，选中后把正文空间和键盘焦点交还阅读器。
                        if (manifest.current) manifest.current.open = false;
                        readFile(path);
                      }}
                      className="block w-full rounded-sm px-2 py-1 text-left hover:bg-hover focus-visible:ring-1"
                    >
                      {materialName(path, zh)}
                      {path.includes("/imports/") && (zh ? "（导入）" : " (imported)")}
                    </button>
                  ))}
                </div>
              ))}
            </details>
          )}
          {validation && !changed && !!validation.issues.length && (
            <div data-testid="document-validation-issues" className="my-2 space-y-1">
              {(["missing", "invalid"] as const).map((kind) => {
                const issues = validation.issues.filter((issue) => issue.kind === kind);
                if (!issues.length) return null;
                return (
                  <div key={kind}>
                    <h3 className="font-medium">
                      {kind === "missing"
                        ? zh
                          ? "缺失文件"
                          : "Missing files"
                        : zh
                          ? "不合法的文件"
                          : "Invalid files"}{" "}
                      · {issues.length}
                    </h3>
                    <ul className="divide-y divide-border">
                      {issues.map(({ path, reason }) => (
                        <li key={path} className="py-1 wrap-anywhere">
                          {kind === "invalid" ? (
                            <Button variant="link" onClick={() => readFile(path)}>
                              {materialName(path, zh)}
                            </Button>
                          ) : (
                            <span>{materialName(path, zh)}</span>
                          )}
                          <code className="block text-ui-caption">{path}</code>
                          <p>{reason}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {group.sessions.map(
                ({ phase }) =>
                  validation.issues.some(
                    ({ path }) =>
                      (path === group.documentPath ? "requirements" : "solution") === phase,
                  ) && (
                    <Button
                      key={phase}
                      variant="secondary"
                      disabled={!!busy}
                      onClick={() => {
                        setValidation(undefined);
                        openRepairAgent(phase);
                      }}
                    >
                      {phase === "requirements"
                        ? zh
                          ? "前往需求 Agent"
                          : "Go to Requirements Agent"
                        : zh
                          ? "前往方案 Agent"
                          : "Go to Solution Agent"}
                    </Button>
                  ),
              )}
            </div>
          )}
          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 bg-card py-1">
            <Button ref={cancel} variant="ghost" disabled={!!busy} onClick={dismiss}>
              {zh ? "取消" : "Cancel"}
            </Button>
            {passed ? (
              <Button disabled={!!busy} onClick={() => void run(validation.snapshot)}>
                {busy
                  ? zh
                    ? "正在定版…"
                    : "Confirming…"
                  : zh
                    ? `确认${scopeName} V${validation.version} 定版（${validation.fileCount} 个文件）`
                    : `Confirm ${scopeName} V${validation.version} (${validation.fileCount} files)`}
              </Button>
            ) : (
              eligible && (
                <Button variant="outline" disabled={!!busy} onClick={() => void run()}>
                  {busy ? (zh ? "正在检查…" : "Checking…") : zh ? "重新检查" : "Check again"}
                </Button>
              )
            )}
          </div>
        </>
      )}
    </section>
  );
}
