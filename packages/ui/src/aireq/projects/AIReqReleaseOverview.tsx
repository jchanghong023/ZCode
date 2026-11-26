import { useState } from "react";
import { ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Card } from "@/components/ui/card.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqReleaseSummary, AIReqRequirementGroup } from "../contract.js";
import { AIReqProposalDetails } from "../proposals/AIReqProposalText.js";
import {
  formatProposalDwellTime,
  proposalPerson,
  proposalProcessLabel,
} from "../proposals/proposalColumns.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import { openReleaseStays, releaseIRTitle } from "./releaseOverviewData.js";

const stayColumns =
  "grid grid-cols-[minmax(0,1fr)_minmax(3rem,0.24fr)_minmax(5rem,0.33fr)_minmax(4.25rem,auto)] items-center gap-x-3";

export function AIReqReleaseOverview({
  release,
  requirements,
  allStays,
  setAllStays,
  now,
  zh,
}: {
  release: AIReqReleaseSummary & { updatedAt: number };
  requirements: AIReqRequirementGroup[];
  allStays: boolean;
  setAllStays: (expanded: boolean) => void;
  now: number;
  zh: boolean;
}) {
  const ai = useAIReq()!;
  const pane = useAIReqSidePane();
  const isCobalt = useZCodeStore((state) => state.theme === "aireq-cobalt");
  const [allUpdates, setAllUpdates] = useState(false);
  const stays = openReleaseStays(requirements, now);
  const extendedStayCount = stays.filter(({ band }) => band !== undefined).length;
  const rowTitle = (title: string) =>
    releaseIRTitle(title, release.title) || (zh ? "未命名需求" : "Untitled requirement");
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
  const completedCount = release.completedRequirementCount;
  const completionRate = release.requirementCount
    ? (completedCount / release.requirementCount).toLocaleString(locale, {
        style: "percent",
        maximumFractionDigits: 1,
      })
    : "—";
  const completedCountText = zh
    ? `${completedCount} 条`
    : `${completedCount} ${completedCount === 1 ? "IR" : "IRs"}`;
  const metrics = [
    { label: zh ? "IR 总数" : "Total IRs", value: release.requirementCount },
    {
      label: zh ? "已完成" : "Completed",
      value: isCobalt ? completionRate : completedCount,
      detail: isCobalt ? completedCountText : `(${completionRate})`,
      emphasis: "completion",
    },
    {
      label: zh ? "已有正式定版文档" : "With a confirmed IR document",
      value: known ? confirmed : "—",
    },
    {
      label: zh ? "停留 ≥30 天" : "Time in status ≥30 days",
      value: extendedStayCount,
      emphasis: extendedStayCount > 0 ? "stay-warning" : "stay",
    },
  ];
  const date = (stamp: number | string) =>
    new Date(stamp).toLocaleDateString(locale, { timeZone: "Asia/Shanghai" });
  const more = (all: boolean, count: number, set: (next: boolean) => void) =>
    count > 3 && (
      <Button
        className={count <= 5 && !all ? "@min-[840px]/release:hidden" : undefined}
        size="sm"
        variant="link"
        aria-expanded={all}
        onClick={() => set(!all)}
      >
        {all ? (zh ? "收起" : "Show fewer") : zh ? `查看全部 ${count} 条` : `Show all ${count}`}
      </Button>
    );
  return (
    <Card className="@container/release min-w-0 gap-0 p-0 @min-[900px]/home:col-span-9">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/65 px-5 py-4 @min-[840px]/release:px-6">
        <div className="min-w-0">
          <h2 className="wrap-anywhere text-ui-settings-title font-semibold tracking-tight">
            {release.title}
          </h2>
          <p className="mt-1 text-ui-caption text-foreground-subtle">
            {zh ? "最近新增 IR" : "Latest IR created"} · {date(release.updatedAt)}
          </p>
        </div>
        <Button size="lg" onClick={() => ai.openProject(release.projectId, release.id)}>
          {zh
            ? `查看本版本的 ${release.requirementCount} 条 IR`
            : `View ${release.requirementCount} IRs in this release`}
          <ArrowRight aria-hidden="true" />
        </Button>
      </header>
      <dl
        data-aireq-release-summary=""
        className="grid grid-cols-2 gap-y-4 border-b border-border/65 bg-background/35 px-5 py-4 @min-[552px]/release:grid-cols-4 @min-[840px]/release:px-6"
      >
        {metrics.map(({ label, value, detail, emphasis }) => (
          <div
            key={label}
            data-aireq-release-metric={emphasis}
            className="flex min-w-0 flex-col gap-1 border-border even:border-l even:pl-4 @min-[552px]/release:not-first:border-l @min-[552px]/release:not-first:pl-4"
          >
            <dt className="text-ui-caption text-foreground-subtle">{label}</dt>
            <dd className="flex flex-wrap items-baseline gap-x-2 font-semibold leading-tight tabular-nums">
              <span className="text-ui-settings-title-lg leading-none tracking-tight">{value}</span>
              {detail && (
                <span className="text-ui-caption font-normal text-foreground-subtle">
                  {detail}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div
        className={`grid min-w-0 items-start gap-4 px-5 py-5 @min-[840px]/release:px-6 ${updates.length ? "@min-[840px]/release:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] @min-[840px]/release:gap-6" : ""}`}
      >
        <section className="min-w-0">
          <h3 className="text-ui-lg font-semibold">
            {zh ? "未完成需求 · 当前阶段停留时间" : "Open IRs · Time in current status"}
          </h3>
          {stays.length ? (
            <>
              <div
                aria-hidden="true"
                className={`mt-3 border-b border-border/65 pb-1.5 text-ui-caption text-foreground-subtle ${stayColumns}`}
              >
                <span>{zh ? "需求" : "Requirement"}</span>
                <span>{zh ? "阶段" : "Stage"}</span>
                <span>{zh ? "当前责任人" : "Current owner"}</span>
                <span className="text-right">{zh ? "停留时间" : "Time in status"}</span>
              </div>
              <ul
                className={`divide-y divide-border/55 ${allStays ? "" : "@max-[840px]/release:[&>li:nth-child(n+4)]:hidden"}`}
              >
                {(allStays ? stays : stays.slice(0, 5)).map(({ ir, elapsed, band }) => (
                  <li key={ir.id}>
                    <AIReqProposalDetails item={ir} zh={zh}>
                      <button
                        type="button"
                        data-aireq-overview-entry={ir.id}
                        className={`w-full rounded-sm py-2.5 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-input-border-focused ${stayColumns}`}
                      >
                        <span
                          data-aireq-control-label=""
                          className="min-w-0 wrap-anywhere font-medium"
                        >
                          {rowTitle(ir.title)}
                        </span>
                        <span className="min-w-0 wrap-anywhere text-ui-caption">
                          <span className="sr-only">{zh ? "阶段 " : "Stage "}</span>
                          {ir.process ? (
                            <span data-aireq-theme-stage={ir.process}>
                              {proposalProcessLabel(ir.process, zh)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </span>
                        <span className="min-w-0 wrap-anywhere text-ui-caption text-foreground-subtle">
                          <span className="sr-only">{zh ? "当前责任人 " : "Current owner "}</span>
                          {proposalPerson(ir, "owner") || "—"}
                        </span>
                        <span
                          data-stay-band={band}
                          className="justify-self-end whitespace-nowrap font-semibold tabular-nums text-foreground-subtle data-[stay-band=30-90]:text-warning-surface-foreground data-[stay-band=over-90]:text-destructive-surface-foreground"
                        >
                          <span className="sr-only">{zh ? "停留时间 " : "Time in status "}</span>
                          {elapsed === undefined ? "—" : formatProposalDwellTime(elapsed, zh)}
                        </span>
                      </button>
                    </AIReqProposalDetails>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-foreground-subtle">
              {zh ? "此版本的 IR 已全部完成。" : "All IRs in this release are complete."}
            </p>
          )}
          {more(allStays, stays.length, setAllStays)}
        </section>
        {updates.length ? (
          <section className="min-w-0 border-t border-border/65 pt-4 @min-[840px]/release:border-t-0 @min-[840px]/release:border-l @min-[840px]/release:pt-0 @min-[840px]/release:pl-5">
            <h3 className="text-ui-lg font-semibold">
              {zh ? "最近文档更新" : "Recent IR document updates"}
            </h3>
            <ul
              className={`mt-2 divide-y divide-border/55 ${allUpdates ? "" : "@max-[840px]/release:[&>li:nth-child(n+4)]:hidden"}`}
            >
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
                        <span data-aireq-control-label="" className="wrap-anywhere font-medium">
                          {rowTitle(ir.title)}
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
            {more(allUpdates, updates.length, setAllUpdates)}
          </section>
        ) : (
          <p className="flex items-center gap-2 border-t border-border pt-3 text-ui-caption text-foreground-subtle">
            <FileText aria-hidden="true" className="size-4 shrink-0" />
            {zh ? "最近文档更新 · 暂无记录" : "Recent IR document updates · None recorded"}
          </p>
        )}
      </div>
    </Card>
  );
}
