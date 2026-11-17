import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "../shell/pageLayout.js";
import { useEffect, useState, type ReactNode } from "react";
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
  type AIReqMaterialView,
} from "../contract.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqPlanningSummary } from "../tracking/RequirementPlanning.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { AIReqSrDependencyGraph } from "./AIReqSrDependencyGraph.js";
import { AIReqPhaseHeader } from "./AIReqPhaseHeader.js";
import { AIReqReviewNavigation } from "./AIReqReviewNavigation.js";
import { AIReqProposalFeedback } from "./AIReqProposalFeedback.js";
export function AIReqStageHeader({
  reviewDetailsOpen,
  onReviewDetailsChange,
}: {
  reviewDetailsOpen: boolean;
  onReviewDetailsChange(open: boolean): void;
}) {
  return (
    <>
      <AIReqPhaseHeader />
      <AIReqReviewNavigation
        detailsOpen={reviewDetailsOpen}
        onDetailsChange={onReviewDetailsChange}
      />
      <AIReqProposalFeedback />
    </>
  );
}
export function AIReqMaterialsPane({ headerAction }: { headerAction?: ReactNode }) {
  const aireq = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const compact = headerAction != null;
  const theme = useZCodeStore((state) => state.theme);
  const codePreviewSettings = useZCodeStore((state) => state.codePreviewSettings);
  const { selection, view } = aireq;
  const [path, setPath] = useState("");
  const [readFeedback, setReadFeedback] = useState<{ scope: string; message: string }>();
  const [showPlanning, setShowPlanning] = useState(false);
  const [historySelection, setHistorySelection] = useState({
    projectId: selection.projectId,
    irId: selection.irId,
    version: "",
  });
  // 历史查看是当前 IR 的临时输入，不能因另一 IR 恰有同名版本而串用。
  const historyVersion =
    historySelection.projectId === selection.projectId && historySelection.irId === selection.irId
      ? historySelection.version
      : "";
  useEffect(() => {
    setHistorySelection({ projectId: selection.projectId, irId: selection.irId, version: "" });
  }, [selection.projectId, selection.irId]);
  const sr = view?.srs.find(
    (item) =>
      item.id === selection.srId &&
      item.irId === selection.irId &&
      item.projectId === selection.projectId,
  );
  const group = [...(view?.groups ?? []), ...(view?.drafts ?? [])].find(
    (item) => item.id === selection.irId && item.projectId === selection.projectId,
  );

  const proposal = view?.drafts.some((item) => item.id === group?.id);
  const historical = compact
    ? undefined
    : group?.materialHistory?.find((item) => item.version === historyVersion);
  // 同一 IR 包内切换各 SR；历史快照只读，永不回写当前材料。
  const materials = (historical?.materials ?? view?.materials ?? []).filter(
    (item) => item.projectId === selection.projectId && item.irId === selection.irId,
  );
  const proposalSolutionView =
    proposal && (selection.discussionPhase ?? group?.proposalStage) === "solution";
  const preferred =
    materials.find((item) => item.path === selection.materialPath) ??
    (selection.srId
      ? materials.find((item) => item.path === sr?.documentPath)
      : proposalSolutionView
        ? materials.find((item) => item.path.endsWith("/design.md"))
        : materials.find((item) => item.path === group?.documentPath)) ??
    materials[0];
  useEffect(() => {
    setPath(preferred?.path ?? "");
    setReadFeedback(undefined);
    setShowPlanning(false);
    // 版本即使只改了非首选文件，也须恢复路径，不能停留在切换时清空的状态。
  }, [
    selection.projectId,
    selection.irId,
    selection.srId,
    selection.materialPath,
    historyVersion,
    proposalSolutionView,
    preferred?.path,
    preferred?.sha256,
  ]);
  const displayPath = (filePath: string) => filePath;
  const materialLabel = (item: AIReqMaterialView) => {
    const label = requirementMaterialName(item.path) ?? MATERIAL_KIND_LABELS[item.kind];
    // IR 汇总列出多个 SR 的同类文件，必须同时给出所属 SR 和材料名。
    const materialSr = view?.srs.find(
      (sr) => sr.id === item.srId && sr.irId === item.irId && sr.projectId === item.projectId,
    );
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
  const selectedMaterialSrId = materials.find((item) => item.path === path)?.srId ?? selection.srId;
  const solutionMaterial =
    materials.find(
      (item) => item.srId === selectedMaterialSrId && item.path.endsWith("/design.md"),
    ) ?? materials.find((item) => item.path.endsWith("/design.md"));
  const dependencyMaterial = materials.find((item) => item.path.endsWith("/sr-dependencies.json"));
  const planningRows =
    view?.srs.filter((item) => item.irId === group?.id && item.projectId === group?.projectId) ??
    [];
  const listed = materials.find((item) => item.path === path);
  // 投影更新后旧路径可能已消失；所有展示统一消费同一个首选材料，而不是只替换标题。
  const current = listed ?? preferred;
  const displayedPath = current?.path ?? "";
  const materialGroups = [
    undefined,
    ...new Set(materials.map((item) => item.srId).filter((id): id is string => Boolean(id))),
  ]
    .map((srId) => {
      const owner = planningRows.find((item) => item.id === srId);
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
  const feedbackScope = `${selection.projectId}:${selection.irId}:${historyVersion}:${displayedPath}`;
  const awaitingRequirements =
    !path &&
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
            value={showPlanning ? "planning" : displayedPath ? `file:${displayedPath}` : "none"}
            onValueChange={(value) => {
              setReadFeedback(undefined);
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
                    showPlanning
                      ? zh
                        ? "工期预估"
                        : "Schedule estimate"
                      : current
                        ? materialLabel(current)
                        : undefined
                  }
                >
                  {showPlanning
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
                {hasHistoryChoices && (
                  <Select
                    value={historyVersion || "current"}
                    onValueChange={(id) => {
                      setHistorySelection({
                        projectId: selection.projectId,
                        irId: selection.irId,
                        version: id === "current" ? "" : id,
                      });
                      setPath("");
                    }}
                  >
                    <SelectTrigger
                      variant="ghost"
                      className="ml-auto max-w-full min-w-0 text-ui-sm text-foreground-subtle"
                      aria-label="选择材料历史版本"
                    >
                      <SelectValue>
                        {historical
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
                      {group.materialHistory?.map((item, index) => (
                        <SelectItem key={`${item.version}:${index}`} value={item.version}>
                          历史只读 · {item.reason} ·{" "}
                          {new Date(item.changedAt).toLocaleString("zh-CN")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {/* 完整版本标识可能是长快照；阅读区保留原因，技术标识收进已有折叠区。 */}
                {historical && (
                  <p className="text-ui-sm text-foreground-subtle">
                    历史只读 · 失效原因：{historical.reason}
                  </p>
                )}
              </div>
            )}
            {proposalSolutionView && group && (
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
                  aria-pressed={!showPlanning && path === solutionMaterial?.path}
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
                  aria-pressed={!showPlanning && path === dependencyMaterial?.path}
                  onClick={() => {
                    setShowPlanning(false);
                    setPath(dependencyMaterial!.path);
                  }}
                >
                  SR 依赖
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={materialTabClassName}
                  aria-pressed={showPlanning}
                  onClick={() => setShowPlanning(true)}
                >
                  工期预估
                </Button>
              </nav>
            )}
            {!showPlanning && materials.length > 1 && (
              <Select
                value={displayedPath || "none"}
                onValueChange={(value) => {
                  setShowPlanning(false);
                  setPath(value === "none" ? "" : value);
                }}
              >
                <SelectTrigger
                  variant="ghost"
                  className="max-w-full gap-2 px-1 text-ui-sm text-foreground-subtle"
                  data-testid="material-menu"
                  aria-label={zh ? "文档目录" : "Document directory"}
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
        key={`${selection.projectId}:${selection.irId}:${historyVersion}:${showPlanning ? "planning" : displayedPath}`}
        className="min-h-0 flex-1 overflow-auto py-4 [scrollbar-gutter:stable_both-edges]"
        style={{ scrollbarWidth: "thin" }}
        data-testid="material"
        data-material-path={showPlanning ? undefined : displayedPath}
        data-material-valid={showPlanning ? undefined : current?.valid}
      >
        <div className={`mx-auto min-w-0 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
          {!showPlanning && (displayedPath || historical) && (
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
                    {displayPath(displayedPath)}
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
          {showPlanning && proposalSolutionView && group ? (
            <AIReqPlanningSummary group={group} rows={planningRows} />
          ) : error ? (
            <div className="space-y-3">
              <p role="alert" className="text-ui-base text-destructive">
                {error}
              </p>
              {/* 历史快照无独立恢复命令；调用 retryMaterial 只会改当前材料，不能冒充历史恢复。 */}
              {!historical && (
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="material-retry"
                  onClick={async () => {
                    const recovered = await aireq.retryMaterial(displayedPath);
                    // 迟到重读的反馈只属于发起时的材料，不能串到后来选择的文件或历史版本。
                    setReadFeedback({
                      scope: feedbackScope,
                      message: recovered
                        ? "材料已重新读取。"
                        : "仍无法读取；重读不会生成材料或推进阶段，请在当前需求对话中补充。",
                    });
                  }}
                >
                  重新读取材料
                </Button>
              )}
              {readFeedback?.scope === feedbackScope && (
                <p role="status" className="text-ui-sm text-foreground-subtle">
                  {readFeedback.message}
                </p>
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
            <p
              role={path ? "alert" : "status"}
              className={`text-ui-base ${path ? "text-destructive" : "text-foreground-subtle"}`}
            >
              {path
                ? "所选材料不在当前材料清单中。"
                : "所选对象的材料清单读取失败，请重新读取。只展示当前 IR／SR 的需求与方案材料。"}
            </p>
          ) : current.valid === false && !historical ? (
            <div className="space-y-2">
              <p role="alert" className="text-ui-sm text-destructive">
                当前材料已失效或过期，不能作为本轮批准依据；以下内容只读保留。
              </p>
              <AIReqMarkdownDocument>{current.content ?? "无历史正文。"}</AIReqMarkdownDocument>
            </div>
          ) : !current.content?.trim() ? (
            <p role="status" className="text-ui-sm text-foreground-subtle">
              材料没有正文。
            </p>
          ) : (
            <>
              {displayedPath.endsWith("/sr-dependencies.json") && group && current ? (
                <AIReqSrDependencyGraph
                  group={group}
                  material={current}
                  rows={
                    view?.srs.filter(
                      (item) => item.irId === group.id && item.projectId === group.projectId,
                    ) ?? []
                  }
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
