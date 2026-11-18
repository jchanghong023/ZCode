import { formatUserFacingError } from "@/lib/errorMessage.js";
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
import { useAIReq } from "../AIReqContext.js";
import {
  aiReqPrFactSchema,
  proposalState,
  proposalDeliveryCurrent,
  requirementMaterialName,
} from "../contract.js";
import type { AIReqFileVersion, AIReqPrHandoff, AIReqRequirementGroup } from "../contract.js";
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

function resolveMrLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    // .invalid 是保留占位域，不能展示为可访问的 PR 链接。
    const hostname = url.hostname.replace(/\.$/, "");
    if (hostname === "invalid" || hostname.endsWith(".invalid")) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

const time = (value: string) =>
  new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
const detailsClass =
  "w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring";
const steps = { branch: "创建文档分支", push: "推送文档", pr: "创建文档 PR" } as const;

function AIReqProposalBackgroundStatus({ group }: { group: AIReqRequirementGroup }) {
  const delivery = group.proposalDelivery;
  const parsedPr = aiReqPrFactSchema.safeParse(group.requirementsPr);
  if (!delivery || !parsedPr.success) return <p role="alert">文档 PR 信息无效，请重新读取。</p>;
  const pr = parsedPr.data;
  const link = resolveMrLink(pr.url);
  const check = delivery.mergeCheck;
  return (
    <section
      className="space-y-3 rounded-lg border border-border p-4"
      data-testid="proposal-background-status"
    >
      <h2 className="text-ui-base font-medium">
        文档 PR{pr.number === undefined ? "" : ` #${pr.number}`}
      </h2>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-sm">
        <span>{pr.status === "merged" ? "已合入 · 待材料核验" : "已打开 · 待合入"}</span>
        <span className="text-foreground-subtle">
          {pr.platformVerified ? "平台已核验" : "平台未核验"}
        </span>
        {link ? (
          <a
            className="text-brand underline-offset-4 hover:underline"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
          >
            查看 PR
          </a>
        ) : (
          <span className="text-foreground-subtle">暂无可访问链接</span>
        )}
      </div>
      <p
        className={
          check?.status === "failed" || check?.status === "incomplete"
            ? "text-ui-sm text-destructive"
            : "text-ui-sm"
        }
        role="status"
        data-testid="proposal-background-result"
      >
        {check?.message ?? "等待后台核验当前候选的完整文档。"}
      </p>
      <p className="text-ui-sm text-foreground-subtle">
        {check?.checkedAt ? `最近核验：${time(check.checkedAt)}（北京时间）` : "等待首轮核验"}
        {check?.nextCheckAt ? ` · 下次核验：${time(check.nextCheckAt)}（北京时间）` : ""}
      </p>
      <details className="text-ui-sm text-foreground-subtle">
        <summary className={detailsClass}>查看分支与核验详情</summary>
        <dl className="mt-3 space-y-2">
          <div>
            <dt>来源 → 目标分支</dt>
            <dd className="break-all font-mono">
              {pr.sourceBranch} → {pr.targetBranch}
            </dd>
          </div>
          {delivery.branch && (
            <div>
              <dt>创建基点</dt>
              <dd className="break-all font-mono">{delivery.branch.baseCommit}</dd>
            </div>
          )}
          <div>
            <dt>提交候选</dt>
            <dd className="break-all font-mono">{delivery.candidate}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
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
  const [checkedFiles, setCheckedFiles] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
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
    dialog &&
    (!matchesCandidate ||
      (dialog.mode === "record" ? !prPresent : !ready || (handoff && !matchesHandoff))),
  );
  const selectedFileCount =
    dialog?.files.filter((file) => checkedFiles.includes(file.path)).length ?? 0;
  const allFilesChecked = Boolean(
    dialog?.files.length && selectedFileCount === dialog.files.length,
  );
  const editable = ready && canWrite && handoff?.ready && boundCurrent && !ai.pending && !busy;
  const canSubmit = editable && allFilesChecked && acknowledged;
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
    setCheckedFiles([]);
    setAcknowledged(false);
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
      if (result?.status === "completed") setDialogOpen(false);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="min-w-0 space-y-3" data-testid="proposal-delivery-controls">
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
                busy || ai.pending || (!prPresent && (!ready || !canWrite || !handoff?.ready))
              }
              onClick={openDialog}
            >
              {prPresent ? "查看提交记录" : failure ? publishLabel : "核对文件并提交"}
            </Button>
            {canWrite && prPresent && group.requirementsPr?.status === "opened" && (
              <Button
                variant="outline"
                disabled={busy || ai.pending}
                onClick={() => void publish({ ...target, candidate: delivery.candidate })}
              >
                {busy ? "正在提交…" : "继续跟踪此 PR"}
              </Button>
            )}
            {(prPresent || failure) && (
              <Button variant="ghost" onClick={() => ai.openProposalTask("management")}>
                前往管理需求
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
          {!prPresent && handoff && !handoff.ready && (
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
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !submitting.current) setDialogOpen(false);
        }}
      >
        <DialogContent
          className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
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
                : "核对当前候选的全部文件，并明确授权提交。"}
            </DialogDescription>
          </DialogHeader>
          {dialog && (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) void publish(dialog);
              }}
            >
              <div
                className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4"
                data-testid="proposal-delivery-body"
              >
                {changed && (
                  <p role="alert" className="text-ui-sm text-destructive">
                    交付候选、材料或提交目标已变化，请关闭并重新核对。
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
                          disabled={!editable || !dialog.files.length}
                          onCheckedChange={(checked) =>
                            setCheckedFiles(
                              checked === true ? dialog.files.map((file) => file.path) : [],
                            )
                          }
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
                        ? `已选 ${selectedFileCount} / ${dialog.files.length}`
                        : `${dialog.files.length} 份文件`}
                    </span>
                  </div>
                  <ul className="divide-y divide-border/40">
                    {dialog.files.map((file) => (
                      <li key={file.path} className="px-2 py-3">
                        <label className="flex items-start gap-3 text-ui-sm">
                          {dialog.mode === "publish" && (
                            <Checkbox
                              data-testid="proposal-delivery-file-check"
                              className="data-[state=unchecked]:border-foreground/60"
                              aria-label={`确认 ${file.path}`}
                              checked={checkedFiles.includes(file.path)}
                              disabled={!editable}
                              onCheckedChange={(checked) =>
                                setCheckedFiles((previous) =>
                                  checked === true
                                    ? [...previous, file.path]
                                    : previous.filter((path) => path !== file.path),
                                )
                              }
                            />
                          )}
                          <span className="min-w-0">
                            <span className="block">
                              {requirementMaterialName(file.path, ai.view?.srs) ?? "需求材料"}
                            </span>
                            <span className="mt-1 block break-all font-mono text-foreground-subtle">
                              {file.path}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
                {dialog.mode === "publish" && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-surface p-4 text-ui-sm">
                    <Checkbox
                      data-testid="proposal-delivery-confirm-all"
                      className="data-[state=unchecked]:border-foreground/60"
                      checked={acknowledged}
                      disabled={!editable}
                      onCheckedChange={(checked) => setAcknowledged(checked === true)}
                    />
                    <span>我已核对全部文件，并授权提交当前候选的文档 PR。</span>
                  </label>
                )}
                {ai.error && (
                  <p role="alert" className="break-words text-ui-sm text-destructive">
                    {ai.error}
                  </p>
                )}
              </div>
              <DialogFooter className="shrink-0 flex-row flex-wrap items-center gap-2 border-t border-border/50 px-5 py-3">
                <p className="mr-auto text-ui-sm text-foreground-subtle">
                  {dialog.mode === "publish"
                    ? "勾选全部文件并明确授权后可提交"
                    : "当前候选的提交记录 · 只读"}
                </p>
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
