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
import { AIReqPlanningSummary } from "../tracking/RequirementPlanning.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { AIReqSrDependencyGraph } from "./AIReqSrDependencyGraph.js";
import {
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
  const [showPlanning, setShowPlanning] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number>();
  const viewingHistory = historyIndex !== undefined;
  const group = [...(view?.groups ?? []), ...(view?.drafts ?? [])].find(
    (item) =>
      item.id === selection.irId &&
      item.projectId === selection.projectId &&
      item.releaseId === releaseId,
  );
  const planningRows = viewingHistory
    ? []
    : (view?.srs.filter((item) => item.irId === group?.id && item.projectId === group?.projectId) ??
      []);
  const proposalSolutionView =
    !viewingHistory &&
    group &&
    view?.drafts.includes(group) &&
    proposalViewedIndex(group, selection) >= 2;
  const planningOpen = showPlanning && proposalSolutionView;
  const {
    historical,
    materials,
    rows: materialRows,
    proposalRound,
    design,
    selected,
    material: current,
  } = readMaterialSelection(group, view?.materials ?? [], planningRows, {
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
  const hasHistoryChoices = Boolean(group?.materialHistory?.length);
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
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-2">
          <span className="shrink-0 text-ui-base">{zh ? "需求材料" : "Requirement materials"}</span>
          <Select
            value={planningOpen ? "planning" : displayedPath ? `file:${displayedPath}` : "none"}
            onValueChange={(value) => {
              setShowPlanning(value === "planning");
              if (value.startsWith("file:")) setPath(value.slice(5));
            }}
          >
            <SelectTrigger
              className={materialTabClassName}
              data-testid="material-menu"
              aria-label={zh ? "选择需求材料" : "Choose requirement material"}
            >
              <SelectValue>
                <span
                  className="block min-w-0 truncate text-left"
                  title={
                    planningOpen
                      ? zh
                        ? "工期预估"
                        : "Schedule estimate"
                      : current
                        ? materialLabel(current)
                        : undefined
                  }
                >
                  {planningOpen
                    ? zh
                      ? "工期预估"
                      : "Schedule estimate"
                    : current
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
                <SelectItem key={item.path} value={`file:${item.path}`}>
                  {materialLabel(item)}
                </SelectItem>
              ))}
              {proposalSolutionView && group && (
                <SelectItem value="planning">{zh ? "工期预估" : "Schedule estimate"}</SelectItem>
              )}
            </SelectContent>
          </Select>
          {headerAction}
        </div>
      ) : (
        <div
          className="shrink-0 overflow-y-auto pt-4 pb-3 [scrollbar-gutter:stable_both-edges]"
          style={{ scrollbarWidth: "thin" }}
        >
          <div className={`mx-auto min-w-0 space-y-3 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
            {group && hasHistoryChoices && (
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Select
                  value={historyIndex === undefined ? "current" : String(historyIndex)}
                  onValueChange={(id) => {
                    setHistoryIndex(id === "current" ? undefined : Number(id));
                    setPath(undefined);
                    setShowPlanning(false);
                  }}
                >
                  <SelectTrigger
                    variant="ghost"
                    className="ml-auto max-w-full min-w-0 text-ui-sm text-foreground-subtle"
                    aria-label="选择材料历史版本"
                  >
                    <SelectValue>
                      {viewingHistory
                        ? zh
                          ? "历史只读"
                          : "Read-only history"
                        : zh
                          ? "版本历史"
                          : "Version history"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">当前材料</SelectItem>
                    {/* 历史只追加；相同正文也可以属于不同快照，按该对象的记录选择。 */}
                    {group.materialHistory?.map((item, index) => (
                      <SelectItem key={index} value={String(index)}>
                        历史只读 · {item.reason} ·{" "}
                        {new Date(item.changedAt).toLocaleString("zh-CN")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* 完整版本标识可能是长快照；阅读区保留原因，技术标识收进已有折叠区。 */}
                {historical && (
                  <p className="text-ui-sm text-foreground-subtle">
                    历史只读 · 失效原因：{historical.reason}
                  </p>
                )}
              </div>
            )}
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
                  aria-pressed={!planningOpen && displayedPath === solutionMaterial?.path}
                  onClick={() => {
                    setShowPlanning(false);
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
                  aria-pressed={!planningOpen && displayedPath === dependencyMaterial?.path}
                  onClick={() => {
                    setShowPlanning(false);
                    setPath(dependencyMaterial!.path);
                  }}
                >
                  SR 依赖
                </Button>
                {proposalSolutionView && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={materialTabClassName}
                    aria-pressed={planningOpen}
                    onClick={() => setShowPlanning(true)}
                  >
                    工期预估
                  </Button>
                )}
              </nav>
            )}
            {materials.length > 1 && (
              <Select
                value={planningOpen ? "" : displayedPath}
                onValueChange={(value) => {
                  setShowPlanning(false);
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
        key={`${historyIndex ?? "current"}:${planningOpen ? "planning" : displayedPath}`}
        className="min-h-0 flex-1 overflow-auto py-4 [scrollbar-gutter:stable_both-edges]"
        style={{ scrollbarWidth: "thin" }}
        data-testid="material"
        data-material-path={planningOpen ? undefined : displayedPath}
        data-material-valid={planningOpen ? undefined : current?.valid}
      >
        <div className={`mx-auto min-w-0 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
          {!planningOpen && (displayedPath || historical) && (
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
          {!planningOpen && materialIssues.length > 0 && (
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
          {!planningOpen &&
            current?.valid === false &&
            !viewingHistory &&
            !materialIssues.some((issue) => issue.path === displayedPath) && (
              <p role="alert" className="mb-4 text-ui-sm text-destructive">
                当前材料已失效或过期，不能作为本轮批准依据；现有正文只读保留。
              </p>
            )}
          {!planningOpen && feedback && (
            <p role="status" className="mb-4 text-ui-sm text-foreground-subtle">
              {feedback}
            </p>
          )}
          {planningOpen && group ? (
            <AIReqPlanningSummary group={group} rows={planningRows} />
          ) : error ? (
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
