import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
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
import { useAIReq } from "../AIReqContext.js";
import { proposalState, proposalDeliveryCurrent, requirementMaterialName } from "../contract.js";
import type {
  AIReqFileVersion,
  AIReqMaterialView,
  AIReqPrHandoff,
  AIReqRequirementGroup,
} from "../contract.js";
import { AIReqProposalBackgroundStatus } from "./AIReqDocumentPrStatus.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";

interface DeliveryDialog {
  mode: "publish" | "record";
  projectId: string;
  irId: string;
  title: string;
  version: string;
  candidate: string;
  files: AIReqFileVersion[];
  handoff?: AIReqPrHandoff;
}

const detailsClass =
  "w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring";
const steps = { branch: "创建文档分支", push: "推送文档", pr: "创建文档 PR" } as const;

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
  const [closingPr, setClosingPr] = useState<{ candidate: string; number?: number }>();
  const [closedPr, setClosedPr] = useState<{ irId: string; number?: number }>();
  const [checkedFiles, setCheckedFiles] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [previewPath, setPreviewPath] = useState<string>();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const [handoffResult, setHandoffResult] = useState<{
    group: AIReqRequirementGroup;
    handoff?: AIReqPrHandoff;
    error?: string;
  }>();
  const delivery = group.proposalDelivery;
  const current = proposalDeliveryCurrent(group);
  const state = proposalState(group);
  const ready = state === "submission-pending" && current && Boolean(delivery?.files.length);
  const prPresent = state === "merge-pending";
  const canWrite = source.capabilities.proposalDiscussion === true;
  const { setDraftNavigationGuard } = ai;
  const guardOwner = `proposal-delivery:${group.projectId}:${group.id}`;
  useEffect(() => {
    if (!busy) return;
    setDraftNavigationGuard(() => {}, guardOwner);
    return () => setDraftNavigationGuard(null, guardOwner);
  }, [busy, guardOwner, setDraftNavigationGuard]);
  useEffect(() => {
    if (!source.capabilities.requirementManagement || !ready || !canWrite) return;
    let active = true;
    const load = async () => {
      try {
        const handoff = await source.readPrHandoff({ projectId: group.projectId, irId: group.id });
        if (active) setHandoffResult({ group, handoff });
      } catch (error) {
        if (active)
          setHandoffResult({
            group,
            error: formatUserFacingError(error, "提案交付信息读取失败，请重试。"),
          });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [source, group, ready, canWrite, readAttempt]);
  if (!source.capabilities.requirementManagement) return null;
  const result = handoffResult?.group === group ? handoffResult : undefined;
  const handoff = result?.handoff;
  const handoffReady = handoff?.blockers.length === 0;
  const target = { projectId: group.projectId, irId: group.id };
  const pushed = delivery?.pushedCandidate === delivery?.candidate;
  const failure = delivery?.publishError;
  const publishLabel = failure ? `重试${steps[failure.step]}` : "提交文档 PR";
  const matchesCandidate = Boolean(
    current &&
    delivery &&
    dialog &&
    dialog.projectId === target.projectId &&
    dialog.irId === target.irId &&
    dialog.version === delivery.version &&
    dialog.candidate === delivery.candidate,
  );
  const matchesHandoff = Boolean(
    handoff &&
    handoff.repositoryUrl === dialog?.handoff?.repositoryUrl &&
    handoff.branch === dialog?.handoff?.branch &&
    handoff.targetBranch === dialog?.handoff?.targetBranch,
  );
  const boundCurrent = matchesCandidate && (dialog?.mode === "record" ? prPresent : matchesHandoff);
  const changed = Boolean(
    // 发布投影可先于回执到达，Radix 也会在退场期间保留内容。仅对仍打开的表单报冲突。
    dialogOpen &&
    !busy &&
    dialog &&
    !(dialog.mode === "publish" && matchesCandidate && prPresent) &&
    (!matchesCandidate ||
      (dialog.mode === "record" ? !prPresent : !ready || (handoff && !matchesHandoff))),
  );
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
      readable: Boolean(material?.content?.trim() && !material.error),
    });
  }
  const allFilesReadable = [...fileGroups.values()].every(({ files }) =>
    files.every(({ readable }) => readable),
  );
  const editable = ready && canWrite && handoffReady && boundCurrent && !ai.pending && !busy;
  const previewedCount =
    dialog?.files.filter((file) => previewedFiles.includes(file.path)).length ?? 0;
  const allFilesPreviewed = Boolean(dialog?.files.length && previewedCount === dialog.files.length);
  const canSubmit =
    editable && allFilesReadable && allFilesChecked && allFilesPreviewed && acknowledged;
  const openDialog = () => {
    if (!delivery || !current) return;
    setDialog({
      mode: prPresent ? "record" : "publish",
      ...target,
      title: group.title,
      version: delivery.version,
      candidate: delivery.candidate,
      files: delivery.files,
      handoff,
    });
    setPreviewedFiles([]);
    setCheckedFiles([]);
    setAcknowledged(false);
    setPreviewPath(undefined);
    setDialogOpen(true);
  };
  const publish = async (snapshot: { projectId: string; irId: string; candidate: string }) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const result = await ai.command({
        type: "publishProposal",
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
  const closePr = async (request: NonNullable<typeof closingPr>) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const result = await ai.command({
        type: "closeProposalPr",
        ...target,
        candidate: request.candidate,
      });
      if (result?.receipt.status === "completed") {
        setClosedPr({ irId: target.irId, number: request.number });
        setClosingPr(undefined);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="min-w-0 space-y-3" data-testid="proposal-delivery-controls">
      {closedPr?.irId === target.irId && !prPresent && (
        <p role="status" className="text-ui-sm">
          文档 PR{closedPr.number === undefined ? "" : ` #${closedPr.number}`}{" "}
          已关闭，已停止跟踪。材料已解冻，可重新核对或退回修改。
        </p>
      )}
      {(prPresent || ready) && delivery && (
        <>
          {prPresent ? (
            <AIReqProposalBackgroundStatus group={group} />
          ) : (
            <>
              <ul
                aria-label="提交步骤"
                className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-ui-sm text-foreground-subtle"
              >
                <li>文档分支：{delivery.branch ? "已创建" : "未创建"}</li>
                <li>文档推送：{pushed ? "已推送" : "未推送"}</li>
                <li>文档 PR：未创建</li>
              </ul>
              {failure && (
                <p role="alert" className="break-words text-ui-sm text-destructive">
                  {steps[failure.step]}失败：{failure.message}
                  。重试会继续使用当前候选，保留已经完成的步骤。
                </p>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              ref={openButton}
              data-testid="proposal-delivery-open"
              variant={prPresent ? "outline" : "default"}
              disabled={
                busy || ai.pending || (!prPresent && (!ready || !canWrite || !handoffReady))
              }
              onClick={openDialog}
            >
              {prPresent ? "查看提交记录" : failure ? publishLabel : "核对文件并提交"}
            </Button>
            {canWrite && prPresent && delivery.mergeCheck?.status === "untracked" && (
              <Button
                variant="outline"
                disabled={busy || ai.pending}
                onClick={() => void publish({ ...target, candidate: delivery.candidate })}
              >
                {busy ? "正在启动…" : "开始跟踪 PR"}
              </Button>
            )}
            {canWrite && prPresent && group.requirementsPr?.status === "opened" && (
              <Button
                variant="outline"
                disabled={busy || ai.pending}
                onClick={() =>
                  setClosingPr({
                    candidate: delivery.candidate,
                    number: group.requirementsPr?.number,
                  })
                }
              >
                关闭未合入文档 PR
              </Button>
            )}
          </div>
          {!prPresent && ready && canWrite && !result && (
            <p role="status" className="text-ui-sm text-foreground-subtle">
              正在读取提案交付信息…
            </p>
          )}
          {result?.error && (
            <div className="flex flex-wrap items-center gap-2 text-ui-sm">
              <p role="alert" className="text-destructive">
                {result.error}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHandoffResult(undefined);
                  setReadAttempt((attempt) => attempt + 1);
                }}
              >
                重新读取
              </Button>
            </div>
          )}
          {!prPresent && handoff && !handoffReady && (
            <ul className="list-disc space-y-1 pl-5 text-ui-sm text-foreground-subtle">
              {handoff.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
          {!dialogOpen && ai.error && (
            <p role="alert" className="break-words text-ui-sm text-destructive">
              {ai.error}
            </p>
          )}
        </>
      )}
      <AlertDialog
        open={Boolean(closingPr)}
        onOpenChange={(open) => {
          if (!open && !submitting.current) setClosingPr(undefined);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            if (!prPresent) {
              event.preventDefault();
              focusFallback.current?.focus();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              关闭未合入的文档 PR{closingPr?.number === undefined ? "" : ` #${closingPr.number}`}？
            </AlertDialogTitle>
            <AlertDialogDescription>
              关闭后停止核验并解除材料冻结，需求回到待提交。三方确认保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {ai.error && (
            <p role="alert" className="text-ui-sm text-destructive">
              {ai.error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy || !prPresent || closingPr?.candidate !== delivery?.candidate}
              onClick={() => {
                if (closingPr) void closePr(closingPr);
              }}
            >
              {busy ? "正在关闭…" : "关闭文档 PR"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !submitting.current) setDialogOpen(false);
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
            <DialogTitle>
              {dialog?.mode === "record" ? "文档 PR 提交记录" : "提交文档 PR"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.mode === "record"
                ? "文档 PR 合入并通过当前候选核验后，需求自动转正。"
                : "预览本次拟提交的文件，选入提交清单后授权提交。"}
            </DialogDescription>
          </DialogHeader>
          {dialog && (
            <form
              className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) void publish(dialog);
              }}
            >
              <div
                className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4"
                data-testid="proposal-delivery-body"
              >
                {dialogOpen &&
                  !busy &&
                  dialog.mode === "publish" &&
                  matchesCandidate &&
                  prPresent && (
                    <p role="status" className="text-ui-sm">
                      此版本的文档 PR 已创建。关闭后可查看合入进度。
                    </p>
                  )}
                {changed && (
                  <p role="alert" className="text-ui-sm text-destructive">
                    文件版本或提交目标已变化，请关闭并重新核对。
                  </p>
                )}
                {dialog.mode === "publish" && matchesCandidate && ready && !result && (
                  <p role="status" className="text-ui-sm text-foreground-subtle">
                    正在核对提交目标…
                  </p>
                )}
                {dialog.mode === "publish" && result?.error && (
                  <p role="alert" className="text-ui-sm text-destructive">
                    {result.error} 请关闭后重新读取，文件选择不会用于其他候选。
                  </p>
                )}
                {dialog.mode === "publish" && failure && boundCurrent && (
                  <p role="alert" className="break-words text-ui-sm text-destructive">
                    {steps[failure.step]}失败：{failure.message}。
                  </p>
                )}
                {dialog.mode === "publish" ? (
                  <section className="space-y-3" aria-label="提交目标">
                    <h2 className="break-words text-ui-base font-medium">{dialog.title}</h2>
                    <dl className="grid grid-cols-2 gap-3 rounded-lg bg-surface px-4 py-3 text-ui-sm">
                      <div className="col-span-2 min-w-0">
                        <dt className="text-foreground-subtle">目标仓库</dt>
                        <dd className="break-all">{dialog.handoff?.repositoryUrl ?? "尚未配置"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-foreground-subtle">来源分支</dt>
                        <dd className="break-all font-mono">{dialog.handoff?.branch}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-foreground-subtle">目标分支</dt>
                        <dd className="break-all font-mono">{dialog.handoff?.targetBranch}</dd>
                      </div>
                    </dl>
                    <details className="text-ui-sm text-foreground-subtle">
                      <summary className={detailsClass}>提交详情</summary>
                      <dl className="mt-3 space-y-2">
                        {dialog.handoff?.sourceDirectory && (
                          <div>
                            <dt>材料来源</dt>
                            <dd className="break-all font-mono">
                              {dialog.handoff.sourceDirectory}
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt>材料版本</dt>
                          <dd className="break-all font-mono">{dialog.version}</dd>
                        </div>
                        <div>
                          <dt>提交候选</dt>
                          <dd className="break-all font-mono">{dialog.candidate}</dd>
                        </div>
                      </dl>
                    </details>
                  </section>
                ) : (
                  boundCurrent && (
                    <>
                      <AIReqProposalBackgroundStatus group={group} />
                      {group.requirementsPr?.title && (
                        <p className="break-words font-medium">{group.requirementsPr.title}</p>
                      )}
                      {group.requirementsPr?.body && (
                        <details className="space-y-3 text-ui-sm">
                          <summary className={detailsClass}>查看 PR 正文</summary>
                          <AIReqMarkdownDocument headingLevelOffset={1}>
                            {group.requirementsPr.body}
                          </AIReqMarkdownDocument>
                        </details>
                      )}
                    </>
                  )
                )}
                <fieldset className="min-w-0 space-y-3">
                  <legend className="text-ui-base font-medium">提交文件</legend>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
                    {dialog.mode === "publish" && (
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
                    )}
                    <span
                      className="text-ui-sm tabular-nums text-foreground-subtle"
                      role="status"
                      data-testid="proposal-delivery-selection-count"
                    >
                      {dialog.mode === "publish"
                        ? `已选 ${selectedFileCount} / ${dialog.files.length} · 已预览 ${previewedCount} / ${dialog.files.length}`
                        : `${dialog.files.length} 份文件`}
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
                                  {dialog.mode === "publish" && (
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
                                  )}
                                  <span className="min-w-0">
                                    <span className="block">{name}</span>
                                    <span className="mt-1 block break-all font-mono text-foreground-subtle">
                                      {file.path}
                                    </span>
                                    {dialog.mode === "publish" && readable && (
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
                {dialog.mode === "publish" ? (
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
                      我已核对全部文件，并授权提交文档 PR。
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
                ) : (
                  <p className="mr-auto text-ui-sm text-foreground-subtle">
                    本次提交的文件记录 · 只读
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDialogOpen(false)}
                >
                  {dialog.mode === "record" ? "关闭" : "取消"}
                </Button>
                {dialog.mode === "publish" && canWrite && (
                  <Button
                    type="submit"
                    data-testid="proposal-delivery-confirm"
                    disabled={!canSubmit}
                  >
                    {busy ? "正在提交…" : publishLabel}
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
