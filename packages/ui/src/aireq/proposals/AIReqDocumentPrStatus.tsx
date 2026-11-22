import { aiReqPrFactSchema, type AIReqRequirementGroup } from "../contract.js";

export function resolveMrLink(value: string | undefined): string | undefined {
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
export function AIReqProposalBackgroundStatus({ group }: { group: AIReqRequirementGroup }) {
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
          {pr.platformVerified ? "已核验仓库合入" : "尚未核验仓库合入"}
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
          <span className="text-foreground-subtle">没有可打开的仓库链接</span>
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
        {check?.status === "untracked"
          ? "此 PR 尚未跟踪。请开始跟踪，以便核验合入和文件完整性。"
          : check?.status === "failed" || check?.status === "incomplete"
            ? check.message
            : pr.status === "merged"
              ? "仓库已报告合入，正在核验本次提交的文件。"
              : link
                ? "请在仓库完成合入，系统会自动核验。"
                : "后台正在跟踪合入进度，通过文件核验后自动归档。"}
      </p>
      {check?.status !== "untracked" && (
        <p className="text-ui-sm text-foreground-subtle">
          {check?.checkedAt ? `最近核验：${time(check.checkedAt)}（北京时间）` : "等待首轮核验"}
          {check?.nextCheckAt ? ` · 下次核验：${time(check.nextCheckAt)}（北京时间）` : ""}
        </p>
      )}
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
