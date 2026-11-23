import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useAIReqDataSource } from "../data-source.js";
import { getEmployeeId } from "../identity.js";
import { useAIReq } from "../AIReqContext.js";
import {
  hasProjectRole,
  proposalState,
  proposalDeliveryCurrent,
  requirementMaterialName,
} from "../contract.js";
import type { AIReqFileVersion, AIReqMaterialView, AIReqRequirementGroup } from "../contract.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";

interface DeliveryDialog {
  projectId: string;
  irId: string;
  title: string;
  version: string;
  expectedRevision: number;
  candidate: string;
  files: AIReqFileVersion[];
}

export function AIReqProposalDeliveryControls({
  group,
  focusFallback,
}: {
  group: AIReqRequirementGroup;
  focusFallback: RefObject<HTMLElement | null>;
}) {
  const source = useAIReqDataSource();
  const ai = useAIReq()!;
  const openButton = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<DeliveryDialog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewedFiles, setPreviewedFiles] = useState<string[]>([]);
  const [checkedFiles, setCheckedFiles] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [previewPath, setPreviewPath] = useState<string>();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const delivery = group.proposalDelivery;
  const current = proposalDeliveryCurrent(group);
  const state = proposalState(group);
  const ready = state === "submission-pending" && current && Boolean(delivery?.files.length);
  const canWrite =
    source.capabilities.proposalDiscussion === true &&
    hasProjectRole(ai.view, group.projectId, getEmployeeId(), "development");
  const { setDraftNavigationGuard } = ai;
  const guardOwner = `proposal-delivery:${group.projectId}:${group.id}`;
  useEffect(() => {
    if (!busy) return;
    setDraftNavigationGuard(() => {}, guardOwner);
    return () => setDraftNavigationGuard(null, guardOwner);
  }, [busy, guardOwner, setDraftNavigationGuard]);
  if (!source.capabilities.requirementManagement) return null;
  const matchesCandidate = Boolean(
    current &&
    delivery &&
    dialog &&
    dialog.projectId === group.projectId &&
    dialog.irId === group.id &&
    dialog.version === delivery.version &&
    dialog.candidate === delivery.candidate,
  );
  const changed =
    dialogOpen &&
    !busy &&
    dialog &&
    (!ready || !matchesCandidate || dialog.expectedRevision !== ai.view?.revision);
  const selectedFileCount =
    dialog?.files.filter((file) => checkedFiles.includes(file.path)).length ?? 0;
  const allFilesChecked = Boolean(
    dialog?.files.length && selectedFileCount === dialog.files.length,
  );
  const materials = new Map(
    ai.view?.materials
      .filter((item) => item.projectId === group.projectId && item.irId === group.id)
      .map((item) => [item.path, item]),
  );
  const srs = ai.view?.srs.filter((sr) => sr.projectId === group.projectId && sr.irId === group.id);
  const fileGroups = new Map<
    string,
    {
      title: string;
      files: { file: AIReqFileVersion; material?: AIReqMaterialView; readable: boolean }[];
    }
  >();
  for (const file of dialog?.files ?? []) {
    const item = materials.get(file.path);
    // 同名文件可能已经被更新，预览只取当前候选清单中相同摘要和字节数的正文。
    const material = item?.sha256 === file.sha256 && item.size === file.size ? item : undefined;
    const srId = material?.srId ?? /^openspec\/changes\/([^/]+)\//.exec(file.path)?.[1];
    const dependency = file.path.endsWith("/sr-dependencies.json");
    const key = srId ? `sr:${srId}` : dependency ? "dependencies" : "requirements";
    let section = fileGroups.get(key);
    if (!section) {
      const title = srId
        ? (srs?.find((sr) => sr.id === srId)?.title ?? "SR 材料")
        : dependency
          ? "依赖"
          : "业务需求";
      section = { title, files: [] };
      fileGroups.set(key, section);
    }
    section.files.push({
      file,
      material,
      readable: Boolean(material?.valid && material.content?.trim() && !material.error),
    });
  }
  const allFilesReadable = [...fileGroups.values()].every(({ files }) =>
    files.every(({ readable }) => readable),
  );
  const editable = ready && canWrite && matchesCandidate && !changed && !ai.pending && !busy;
  const previewedCount =
    dialog?.files.filter((file) => previewedFiles.includes(file.path)).length ?? 0;
  const allFilesPreviewed = Boolean(dialog?.files.length && previewedCount === dialog.files.length);
  const canSubmit =
    editable && allFilesReadable && allFilesChecked && allFilesPreviewed && acknowledged;
  const openDialog = () => {
    if (!delivery || !ready || !canWrite || !ai.view) return;
    setDialog({
      projectId: group.projectId,
      irId: group.id,
      expectedRevision: ai.view.revision,
      title: group.title,
      version: delivery.version,
      candidate: delivery.candidate,
      files: delivery.files,
    });
    setPreviewedFiles([]);
    setCheckedFiles([]);
    setAcknowledged(false);
    setPreviewPath(undefined);
    setDialogOpen(true);
  };
  const archive = async (snapshot: DeliveryDialog) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const result = await ai.command({
        type: "archiveProposal",
        expectedRevision: snapshot.expectedRevision,
        projectId: snapshot.projectId,
        irId: snapshot.irId,
        candidate: snapshot.candidate,
      });
      if (result?.receipt.status === "completed") setDialogOpen(false);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3">
      {ready && canWrite && (
        <Button ref={openButton} aria-haspopup="dialog" disabled={ai.pending} onClick={openDialog}>
          核对文件并提交归档
        </Button>
      )}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!submitting.current) setDialogOpen(open);
        }}
      >
        <DialogContent
          className="grid h-[85dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-3xl"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const entry = openButton.current;
            (entry && !entry.disabled ? entry : focusFallback.current)?.focus();
          }}
        >
          <DialogHeader className="shrink-0 border-b border-border/50 px-5 py-4">
            <DialogTitle>提交归档</DialogTitle>
            <DialogDescription>预览并勾选全部文件，然后确认归档。</DialogDescription>
          </DialogHeader>
          {dialog && (
            <form
              className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) void archive(dialog);
              }}
            >
              <div
                className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4"
                data-testid="proposal-delivery-body"
              >
                {changed && (
                  <p role="alert" className="text-ui-sm text-destructive">
                    工作流或材料版本已变化，请关闭并重新核对。
                  </p>
                )}
                <h2 className="break-words text-ui-base font-medium">{dialog.title}</h2>
                <fieldset className="min-w-0 space-y-3">
                  <legend className="text-ui-base font-medium">提交文件</legend>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
                    <label className="flex cursor-pointer items-center gap-2 text-ui-sm">
                      <Checkbox
                        aria-label="全选文件"
                        data-testid="proposal-delivery-select-all"
                        checked={
                          allFilesChecked ? true : selectedFileCount > 0 ? "indeterminate" : false
                        }
                        disabled={!editable || !allFilesReadable || !dialog.files.length}
                        onCheckedChange={(checked) => {
                          setAcknowledged(false);
                          setCheckedFiles(
                            checked === true ? dialog.files.map((file) => file.path) : [],
                          );
                        }}
                      />
                      全选文件
                    </label>
                    <span
                      className="text-ui-sm tabular-nums text-foreground-subtle"
                      role="status"
                      data-testid="proposal-delivery-selection-count"
                    >
                      已选 {selectedFileCount} / {dialog.files.length} · 已预览 {previewedCount} /{" "}
                      {dialog.files.length}
                    </span>
                  </div>
                  {[...fileGroups].map(([key, section]) => (
                    <section key={key} className="space-y-1">
                      <h3 className="break-words bg-surface px-2 py-2 text-ui-sm font-medium">
                        {section.title}
                      </h3>
                      <ul className="divide-y divide-border/40">
                        {section.files.map(({ file, material, readable }) => {
                          const name = requirementMaterialName(file.path) ?? "需求材料";
                          const previewLabel =
                            name === section.title ? name : `${section.title} · ${name}`;
                          const expanded = previewPath === file.path;
                          return (
                            <li key={file.path} className="space-y-2 px-2 py-3">
                              <div className="flex items-start gap-3">
                                <label className="flex min-w-0 flex-1 items-start gap-3 text-ui-sm">
                                  <Checkbox
                                    data-testid="proposal-delivery-file-check"
                                    className="data-[state=unchecked]:border-foreground/60"
                                    aria-label={`纳入提交 ${previewLabel}`}
                                    checked={checkedFiles.includes(file.path)}
                                    disabled={!editable || !readable}
                                    onCheckedChange={(checked) => {
                                      setAcknowledged(false);
                                      setCheckedFiles((previous) =>
                                        checked === true
                                          ? [...previous, file.path]
                                          : previous.filter((path) => path !== file.path),
                                      );
                                    }}
                                  />
                                  <span className="min-w-0">
                                    <span className="block">{name}</span>
                                    <span className="mt-1 block break-all font-mono text-foreground-subtle">
                                      {file.path}
                                    </span>
                                    {readable && (
                                      <span className="mt-1 block text-foreground-subtle">
                                        {previewedFiles.includes(file.path)
                                          ? "已打开预览"
                                          : "待预览"}
                                      </span>
                                    )}
                                    {matchesCandidate && !readable && (
                                      <span className="mt-1 block text-destructive">暂不可读</span>
                                    )}
                                  </span>
                                </label>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`${expanded ? "收起预览" : "预览"} ${previewLabel}`}
                                  aria-expanded={expanded}
                                  disabled={!matchesCandidate}
                                  onClick={() => {
                                    setPreviewPath(expanded ? undefined : file.path);
                                    if (!expanded && readable)
                                      setPreviewedFiles((previous) =>
                                        previous.includes(file.path)
                                          ? previous
                                          : [...previous, file.path],
                                      );
                                  }}
                                >
                                  {expanded ? "收起" : "预览"}
                                </Button>
                              </div>
                              {expanded && matchesCandidate && (
                                <div className="min-w-0 rounded-lg border border-border/60 px-4 py-3">
                                  {readable && material?.content ? (
                                    file.path.endsWith(".json") ? (
                                      <pre className="wrap-anywhere whitespace-pre-wrap font-mono text-ui-sm">
                                        {material.content}
                                      </pre>
                                    ) : (
                                      <AIReqMarkdownDocument headingLevelOffset={2}>
                                        {material.content}
                                      </AIReqMarkdownDocument>
                                    )
                                  ) : (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p
                                        role="status"
                                        className="text-ui-sm text-foreground-subtle"
                                      >
                                        {material?.error ?? "暂未读取到当前候选的文件正文。"}
                                      </p>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={ai.pending || busy}
                                        onClick={() =>
                                          material?.error
                                            ? void ai.retryMaterial({
                                                projectId: group.projectId,
                                                releaseId: group.releaseId,
                                                irId: group.id,
                                                path: material.path,
                                                sha256: material.sha256,
                                                round: material.round,
                                              })
                                            : void ai.refresh()
                                        }
                                      >
                                        重新读取文件
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </fieldset>
                {ai.error && (
                  <p role="alert" className="break-words text-ui-sm text-destructive">
                    {ai.error}
                  </p>
                )}
              </div>
              <DialogFooter className="shrink-0 flex-row flex-wrap items-center gap-2 border-t border-border/50 px-5 py-3">
                <label className="mr-auto flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-ui-sm">
                  <Checkbox
                    data-testid="proposal-delivery-confirm-all"
                    className="data-[state=unchecked]:border-foreground/60"
                    checked={acknowledged}
                    disabled={
                      !editable || !allFilesReadable || !allFilesChecked || !allFilesPreviewed
                    }
                    onCheckedChange={(checked) => setAcknowledged(checked === true)}
                  />
                  <span>
                    我已核对全部文件，确认在平台内归档。
                    {allFilesReadable && !allFilesPreviewed && (
                      <span className="mt-1 block text-foreground-subtle">
                        请先打开全部文件的预览。
                      </span>
                    )}
                    {!allFilesReadable && (
                      <span className="mt-1 block text-destructive">
                        请重新读取暂不可读的文件。
                      </span>
                    )}
                  </span>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDialogOpen(false)}
                >
                  取消
                </Button>
                {canWrite && (
                  <Button
                    type="submit"
                    data-testid="proposal-delivery-confirm"
                    disabled={!canSubmit}
                  >
                    {busy ? "正在归档…" : "提交归档"}
                  </Button>
                )}
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
