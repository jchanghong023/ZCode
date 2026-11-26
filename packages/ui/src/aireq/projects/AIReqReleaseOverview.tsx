import { useState } from "react";
import { ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Card } from "@/components/ui/card.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqReleaseSummary, AIReqRequirementGroup } from "../contract.js";
import { AIReqProposalDetails } from "../proposals/AIReqProposalText.js";
import {
  proposalDwellTime,
  formatProposalDwellTime,
  proposalProcessLabel,
} from "../proposals/proposalColumns.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";

export function AIReqReleaseOverview({
  release,
  requirements,
  now,
  zh,
}: {
  release: AIReqReleaseSummary & { updatedAt: number };
  requirements: AIReqRequirementGroup[];
  now: number;
  zh: boolean;
}) {
  const ai = useAIReq()!;
  const pane = useAIReqSidePane();
  const [allStays, setAllStays] = useState(false);
  const [allUpdates, setAllUpdates] = useState(false);
  const stays = requirements
    .filter((ir) => ir.process !== "完成")
    .map((ir) => ({ ir, elapsed: proposalDwellTime(ir, now) }))
    .sort((a, b) => (b.elapsed ?? -1) - (a.elapsed ?? -1) || a.ir.id.localeCompare(b.ir.id));
  const updates = requirements
    .flatMap((ir) => {
      const stamp = ir.irDocument?.updatedAt;
      return stamp ? [{ ir, stamp }] : [];
    })
    .sort((a, b) => b.stamp.localeCompare(a.stamp) || a.ir.id.localeCompare(b.ir.id));
  const known = requirements.every((ir) => !ir.irDocument || ir.irDocument.version !== undefined);
  const confirmed = requirements.filter(
    (ir) => ir.irDocument?.lastConfirmedVersion !== undefined,
  ).length;
  const locale = zh ? "zh-CN" : "en-US";
  const date = (stamp: number | string) =>
    new Date(stamp).toLocaleDateString(locale, { timeZone: "Asia/Shanghai" });
  const more = (all: boolean, count: number, set: (next: boolean) => void, compact = false) =>
    count > (compact ? 3 : 5) && (
      <Button
        className={compact && count <= 5 && !all ? "[@media(min-height:761px)]:hidden" : undefined}
        size="sm"
        variant="link"
        aria-expanded={all}
        onClick={() => set(!all)}
      >
        {all ? (zh ? "收起" : "Show fewer") : zh ? `查看全部 ${count} 条` : `Show all ${count}`}
      </Button>
    );
  return (
    <Card className="min-w-0 gap-5 p-5">
      <header className="aireq-release-heading flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="wrap-anywhere text-ui-xl font-semibold">{release.title}</h2>
          <p className="mt-1 text-ui-caption text-foreground-subtle">
            {zh ? "最近新增 IR" : "Latest IR created"} · {date(release.updatedAt)}
          </p>
        </div>
        <Button variant="secondary" onClick={() => ai.openProject(release.projectId, release.id)}>
          {zh ? "进入需求共创" : "Open co-creation"}
          <ArrowRight aria-hidden="true" />
        </Button>
      </header>
      <dl className="aireq-release-counts flex flex-wrap gap-x-10 gap-y-3 border-b border-border pb-4">
        {[
          [zh ? "IR 总数" : "Total IRs", release.requirementCount],
          [zh ? "已完成" : "Completed", release.completedRequirementCount],
          [zh ? "已有正式定版文档" : "With a confirmed IR document", known ? confirmed : "—"],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse gap-1">
            <dt className="text-ui-caption text-foreground-subtle">{label}</dt>
            <dd className="text-ui-settings-title font-semibold leading-tight tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <section>
        <h3 className="text-ui-lg font-semibold">
          {zh ? "未完成需求 · 当前阶段停留时间" : "Open IRs · Time in current status"}
        </h3>
        {stays.length ? (
          <ul
            className={`mt-2 divide-y divide-border ${allStays ? "" : "[@media(max-height:760px)]:[&>li:nth-child(n+4)]:hidden"}`}
          >
            {(allStays ? stays : stays.slice(0, 5)).map(({ ir, elapsed }) => (
              <li key={ir.id}>
                <AIReqProposalDetails item={ir} zh={zh}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-sm py-2 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-input-border-focused"
                  >
                    <span className="grid min-w-0 gap-0.5">
                      <span className="wrap-anywhere font-medium">
                        {ir.title || (zh ? "未命名需求" : "Untitled requirement")}
                      </span>
                      <span className="text-ui-caption text-foreground-subtle">
                        {proposalProcessLabel(ir.process || "—", zh)}
                      </span>
                    </span>
                    <span
                      data-longest-stay={
                        elapsed !== undefined && elapsed === stays[0]?.elapsed ? "" : undefined
                      }
                      className="shrink-0 text-ui-lg font-semibold tabular-nums"
                    >
                      {elapsed === undefined ? "—" : formatProposalDwellTime(elapsed, zh)}
                    </span>
                  </button>
                </AIReqProposalDetails>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-foreground-subtle">
            {zh ? "此版本的 IR 已全部完成。" : "All IRs in this release are complete."}
          </p>
        )}
        {more(allStays, stays.length, setAllStays, true)}
      </section>
      <section>
        <h3 className="text-ui-lg font-semibold">
          {zh ? "最近文档更新" : "Recent IR document updates"}
        </h3>
        {updates.length ? (
          <ul className="mt-2 space-y-1">
            {(allUpdates ? updates : updates.slice(0, 5)).map(({ ir, stamp }) => {
              const doc = ir.irDocument!;
              const status =
                doc.version === doc.lastConfirmedVersion
                  ? zh
                    ? "已定版"
                    : "confirmed"
                  : zh
                    ? "草稿"
                    : "draft";
              return (
                <li key={ir.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 rounded-sm py-2 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-input-border-focused"
                    onClick={() =>
                      ai.openProject(ir.projectId, ir.releaseId, undefined, () =>
                        pane.open({
                          selection: { projectId: ir.projectId, irId: ir.id },
                          initialPath: doc.path ?? ir.documentPath,
                          releaseId: ir.releaseId,
                          title: ir.title,
                        }),
                      )
                    }
                  >
                    <FileText
                      className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
                      aria-hidden="true"
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="wrap-anywhere font-medium">
                        {ir.title || (zh ? "未命名需求" : "Untitled requirement")}
                      </span>
                      <span className="text-ui-caption text-foreground-subtle">
                        {date(stamp)}
                        {doc.version && ` · V${doc.version} ${status}`}
                        {doc.lastConfirmedVersion &&
                          doc.lastConfirmedVersion !== doc.version &&
                          (zh
                            ? ` · 上次定版 V${doc.lastConfirmedVersion}`
                            : ` · Last confirmed V${doc.lastConfirmedVersion}`)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-foreground-subtle">
            {zh ? "暂无文档更新记录。" : "No document updates recorded."}
          </p>
        )}
        {more(allUpdates, updates.length, setAllUpdates)}
      </section>
    </Card>
  );
}
