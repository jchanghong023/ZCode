import { useEffect, useMemo, useRef, useState } from "react";
import { createUuid } from "@zcode/shared";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
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
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqIdea } from "../contract.js";
import {
  downloadProposalCsv,
  parseProposalCsv,
  ProposalCsvError,
} from "../proposals/proposal-csv.js";

export function AIReqIdeaImportExport({ ideas }: { ideas: readonly AIReqIdea[] }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imported, setImported] = useState<number>();
  const [discard, setDiscard] = useState(false);
  const [operationId, setOperationId] = useState(() => createUuid());
  const [expectedRevision, setExpectedRevision] = useState<number>();
  const generation = useRef(0);
  const submitting = useRef(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const { setDraftNavigationGuard } = ai;
  const allIdeas = ai.view?.ideas;
  const parsed = useMemo(() => {
    if (content === null) return { preview: null, error: "" };
    try {
      return {
        preview: parseProposalCsv(
          content,
          (allIdeas ?? []).map((idea) => idea.originalText),
        ),
        error: "",
      };
    } catch (error) {
      return {
        preview: null,
        error:
          zh && error instanceof ProposalCsvError
            ? error.message
            : zh
              ? "CSV 解析失败，请检查文件格式。"
              : "Could not parse the CSV. Check its format.",
      };
    }
  }, [content, allIdeas, zh]);
  const dirty = open && Boolean(fileName);
  useEffect(() => {
    if (!dirty && !busy) return;
    setDraftNavigationGuard((next) => {
      if (submitting.current || pendingNavigation.current) return;
      pendingNavigation.current = next;
      setDiscard(true);
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      setDraftNavigationGuard(null);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty, busy, setDraftNavigationGuard]);
  useEffect(() => {
    const current = generation;
    return () => {
      current.current++;
    };
  }, [open]);
  const close = () => {
    if (!submitting.current) ai.navigate(() => setOpen(false));
  };
  const submit = async () => {
    if (!parsed.preview?.texts.length || reading || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    const revision = expectedRevision ?? ai.view!.revision;
    setExpectedRevision(revision);
    try {
      const result = await ai.command({
        type: "importIdeas",
        originalTexts: parsed.preview.texts,
        operationId,
        expectedRevision: revision,
      });
      if (!result) {
        setFailed(true);
        return;
      }
      setImported(parsed.preview.texts.length);
      setDraftNavigationGuard(null);
      setOpen(false);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const error = fileError || parsed.error;
  return (
    <>
      {imported !== undefined && (
        <span role="status" className="text-ui-sm text-foreground-subtle">
          {zh ? `已导入 ${imported} 条想法` : `Imported ${imported} ideas`}
        </span>
      )}
      <Button
        variant="outline"
        disabled={!ideas.length || !ai.view}
        onClick={() =>
          downloadProposalCsv(
            ideas.map((idea) => idea.originalText),
            "想法池.csv",
          )
        }
      >
        <Download aria-hidden="true" className="size-4" />
        {zh ? "导出" : "Export"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) {
            close();
            return;
          }
          setContent(null);
          setFileName("");
          setFileError("");
          setFailed(false);
          setReading(false);
          setOperationId(createUuid());
          setExpectedRevision(ai.view?.revision);
          setOpen(true);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" disabled={!ai.view || ai.pending}>
            <Upload aria-hidden="true" className="size-4" />
            {zh ? "导入" : "Import"}
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{zh ? "导入想法" : "Import ideas"}</DialogTitle>
            <DialogDescription>
              {zh
                ? "UTF-8 CSV，仅一列“原始需求”。确认前不写入，重复正文保留，无需选择项目或版本。"
                : "UTF-8 CSV with one column named 原始需求. Preview before saving; duplicates are retained. No project or release is required."}
            </DialogDescription>
          </DialogHeader>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => downloadProposalCsv([], "想法池导入模板.csv")}
          >
            {zh ? "下载模板" : "Download template"}
          </Button>
          <Input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            aria-label={zh ? "选择 UTF-8 CSV 文件" : "Choose a UTF-8 CSV file"}
            className="text-transparent file:text-foreground"
            onChange={async (event) => {
              const current = ++generation.current;
              const file = event.target.files?.[0];
              event.target.value = "";
              setContent(null);
              setFileName(file?.name ?? "");
              setFileError("");
              setFailed(false);
              setOperationId(createUuid());
              setExpectedRevision(ai.view?.revision);
              setReading(Boolean(file));
              if (!file) return;
              try {
                const value = new TextDecoder("utf-8", { fatal: true }).decode(
                  await file.arrayBuffer(),
                );
                // 关闭、离开或重选文件后，迟到的读取不能污染当前预览。
                if (current === generation.current) setContent(value);
              } catch {
                if (current === generation.current)
                  setFileError(
                    zh
                      ? "文件读取失败，请确认 CSV 为有效的 UTF-8 编码。"
                      : "Could not read the file. Choose a valid UTF-8 CSV.",
                  );
              } finally {
                if (current === generation.current) setReading(false);
              }
            }}
          />
          {fileName && (
            <p className="break-all text-ui-sm text-foreground-subtle">
              {zh ? "已选择：" : "Selected: "}
              {fileName}
            </p>
          )}
          {reading && (
            <p role="status" className="text-ui-sm text-foreground-subtle">
              {zh ? "正在读取文件…" : "Reading file…"}
            </p>
          )}
          {error && (
            <p role="alert" className="text-ui-sm text-destructive">
              {error}
            </p>
          )}
          {parsed.preview && (
            <>
              <p role="status">
                {zh
                  ? `将导入 ${parsed.preview.texts.length} 条，跳过 ${parsed.preview.skipped} 个空行。`
                  : `${parsed.preview.texts.length} ideas to import; ${parsed.preview.skipped} blank rows skipped.`}
              </p>
              {parsed.preview.duplicateRows.length > 0 && (
                <p className="text-ui-sm text-foreground-subtle">
                  {zh
                    ? `第 ${parsed.preview.duplicateRows.join("、")} 行与已有或本批正文重复；仍全部导入，不自动去重。`
                    : `Duplicate content at rows ${parsed.preview.duplicateRows.join(", ")}; all entries will be retained.`}
                </p>
              )}
              <ol className="max-h-64 list-decimal space-y-2 overflow-y-auto pl-6 text-ui-base">
                {parsed.preview.texts.map((text, index) => (
                  <li key={index} className="whitespace-pre-wrap break-words">
                    {text}
                  </li>
                ))}
              </ol>
            </>
          )}
          {failed && (
            <div className="space-y-2">
              <p role="alert" className="text-ui-sm text-destructive">
                {ai.error ??
                  (zh
                    ? "导入未完成，文件和输入已保留。"
                    : "Import did not complete. Your input has been retained.")}
              </p>
              <Button
                variant="outline"
                disabled={busy || ai.pending}
                onClick={async () => {
                  if (submitting.current) return;
                  submitting.current = true;
                  setBusy(true);
                  try {
                    await ai.refresh();
                    setExpectedRevision(undefined);
                  } catch {
                    setFailed(true);
                  } finally {
                    submitting.current = false;
                    setBusy(false);
                  }
                }}
              >
                {zh ? "刷新版本后重试" : "Refresh before retrying"}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={close}>
              {zh ? "取消" : "Cancel"}
            </Button>
            <Button
              disabled={
                !parsed.preview?.texts.length || Boolean(error) || reading || busy || !ai.view
              }
              onClick={() => void submit()}
            >
              {busy ? (zh ? "正在导入…" : "Importing…") : zh ? "确认导入" : "Confirm import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={discard}
        onOpenChange={(value) => {
          setDiscard(value);
          if (!value) pendingNavigation.current = null;
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {zh ? "放弃未导入的内容？" : "Discard this import?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {zh
                ? "所选文件尚未导入，离开将放弃当前预览。"
                : "The selected file has not been imported. Leaving will discard this preview."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pendingNavigation.current = null;
              }}
            >
              {zh ? "继续编辑" : "Keep editing"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const next = pendingNavigation.current;
                pendingNavigation.current = null;
                generation.current++;
                setOpen(false);
                setDiscard(false);
                setDraftNavigationGuard(null);
                next?.();
              }}
            >
              {zh ? "放弃导入" : "Discard import"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
