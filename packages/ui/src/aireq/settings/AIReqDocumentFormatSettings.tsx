import { useLayoutEffect, useRef, useState } from "react";
import { createUuid } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { SettingsFormActions } from "@/settings/SettingsFormActions.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";
import { useAIReq } from "../AIReqContext.js";
import {
  AIREQ_DOCUMENT_PATHS,
  type AIReqDocumentFormats,
  type AIReqDocumentName,
  type AIReqSettingsDraftActions,
  type AIReqWorkflowView,
} from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";

const files = Object.keys(AIREQ_DOCUMENT_PATHS) as AIReqDocumentName[];
const documentGroups = [
  { id: "ir", title: "IR", files: files.filter((name) => name === "requirements.md") },
  { id: "sr", title: "SR", files: files.filter((name) => name !== "requirements.md") },
];
type Baseline = Pick<AIReqWorkflowView, "documentFormats" | "revision">;
type Edits = Partial<Record<AIReqDocumentName, string>>;

export function AIReqDocumentFormatSettings({
  onDraftActionsChange,
  onSave,
}: {
  onDraftActionsChange: (actions: AIReqSettingsDraftActions | null) => void;
  onSave: () => void;
}) {
  const source = useAIReqDataSource();
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [read, setRead] = useState<Baseline>();
  const [baseline, setBaseline] = useState<Baseline>();
  const [edits, setEdits] = useState<Edits>({});
  const [pending, setPending] = useState<"save" | "read">();
  const pendingRef = useRef(false);
  const operation = useRef<{ payload: string; id: string } | null>(null);
  const [message, setMessage] = useState<{ error?: boolean; text: string }>();
  const [needsRead, setNeedsRead] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const latest = read && (!ai.view || read.revision >= ai.view.revision) ? read : ai.view;
  const original = baseline ?? latest;
  const dirty = Object.keys(edits).length > 0;
  const conflicted =
    dirty && (needsRead || Boolean(latest && baseline && latest.revision !== baseline.revision));
  const conflictMessage = zh
    ? "保存前请重新读取最新规则。本页编辑将保留，请核对后再保存。"
    : "Reload the latest rules before saving. Your edits will be preserved for review.";

  const discard = () => {
    if (pendingRef.current) return;
    setEdits({});
    setBaseline(undefined);
    setNeedsRead(false);
    setShowSaved(false);
    setMessage(undefined);
    operation.current = null;
  };
  const save = async () => {
    if (pendingRef.current || !dirty || !original || conflicted) return false;
    const documentFormats: AIReqDocumentFormats = { ...original.documentFormats };
    for (const name of files) {
      const input = edits[name];
      if (input !== undefined)
        documentFormats[name] = input
          .split("\n")
          .map((heading) => heading.trim())
          .filter(Boolean);
    }
    const payload = JSON.stringify(documentFormats);
    if (operation.current?.payload !== payload) operation.current = { payload, id: createUuid() };
    pendingRef.current = true;
    setPending("save");
    setMessage(undefined);
    try {
      const result = await source.command(
        { type: "saveDocumentFormats", documentFormats, operationId: operation.current.id },
        {},
        original.revision,
      );
      if (result.status !== "completed") {
        setMessage({
          error: true,
          text: result.error ?? (zh ? "未保存文档格式。" : "Document formats were not saved."),
        });
        return false;
      }
      setRead(result.view);
      setEdits({});
      setBaseline(undefined);
      setNeedsRead(false);
      setShowSaved(false);
      operation.current = null;
      setMessage({ text: zh ? "文档格式已保存。" : "Document formats saved." });
      return true;
    } catch (cause) {
      setNeedsRead(true);
      const text = formatUserFacingError(
        cause,
        zh
          ? "未保存文档格式，请重新读取后重试。"
          : "Could not save document formats. Reload before retrying.",
      );
      setMessage({ error: true, text });
      return false;
    } finally {
      pendingRef.current = false;
      setPending(undefined);
    }
  };

  const actions = useRef({ save, discard });
  actions.current = { save, discard };
  useLayoutEffect(() => {
    onDraftActionsChange(
      dirty || pending
        ? {
            canSave: !pending && !conflicted,
            canDiscard: !pending,
            saveBlockedReason: conflicted ? conflictMessage : undefined,
            save: () => actions.current.save(),
            discard: () => actions.current.discard(),
          }
        : null,
    );
    return () => onDraftActionsChange(null);
  }, [dirty, pending, conflicted, conflictMessage, onDraftActionsChange]);

  const reload = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending("read");
    try {
      const next = await source.readWorkflow({});
      setRead(next);
      setBaseline(dirty ? next : undefined);
      setNeedsRead(false);
      setShowSaved(dirty);
      setMessage({
        text: dirty
          ? zh
            ? "已读取最新规则并保留本页编辑。请核对后保存。"
            : "Latest rules loaded. Review your preserved edits before saving."
          : zh
            ? "已读取最新规则。"
            : "Latest rules loaded.",
      });
    } catch (cause) {
      setMessage({
        error: true,
        text: formatUserFacingError(
          cause,
          zh ? "无法读取文档格式。" : "Could not load document formats.",
        ),
      });
    } finally {
      pendingRef.current = false;
      setPending(undefined);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-ui-base text-foreground-subtle">
        {zh
          ? "规则适用于所有项目和 Release。每行填写一个完整的章节标题；留空时只检查文件。修改仅对保存后开始的检查生效。"
          : "Rules apply to all projects and releases. Enter one complete heading per line. Empty lists check the file only. Changes apply to checks that start after saving."}
      </p>
      {original ? (
        documentGroups.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`document-formats-${group.id}`}
            className="space-y-3"
          >
            <h2 id={`document-formats-${group.id}`} className="text-ui-base font-medium">
              {zh ? `${group.title} 材料` : `${group.title} materials`}
            </h2>
            <SettingsGroupCard>
              {group.files.map((name) => (
                <SettingsRow
                  key={name}
                  searchId={`aireq.documentFormats.${name}`}
                  label={<span className="font-mono">{name}</span>}
                  description={
                    <code className="break-all font-mono text-ui-caption">
                      {AIREQ_DOCUMENT_PATHS[name]}
                    </code>
                  }
                  controlLayout="wide"
                  control={
                    <div className="min-w-0 flex-1 space-y-1">
                      <SettingsFormTextarea
                        rows={2}
                        aria-label={zh ? `${name} 必需章节` : `${name} required headings`}
                        placeholder={zh ? "无必需章节" : "No required headings"}
                        value={edits[name] ?? original.documentFormats[name].join("\n")}
                        readOnly={Boolean(pending)}
                        onChange={(event) => {
                          const text = event.target.value;
                          const next = { ...edits, [name]: text };
                          if (text === original.documentFormats[name].join("\n")) delete next[name];
                          setEdits(next);
                          setBaseline(Object.keys(next).length ? original : undefined);
                          setMessage(undefined);
                        }}
                      />
                      {showSaved && edits[name] !== undefined && (
                        <p className="text-ui-caption break-words text-foreground-subtle">
                          {zh ? "最新保存：" : "Latest saved: "}
                          {original.documentFormats[name].join(zh ? "、" : ", ") ||
                            (zh ? "无必需章节" : "No required headings")}
                        </p>
                      )}
                    </div>
                  }
                />
              ))}
            </SettingsGroupCard>
          </section>
        ))
      ) : !ai.error && !message ? (
        <p role="status" className="text-ui-base text-foreground-subtle">
          {zh ? "正在读取文档格式…" : "Loading document formats…"}
        </p>
      ) : null}
      <div className="sticky bottom-0 z-10 space-y-2 border-t border-border bg-background py-3">
        {conflicted && (
          <p role="status" className="text-ui-base text-warning">
            {conflictMessage}
          </p>
        )}
        {(message || (!original && ai.error)) && (
          <p
            role={message?.error || !message ? "alert" : "status"}
            className={`text-ui-base ${message?.error || !message ? "text-destructive" : "text-foreground-subtle"}`}
          >
            {message?.text ?? ai.error}
          </p>
        )}
        <SettingsFormActions
          leadingAction={
            dirty && (
              <p role="status" className="text-ui-caption text-foreground-subtle">
                {zh ? "有未保存的修改" : "Unsaved changes"}
              </p>
            )
          }
        >
          {(conflicted || !original) && (
            <Button variant="outline" disabled={Boolean(pending)} onClick={() => void reload()}>
              {pending === "read" ? (zh ? "读取中…" : "Loading…") : zh ? "重新读取" : "Reload"}
            </Button>
          )}
          <Button variant="ghost" disabled={!dirty || Boolean(pending)} onClick={discard}>
            {zh ? "取消" : "Cancel"}
          </Button>
          <Button disabled={!dirty || Boolean(pending) || conflicted} onClick={onSave}>
            {pending === "save"
              ? zh
                ? "保存中…"
                : "Saving…"
              : zh
                ? "保存文档格式"
                : "Save document formats"}
          </Button>
        </SettingsFormActions>
      </div>
    </div>
  );
}
