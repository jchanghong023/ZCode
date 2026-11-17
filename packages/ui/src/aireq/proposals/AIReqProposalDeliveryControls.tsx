import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useAIReqDataSource } from "../data-source.js";
import { useAIReq } from "../AIReqContext.js";
import {
  aiReqPrFactSchema,
  proposalState,
  proposalDeliveryCurrent,
  proposalVersion,
  requirementMaterialName,
} from "../contract.js";
import type { AIReqFileVersion, AIReqPrHandoff, AIReqRequirementGroup } from "../contract.js";

type DeliveryStep = "confirm" | "push" | "pr";
interface DeliveryDialog {
  step: DeliveryStep;
  version: string;
  candidate?: string;
  files: AIReqFileVersion[];
}
const stepTitles: Record<DeliveryStep, string> = {
  confirm: "确认方案并提交推送",
  push: "文档分支、提交与 PR",
  pr: "文档 PR 与合入核验",
};

function resolveMrLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    // .invalid 是保留占位域；演示数据不能把它展示成可访问的 MR 链接。
    const hostname = url.hostname.replace(/\.$/, "");
    if (hostname === "invalid" || hostname.endsWith(".invalid")) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function AIReqProposalBackgroundStatus({ group }: { group: AIReqRequirementGroup }) {
  const delivery = group.proposalDelivery;
  if (delivery && !proposalDeliveryCurrent(group))
    return (
      <p className="text-ui-sm text-foreground-subtle">
        当前材料版本已变化，旧交付不再有效；请重新评审并确认当前版本。
      </p>
    );
  if (!delivery?.pushedAt)
    return (
      <p className="text-ui-sm leading-6 text-foreground-subtle">
        先完成方案设计并确认文档，再由平台创建提案独立分支、提交推送并自动创建 MR；此前不创建提案或
        SR 分支。
      </p>
    );
  const check = delivery.mergeCheck;
  const parsedMr = group.requirementsPr
    ? aiReqPrFactSchema.safeParse(group.requirementsPr)
    : undefined;
  // 外部核验事实只能是布尔值，坏投影不得被当作已核验或继续展示。
  if (parsedMr && !parsedMr.success) return <p role="alert">MR 信息无效，请刷新后重试。</p>;
  const mr = parsedMr?.data;
  const mrLink = resolveMrLink(mr?.url);
  const time = (value?: string) =>
    value
      ? new Date(value).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
      : "等待首轮检查";
  return (
    <section className="space-y-4" data-testid="proposal-background-status">
      <div className="space-y-2 rounded-lg border border-border p-4">
        <h3 className="text-ui-base font-medium">合入进展</h3>
        <p className="text-ui-sm leading-6" role="status" data-testid="proposal-background-result">
          {check?.message ?? "等待后台检查提案分支与默认分支。"}
        </p>
        {mr?.number && (
          <div className="flex flex-wrap items-center gap-3 text-ui-sm">
            <span className="font-medium">MR #{mr.number}</span>
            <span>
              {mr.status === "merged"
                ? "已合入"
                : mr.status === "closed"
                  ? "已关闭，未合入"
                  : "待人工评审、合并"}
            </span>
            <span className="text-foreground-subtle">
              {mr.platformVerified ? "平台已核验" : "平台未核验"}
            </span>
            {mrLink ? (
              <a
                className="text-brand underline-offset-4 hover:underline"
                href={mrLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                查看 MR
              </a>
            ) : (
              <span className="text-foreground-subtle">暂无可访问链接</span>
            )}
          </div>
        )}
        <p className="text-ui-sm text-foreground-subtle">
          最近检查：{time(check?.checkedAt)}
          {check?.nextCheckAt ? ` · 下次检查：${time(check.nextCheckAt)}` : ""}
        </p>
        <details className="text-ui-sm text-foreground-subtle">
          <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
            查看分支与核验详情
          </summary>
          <div className="mt-3">
            {" "}
            <dl className="space-y-2 text-ui-sm">
              <div>
                <dt className="text-foreground-subtle">已创建并推送的提案分支</dt>
                <dd className="break-all font-mono">
                  {delivery.branch?.name ?? "分支映射缺失（数据异常）"}
                </dd>
              </div>
              <div>
                <dt className="text-foreground-subtle">创建基点</dt>
                <dd className="break-all font-mono">
                  {delivery.branch?.baseCommit ?? "基点未记录"}
                </dd>
              </div>
              <div>
                <dt className="text-foreground-subtle">最近检查／下一轮检查</dt>
                <dd>
                  {time(check?.checkedAt)}
                  {check?.nextCheckAt ? ` ／ ${time(check.nextCheckAt)}` : ""}
                </dd>
              </div>
            </dl>
          </div>
        </details>
        <p className="text-ui-sm leading-6 text-foreground-subtle">
          MR 合入后，后台核验材料完整性，通过后自动转为正式需求。无需再次确认合并。
        </p>
      </div>
    </section>
  );
}

export function AIReqProposalDeliveryControls({
  group,
  readOnly = false,
  compact = false,
}: {
  group: AIReqRequirementGroup;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const source = useAIReqDataSource();
  const aireq = useAIReq()!;
  const [dialog, setDialog] = useState<DeliveryDialog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkedFiles, setCheckedFiles] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const submitting = useRef(false);
  const [submittingDelivery, setSubmittingDelivery] = useState(false);
  const [handoffResult, setHandoffResult] = useState<{
    group: AIReqRequirementGroup;
    handoff?: AIReqPrHandoff;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    setHandoffResult(null);
    if (!source.capabilities.requirementManagement) return;
    const load = async () => {
      try {
        const handoff = await source.readPrHandoff({ projectId: group.projectId, irId: group.id });
        if (active) setHandoffResult({ group, handoff });
      } catch (error) {
        if (active)
          setHandoffResult({
            group,
            error: formatUserFacingError(error, "提案交付信息读取失败，请稍后重试。"),
          });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [source, group]);
  if (!source.capabilities.requirementManagement) return null;
  const delivery = group.proposalDelivery;
  const current = proposalDeliveryCurrent(group);
  const version = proposalVersion(group);
  const pushed = !!delivery && current && delivery.pushedCandidate === delivery.candidate;
  const mrReady = proposalState(group) === "merge-pending";
  const mine = source.capabilities.proposalDiscussion === true;
  const state = proposalState(group);
  const ready = state === "submission-pending" || state === "merge-pending";
  const result = handoffResult?.group === group ? handoffResult : null;
  const handoff = result?.handoff;
  const handoffLoading = !result;
  const boundCurrent =
    !!dialog &&
    dialog.version === version &&
    (dialog.step === "confirm" || (current && dialog.candidate === delivery?.candidate));
  const allFilesChecked =
    !!dialog?.files.length && dialog.files.every((file) => checkedFiles.includes(file.path));
  const selectedFileCount =
    dialog?.files.filter((file) => checkedFiles.includes(file.path)).length ?? 0;
  const editable =
    !readOnly && ready && mine && !aireq.pending && handoff?.ready === true && boundCurrent;
  const canSubmit =
    editable &&
    !submittingDelivery &&
    !!dialog &&
    (dialog.step === "confirm"
      ? !current && allFilesChecked && acknowledged
      : dialog.step === "push"
        ? current && (!pushed || !mrReady)
        : false);
  const openDialog = () => {
    const step: DeliveryStep = pushed && mrReady ? "pr" : current ? "push" : "confirm";
    setDialog({
      step,
      version,
      candidate: current ? delivery?.candidate : undefined,
      files: structuredClone(current && delivery ? delivery.files : group.files),
    });
    setDialogOpen(true);
    setCheckedFiles([]);
    setAcknowledged(false);
  };
  const prTitle = group.requirementsPr?.title ?? `[需求] ${group.title}`;
  const prBody =
    group.requirementsPr?.body ??
    (dialog && handoff
      ? [
          "## 需求与方案",
          `IR：${group.id} · ${group.title}`,
          `候选：${dialog.candidate ?? "待确认"}`,
          `来源分支：${handoff.branch}`,
          `目标分支：${handoff.targetBranch}`,
          "",
          "## 文档清单",
          ...dialog.files.map((file) => `- ${file.path}`),
          "",
          "平台已自动创建 MR，请人工评审并合并；后台定时核验实际合入与材料完整性，满足后自动转正。",
          "入库只表示需求已批准，不表示代码已完成；平台随后创建各 SR 开发分支。",
        ].join("\n")
      : "");
  return (
    <section
      className={compact ? "flex shrink-0 items-center gap-2" : "space-y-2"}
      data-testid="proposal-delivery-controls"
    >
      <Button
        size="sm"
        variant={ready && !mrReady ? "default" : "outline"}
        data-testid="proposal-delivery-open"
        disabled={
          aireq.pending ||
          handoffLoading ||
          !!result?.error ||
          (!pushed && (!mine || !ready || !handoff?.ready))
        }
        title={
          !ready
            ? "请先完成当前版本的审查与三方确认。"
            : !handoff?.ready
              ? handoff?.blockers.join("；")
              : undefined
        }
        onClick={openDialog}
      >
        {pushed && mrReady
          ? "查看提交记录"
          : pushed
            ? "重试创建 MR"
            : !ready
              ? "等待审查与三方确认"
              : !current
                ? "确认方案并提交推送"
                : "创建提案分支并提交推送"}
      </Button>
      {handoffLoading && (
        <p role="status" className="text-ui-sm text-foreground-subtle">
          正在读取提案交付信息…
        </p>
      )}
      {result?.error && (
        <p role="alert" className="text-ui-sm text-destructive">
          {result.error}
        </p>
      )}
      {!compact && !handoffLoading && !pushed && handoff && !handoff.ready && (
        <div className="space-y-1 text-ui-sm text-foreground-subtle" role="status">
          <p>提交剩余条件</p>
          <ul className="list-disc space-y-1 pl-5">
            {handoff.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}
      {!compact && !mrReady && (
        <p className="text-ui-sm text-foreground-subtle">
          {pushed && mrReady
            ? "提案分支已推送并自动创建 MR，等待人工评审合并；后台按计划核验。"
            : pushed
              ? "提案分支已推送，等待创建当前候选的 MR。"
              : "方案完成并人工确认当前文档后，平台才创建提案分支；无需个人开发目录。"}
        </p>
      )}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !submitting.current) setDialogOpen(false);
        }}
      >
        <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-border/50 px-6 py-5">
            <DialogTitle>{dialog ? stepTitles[dialog.step] : "需求交付"}</DialogTitle>
            <DialogDescription>
              核对本次提交的方案文件。提交后自动创建 MR，供人工评审合并。
            </DialogDescription>
          </DialogHeader>
          {dialog && (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!canSubmit || submitting.current) return;
                // pending 依赖异步投影，无法封住连续提交及 confirm→publish 之间的空隙。
                submitting.current = true;
                setSubmittingDelivery(true);
                try {
                  const target = { projectId: group.projectId, irId: group.id };
                  if (dialog.step === "confirm") {
                    const confirmed = await aireq.command({
                      type: "confirmProposal",
                      ...target,
                      version: dialog.version,
                    });
                    if (confirmed?.status !== "completed") return;
                    const candidate = confirmed.view?.drafts.find(
                      (item) => item.projectId === group.projectId && item.id === group.id,
                    )?.proposalDelivery?.candidate;
                    if (!candidate) return;
                    const pushedResult = await aireq.command({
                      type: "publishProposal",
                      ...target,
                      candidate,
                    });
                    // 退场时保留确认内容；仅推送失败才展示可重试的推送步骤。
                    if (pushedResult?.status === "completed") setDialogOpen(false);
                    else setDialog({ ...dialog, step: "push", candidate });
                  } else {
                    const result = await aireq.command({
                      type: "publishProposal",
                      ...target,
                      candidate: dialog.candidate!,
                    });
                    if (result?.status === "completed") setDialogOpen(false);
                  }
                } finally {
                  submitting.current = false;
                  setSubmittingDelivery(false);
                }
              }}
            >
              <div
                className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5"
                data-testid="proposal-delivery-body"
              >
                {dialogOpen && !aireq.pending && !boundCurrent && (
                  <p role="alert" className="text-ui-sm text-destructive">
                    需求或方案版本已变化，请关闭后重新确认当前文档。
                  </p>
                )}
                {handoffLoading && (
                  <p role="status" className="text-ui-sm text-foreground-subtle">
                    正在读取提案交付信息…
                  </p>
                )}
                {result?.error && (
                  <p role="alert" className="text-ui-sm text-destructive">
                    {result.error}
                  </p>
                )}
                {dialog.step !== "pr" ? (
                  <>
                    <section className="space-y-3" aria-label="提交目标">
                      <div className="flex min-w-0 items-baseline justify-between gap-3">
                        <h3 className="min-w-0 break-words text-ui-base font-medium">
                          {group.title}
                        </h3>
                        <span className="shrink-0 text-ui-sm text-foreground-subtle">
                          {dialog.files.length} 份文件
                        </span>
                      </div>
                      <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-surface px-4 py-3 text-ui-sm">
                        <div className="col-span-2 min-w-0">
                          <dt className="text-foreground-subtle">目标仓库</dt>
                          <dd className="mt-1 break-all">{handoff?.repositoryUrl ?? "尚未配置"}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-foreground-subtle">提案分支</dt>
                          <dd className="mt-1 break-all font-mono">
                            {handoff?.branch ?? "读取中…"}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-foreground-subtle">合入分支</dt>
                          <dd className="mt-1 break-all font-mono">
                            {handoff?.targetBranch ?? "读取中…"}
                          </dd>
                        </div>
                      </dl>
                      <details className="text-ui-sm text-foreground-subtle">
                        <summary className="w-fit cursor-pointer">提交详情</summary>
                        <dl className="mt-3 space-y-3">
                          {handoff?.sourceDirectory && (
                            <div>
                              <dt>材料来源</dt>
                              <dd className="mt-1 break-all font-mono">
                                {handoff.sourceDirectory}
                              </dd>
                            </div>
                          )}
                          <div>
                            <dt>材料版本</dt>
                            <dd className="mt-1 break-all font-mono">{dialog.version}</dd>
                          </div>
                          {dialog.candidate && (
                            <div>
                              <dt>提交候选</dt>
                              <dd className="mt-1 break-all font-mono">{dialog.candidate}</dd>
                            </div>
                          )}
                        </dl>
                      </details>
                    </section>
                    <fieldset className="min-w-0 space-y-3">
                      <legend className="text-ui-base font-medium">提交文件</legend>
                      <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-3">
                        {dialog.step === "confirm" ? (
                          <label className="flex cursor-pointer items-center gap-2 text-ui-sm">
                            <Checkbox
                              aria-label="全选文件"
                              data-testid="proposal-delivery-select-all"
                              checked={
                                allFilesChecked
                                  ? true
                                  : selectedFileCount > 0
                                    ? "indeterminate"
                                    : false
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
                        ) : (
                          <span className="text-ui-sm text-foreground-subtle">
                            已确认的完整文件包
                          </span>
                        )}
                        <span
                          className="text-ui-sm tabular-nums text-foreground-subtle"
                          role="status"
                          data-testid="proposal-delivery-selection-count"
                        >
                          {dialog.step === "confirm"
                            ? `已选 ${selectedFileCount} / ${dialog.files.length}`
                            : `${dialog.files.length} 份文件`}
                        </span>
                      </div>
                      <ul className="divide-y divide-border/40">
                        {dialog.files.map((file) => (
                          <li key={file.path}>
                            <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-3 text-ui-sm hover:bg-surface-hover">
                              {dialog.step === "confirm" && (
                                <Checkbox
                                  data-testid="proposal-delivery-file-check"
                                  // 未勾选框也是必需操作入口，局部增强边界而不改变通用 Checkbox。
                                  className="data-[state=unchecked]:border-foreground/60"
                                  aria-label={`确认 ${file.path}`}
                                  checked={checkedFiles.includes(file.path)}
                                  disabled={!editable}
                                  onCheckedChange={(checked) =>
                                    setCheckedFiles((previous) =>
                                      checked === true
                                        ? [
                                            ...previous.filter((path) => path !== file.path),
                                            file.path,
                                          ]
                                        : previous.filter((path) => path !== file.path),
                                    )
                                  }
                                />
                              )}
                              <span className="min-w-0">
                                <span className="block">
                                  {requirementMaterialName(file.path, aireq.view?.srs) ??
                                    "需求材料"}
                                </span>
                                <span className="mt-1 block break-all font-mono text-ui-sm text-foreground-subtle">
                                  {file.path}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </fieldset>
                    {dialog.step === "confirm" && (
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-surface p-4 text-ui-sm">
                        <Checkbox
                          data-testid="proposal-delivery-confirm-all"
                          className="data-[state=unchecked]:border-foreground/60"
                          checked={acknowledged}
                          disabled={!editable}
                          onCheckedChange={(checked) => setAcknowledged(checked === true)}
                        />
                        <span>我已核对以上文件，确认方案并授权提交推送。</span>
                      </label>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="proposal-pr-title">MR 标题</Label>
                      <Input
                        id="proposal-pr-title"
                        data-testid="proposal-pr-title"
                        value={prTitle}
                        readOnly
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="proposal-pr-body">MR 正文</Label>
                      <SettingsFormTextarea
                        id="proposal-pr-body"
                        data-testid="proposal-pr-body"
                        value={prBody}
                        readOnly
                        rows={8}
                      />
                    </div>
                    <p className="text-ui-sm text-foreground-subtle">
                      MR 由平台自动创建；请在企业 Git 平台人工评审并合并，后台定时核验后转正。
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="proposal-pr-url">MR 地址</Label>
                      <Input
                        id="proposal-pr-url"
                        data-testid="proposal-pr-url"
                        value={
                          group.requirementsPr
                            ? (resolveMrLink(group.requirementsPr.url) ?? "暂无可访问链接")
                            : "等待平台创建 MR"
                        }
                        readOnly
                      />
                    </div>
                    <AIReqProposalBackgroundStatus group={group} />
                  </>
                )}
                {aireq.error && (
                  <p role="alert" className="text-ui-sm text-destructive">
                    {aireq.error}
                  </p>
                )}
              </div>
              <DialogFooter className="shrink-0 items-center gap-3 border-t border-border/50 px-6 py-4">
                <p className="mr-auto text-ui-sm text-foreground-subtle">
                  {dialog.step === "confirm"
                    ? "全部文件勾选并确认后可提交"
                    : dialog.step === "pr"
                      ? "等待人工合并，后台自动核验"
                      : "继续提交当前已确认的文件包"}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submittingDelivery}
                  onClick={() => setDialogOpen(false)}
                >
                  {dialog.step === "pr" ? "关闭" : "取消"}
                </Button>
                {!readOnly && dialog.step !== "pr" && (
                  <Button
                    type="submit"
                    data-testid={`proposal-delivery-${dialog.step}`}
                    disabled={!canSubmit}
                  >
                    {/* 修复：推送已成功时，重试只补建 MR，不能提示再次推送。 */}
                    {dialog.step === "confirm"
                      ? submittingDelivery
                        ? "正在提交…"
                        : "确认并提交推送"
                      : pushed
                        ? "重试创建 MR"
                        : "提交推送并创建 MR"}
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
