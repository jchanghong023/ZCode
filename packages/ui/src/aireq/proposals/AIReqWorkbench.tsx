import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "../shell/pageLayout.js";
import { useState, type ReactNode } from "react";
import { ChevronRight, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  MATERIAL_KIND_LABELS,
  requirementMaterialName,
  proposalViewedIndex,
  type AIReqMaterialView,
} from "../contract.js";
import { useAIReq, type AIReqContextValue } from "../AIReqContext.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { AIReqSrDependencyGraph } from "./AIReqSrDependencyGraph.js";
import {
  isCurrentMaterialConfirmed,
  materialReadFeedback,
  readMaterialSelection,
  type MaterialReadFeedback,
} from "./material-reader.js";

export function AIReqMaterialsPane({ headerAction }: { headerAction?: ReactNode }) {
  const aireq = useAIReq()!;
  const { selection, releaseId } = aireq;
  return (
    <AIReqMaterialsReader
      key={JSON.stringify([
        selection.projectId,
        releaseId,
        selection.irId,
        selection.srId,
        selection.materialPath,
      ])}
      aireq={aireq}
      headerAction={headerAction}
    />
  );
}

function AIReqMaterialsReader({
  aireq,
  headerAction,
}: {
  aireq: AIReqContextValue;
  headerAction?: ReactNode;
}) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const compact = headerAction != null;
  const theme = useZCodeStore((state) => state.theme);
  const codePreviewSettings = useZCodeStore((state) => state.codePreviewSettings);
  const { selection, releaseId, view } = aireq;
  const [path, setPath] = useState<string>();
  const [readFeedback, setReadFeedback] = useState<MaterialReadFeedback>();
  const [historyIndex, setHistoryIndex] = useState<number>();
  const viewingHistory = historyIndex !== undefined;
  const group = [...(view?.groups ?? []), ...(view?.drafts ?? [])].find(
    (item) =>
      item.id === selection.irId &&
      item.projectId === selection.projectId &&
      item.releaseId === releaseId,
  );
  const currentRows = viewingHistory
    ? []
    : (view?.srs.filter((item) => item.irId === group?.id && item.projectId === group?.projectId) ??
      []);
  const proposalSolutionView =
    !viewingHistory &&
    group &&
    view?.drafts.includes(group) &&
    proposalViewedIndex(group, selection) >= 2;
  const {
    historical,
    materials,
    rows: materialRows,
    proposalRound,
    design,
    selected,
    material: current,
  } = readMaterialSelection(group, view?.materials ?? [], currentRows, {
    path,
    historyIndex,
    materialPath: selection.materialPath,
    srId: selection.srId,
    preferDesign: proposalSolutionView,
  });
  // 投影暂未就绪时不清空本 Tab 的选择；原路径确实移除后再回到默认材料。
  if (path && aireq.selectionReady && !selected) setPath(undefined);
  const displayedPath = current?.path ?? "";
  const materialInfo = viewingHistory ? historical : group;
  const materialIssues = [
    ...(materialInfo?.requirementsCheck?.issues ?? []),
    ...(materialInfo?.solutionCheck?.issues ?? []),
  ];
  const materialLabel = (item: AIReqMaterialView) => {
    const label = requirementMaterialName(item.path) ?? MATERIAL_KIND_LABELS[item.kind];
    // IR 汇总列出多个 SR 的同类文件，必须同时给出所属 SR 和材料名。
    const materialSr = materialRows?.find((sr) => sr.id === item.srId);
    if (compact && item.path.endsWith("/sr-dependencies.json"))
      return zh ? "SR 依赖" : "SR dependencies";
    if (compact) {
      const name = item.path.split("/").at(-1) || item.path;
      const title = `${label} · ${name}`;
      return item.srId
        ? `${title} · ${item.srId}${materialSr ? ` · ${materialSr.title}` : ""}`
        : title;
    }
    return item.srId
      ? `${item.srId}${materialSr ? ` · ${materialSr.title}` : ""} · ${label}`
      : label;
  };
  const selectedMaterialSrId = current?.srId ?? selection.srId;
  const solutionMaterial =
    materials.find(
      (item) => item.srId === selectedMaterialSrId && item.path.endsWith("/design.md"),
    ) ?? design;
  const dependencyMaterial = materials.find(
    (item) => !item.srId && item.path.endsWith("/sr-dependencies.json"),
  );
  const materialGroups = [
    undefined,
    ...new Set(materials.map((item) => item.srId).filter((id): id is string => Boolean(id))),
  ]
    .map((srId) => {
      const owner = materialRows?.find((item) => item.id === srId);
      return {
        id: srId ?? "ir",
        label: srId
          ? `${owner?.title ?? srId}${owner ? ` · ${srId}` : ""}`
          : zh
            ? "IR 共享材料"
            : "Shared IR materials",
        items: materials.filter((item) => item.srId === srId),
      };
    })
    .filter((section) => section.items.length);
  const historyChoices =
    group?.materialHistory?.flatMap((item, index) => {
      if (!item.materials.some((file) => file.path === displayedPath)) return [];
      const event = item.event;
      const change =
        event?.type === "git-sync"
          ? event.files.find((file) => file.path === displayedPath)?.change
          : undefined;
      if (event?.type === "git-sync" && !change && index !== historyIndex) return [];
      const time = new Date(item.changedAt).toLocaleString(locale, { timeZone: "Asia/Shanghai" });
      return [{ item, index, event, change, time }];
    }) ?? [];
  const selectHistory = (value: string) => {
    setPath(displayedPath || undefined);
    setHistoryIndex(value === "current" ? undefined : Number(value));
  };
  const confirmationBadge = !viewingHistory && isCurrentMaterialConfirmed(group, current) && (
    <span className="text-ui-sm text-success">{zh ? "已确认" : "Confirmed"}</span>
  );
  const historyControls =
    historyChoices.length > 0 ? (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={historyIndex === undefined ? "current" : String(historyIndex)}
            onValueChange={selectHistory}
          >
            <SelectTrigger
              variant="ghost"
              className="max-w-full min-w-0 text-ui-sm"
              aria-label="选择文件版本"
            >
              <SelectValue>{viewingHistory ? "历史版本 · 只读" : "当前版本"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">当前版本</SelectItem>
              {historyChoices.map(({ item, index, time }) => (
                <SelectItem key={index} value={String(index)}>
                  {item.reason} · {time}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {historical && (
            <span className="text-ui-sm text-foreground-subtle">{historical.reason}</span>
          )}
          {confirmationBadge}
        </div>
        <details className="text-ui-sm">
          <summary className="w-fit cursor-pointer rounded-sm text-foreground-subtle focus-visible:outline-2 focus-visible:outline-ring">
            文件操作记录
          </summary>
          <ol className="mt-1 divide-y divide-border">
            {[...historyChoices].reverse().map(({ item, index, event, change, time }) => (
              <li key={index} className="space-y-1 py-2">
                <button
                  type="button"
                  className="text-left font-medium hover:underline"
                  onClick={() => selectHistory(String(index))}
                >
                  {item.reason} · {time}
                </button>
                {event?.type === "confirmation" && (
                  <p className="text-foreground-subtle">
                    {{ business: "业务", development: "开发", testing: "测试" }[event.role]}确认 ·{" "}
                    {event.employeeId}
                  </p>
                )}
                {event?.type === "git-sync" && change && (
                  <div className="space-y-1 wrap-anywhere text-foreground-subtle">
                    <p>
                      同步人 {event.employeeId} · 仓库提交 <code>{event.commit}</code>
                    </p>
                    <p>
                      {change.message} · {change.employee} ·{" "}
                      {new Date(change.committedAt).toLocaleString(locale, {
                        timeZone: "Asia/Shanghai",
                      })}
                    </p>
                    <p className="font-mono">{change.hash}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </details>
      </div>
    ) : (
      confirmationBadge
    );
  const materialTabClassName =
    "h-9 min-w-0 flex-1 rounded-none border-0 border-b-2 border-transparent bg-transparent px-2 text-foreground-subtle hover:bg-transparent hover:text-foreground aria-pressed:border-foreground aria-pressed:text-foreground";
  const error = current?.error;
  const readRequest =
    !viewingHistory && current
      ? {
          projectId: current.projectId,
          releaseId,
          irId: current.irId,
          path: current.path,
          sha256: current.sha256,
          round: current.round,
        }
      : undefined;
  const feedback = materialReadFeedback(readRequest, readFeedback);
  const awaitingRequirements =
    !viewingHistory &&
    !selection.srId &&
    group?.status === "draft" &&
    !group.snapshot &&
    !group.files.length &&
    !materials.length;
  // 切换需求时投影仍属于旧选择；不能将暂缺材料当作空清单或读取失败。
  if (!aireq.selectionReady) {
    return (
      <aside
        className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background"
        data-testid="materials-pane"
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/50 px-2">
          <span>{zh ? "需求材料" : "Requirement materials"}</span>
          {headerAction}
        </div>
        <p role="status" className="px-4 py-4 text-ui-sm text-foreground-subtle">
          {aireq.pending
            ? zh
              ? "正在读取材料…"
              : "Loading materials…"
            : zh
              ? "材料尚未读取，请重新读取。"
              : "Materials are not loaded. Reload to continue."}
        </p>
      </aside>
    );
  }
  return (
    <aside
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background"
      data-testid="materials-pane"
    >
      {compact ? (
        <>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-2">
            <span className="shrink-0 text-ui-base">
              {zh ? "需求材料" : "Requirement materials"}
            </span>
            <Select value={displayedPath || "none"} onValueChange={setPath}>
              <SelectTrigger
                className={materialTabClassName}
                data-testid="material-menu"
                aria-label={zh ? "选择需求材料" : "Choose requirement material"}
              >
                <SelectValue>
                  <span
                    className="block min-w-0 truncate text-left"
                    title={current && materialLabel(current)}
                  >
                    {current
                      ? materialLabel(current)
                      : awaitingRequirements
                        ? zh
                          ? "等待生成需求材料"
                          : "Waiting for materials"
                        : zh
                          ? "暂无材料"
                          : "No materials"}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {!materials.length && (
                  <SelectItem value="none" disabled>
                    {awaitingRequirements
                      ? zh
                        ? "等待生成需求材料"
                        : "Waiting for materials"
                      : zh
                        ? "暂无材料"
                        : "No materials"}
                  </SelectItem>
                )}
                {materials.map((item) => (
                  <SelectItem key={item.path} value={item.path}>
                    {materialLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {headerAction}
          </div>
          {historyControls && <div className="px-3 py-2">{historyControls}</div>}
        </>
      ) : (
        <div
          className="shrink-0 overflow-y-auto pt-4 pb-3 [scrollbar-gutter:stable_both-edges]"
          style={{ scrollbarWidth: "thin" }}
        >
          <div className={`mx-auto min-w-0 space-y-3 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
            {historyControls}
            {(proposalSolutionView || (historical && (solutionMaterial || dependencyMaterial))) && (
              <nav
                aria-label="方案材料定位"
                className="flex gap-3 border-b border-border/50"
                data-testid="proposal-material-navigation"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className={materialTabClassName}
                  disabled={!solutionMaterial}
                  aria-pressed={displayedPath === solutionMaterial?.path}
                  onClick={() => {
                    setPath(solutionMaterial!.path);
                  }}
                >
                  技术方案
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={materialTabClassName}
                  disabled={!dependencyMaterial}
                  aria-pressed={displayedPath === dependencyMaterial?.path}
                  onClick={() => {
                    setPath(dependencyMaterial!.path);
                  }}
                >
                  SR 依赖
                </Button>
              </nav>
            )}
            {materials.length > 1 && (
              <Select
                value={displayedPath}
                onValueChange={(value) => {
                  setPath(value);
                }}
              >
                <SelectTrigger
                  variant="ghost"
                  className="max-w-full gap-2 px-1 text-ui-sm text-foreground-subtle"
                  data-testid="material-menu"
                  aria-label={zh ? "文档目录" : "Document directory"}
                  title={current && materialLabel(current)}
                >
                  <ListTree className="size-3.5 shrink-0" aria-hidden="true" />
                  <SelectValue>{zh ? "文档目录" : "Document directory"}</SelectValue>
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {materialGroups.map((section) => (
                    <SelectGroup key={section.id}>
                      <SelectLabel className="max-w-full whitespace-normal break-words">
                        {section.label}
                      </SelectLabel>
                      {section.items.map((item) => (
                        <SelectItem key={item.path} value={item.path}>
                          {requirementMaterialName(item.path) ?? MATERIAL_KIND_LABELS[item.kind]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      )}
      <div
        key={`${historyIndex ?? "current"}:${displayedPath}`}
        className="min-h-0 flex-1 overflow-auto py-4 [scrollbar-gutter:stable_both-edges]"
        style={{ scrollbarWidth: "thin" }}
        data-testid="material"
        data-material-path={displayedPath}
        data-material-valid={current?.valid}
      >
        <div className={`mx-auto min-w-0 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
          {(displayedPath || historical) && (
            <Collapsible className="mb-4">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="group/material-path gap-1 px-0 text-ui-sm text-foreground-subtle focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/material-path:rotate-90" />
                  文件路径与技术信息
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {displayedPath && (
                  <p
                    className="pt-2 whitespace-pre-wrap break-all font-mono text-ui-sm text-foreground-subtle select-text"
                    data-testid="material-full-path"
                  >
                    {displayedPath}
                  </p>
                )}
                {historical && (
                  <p className="pt-2 break-all font-mono text-ui-sm text-foreground-subtle select-text">
                    历史版本标识：{historical.version}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
          {materialIssues.length > 0 && (
            <div className="mb-4 space-y-1 text-ui-sm text-destructive" role="alert">
              <p className="font-medium">材料校验失败</p>
              <ul className="space-y-1">
                {materialIssues.map(({ path: issuePath, reason }, index) => (
                  <li key={index} className="break-words">
                    <span className="font-mono">{issuePath}</span>：{reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {current?.valid === false &&
            !viewingHistory &&
            !materialIssues.some((issue) => issue.path === displayedPath) && (
              <p role="alert" className="mb-4 text-ui-sm text-destructive">
                当前材料已失效或过期，不能作为本轮批准依据；现有正文只读保留。
              </p>
            )}
          {feedback && (
            <p role="status" className="mb-4 text-ui-sm text-foreground-subtle">
              {feedback}
            </p>
          )}
          {error ? (
            <div className="space-y-3">
              <p role="alert" className="text-ui-base text-destructive">
                {error}
              </p>
              {readRequest && (
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="material-retry"
                  onClick={async () => {
                    const attempt: MaterialReadFeedback = { request: readRequest };
                    setReadFeedback(attempt);
                    const recovered = await aireq.retryMaterial(readRequest);
                    setReadFeedback((active) =>
                      active === attempt
                        ? {
                            ...attempt,
                            message: recovered
                              ? "材料已重新读取。"
                              : "仍无法读取；重读不会生成材料或推进阶段，请在当前需求对话中补充。",
                          }
                        : active,
                    );
                  }}
                >
                  重新读取材料
                </Button>
              )}
            </div>
          ) : !selection.irId ? (
            <p className="text-ui-base text-foreground-subtle">
              从提案表选择需求后，在此查看只读材料。
            </p>
          ) : awaitingRequirements ? (
            <section className="space-y-3">
              <h2 className="text-ui-base font-medium">继续讨论，完善需求</h2>
              <p role="status" className="text-ui-sm leading-6 text-foreground-subtle">
                需求材料尚未生成。请在对话中说明目标、使用场景和期望结果，按追问补充；材料生成后将在此显示。
              </p>
            </section>
          ) : !current ? (
            <p role="status" className="text-ui-base text-foreground-subtle">
              {viewingHistory
                ? historical
                  ? "此历史快照没有可读材料。"
                  : "所选历史快照未能读取。"
                : "所选对象的材料清单读取失败，请重新读取。只展示当前 IR／SR 的需求与方案材料。"}
            </p>
          ) : !current.content?.trim() ? (
            <p role="status" className="text-ui-sm text-foreground-subtle">
              材料没有正文。
            </p>
          ) : (
            <>
              {current === dependencyMaterial ? (
                <AIReqSrDependencyGraph
                  material={current}
                  rows={materialRows}
                  proposalRound={proposalRound}
                />
              ) : (
                <article className="w-full min-w-0" data-testid="material-document">
                  <AIReqMarkdownDocument
                    className="h-auto min-w-0 break-words"
                    theme={theme}
                    codePreviewSettings={codePreviewSettings}
                  >
                    {current.content}
                  </AIReqMarkdownDocument>
                </article>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
