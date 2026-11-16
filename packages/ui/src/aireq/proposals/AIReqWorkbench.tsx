import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import {
  MATERIAL_KIND_LABELS,
  requirementMaterialName,
  type AIReqMaterialView,
} from "../contract.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqPlanningSummary } from "../tracking/RequirementPlanning.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { AIReqSrDependencyGraph } from "./AIReqSrDependencyGraph.js";
import { AIReqPhaseHeader, AIReqDocumentPhaseActions } from "./AIReqPhaseHeader.js";
import { AIReqReviewNavigation } from "./AIReqReviewNavigation.js";
import { AIReqProposalFeedback } from "./AIReqProposalFeedback.js";
export function AIReqStageHeader() {
  return (
    <>
      <AIReqPhaseHeader />
      <AIReqReviewNavigation />
      <AIReqProposalFeedback />
    </>
  );
}
export function AIReqMaterialsPane() {
  const aireq = useAIReq()!;
  const theme = useZCodeStore((state) => state.theme);
  const codePreviewSettings = useZCodeStore((state) => state.codePreviewSettings);
  const { selection, view } = aireq;
  const [path, setPath] = useState("");
  const [readFeedback, setReadFeedback] = useState("");
  const [showPlanning, setShowPlanning] = useState(false);
  const [historySelection, setHistorySelection] = useState({
    projectId: selection.projectId, irId: selection.irId, version: "",
  });
  // 历史查看是当前 IR 的临时输入，不能因另一 IR 恰有同名版本而串用。
  const historyVersion = historySelection.projectId === selection.projectId &&
    historySelection.irId === selection.irId ? historySelection.version : "";
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
  const historical = group?.materialHistory?.find((item) => item.version === historyVersion);
  // 同一 IR 包内切换各 SR；历史快照只读，永不回写当前材料。
  const materials = (historical?.materials ?? view?.materials ?? []).filter((item) =>
    item.projectId === selection.projectId && item.irId === selection.irId &&
    (!selection.srId || item.srId === selection.srId),
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
    setReadFeedback("");
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
    const label = requirementMaterialName(item.path, selection.srId ? view?.srs : undefined) ??
      MATERIAL_KIND_LABELS[item.kind];
    // IR 汇总列出多个 SR 的同类文件，必须同时给出所属 SR 和材料名。
    const materialSr = view?.srs.find((sr) => sr.id === item.srId &&
      sr.irId === item.irId && sr.projectId === item.projectId);
    return !selection.srId && item.srId
      ? `${item.srId}${materialSr ? ` · ${materialSr.title}` : ""} · ${label}`
      : label;
  };
  const solutionMaterial = materials.find((item) => item.path.endsWith("/design.md"));
  const dependencyMaterial = materials.find((item) => item.path.endsWith("/sr-dependencies.json"));
  const planningRows =
    view?.srs.filter((item) => item.irId === group?.id && item.projectId === group?.projectId) ??
    [];
  const listed = materials.find((item) => item.path === path);
  const material = listed;
  const error = listed?.error;
  const current = material ?? listed;
  const awaitingRequirements =
    !path &&
    !selection.srId &&
    group?.status === "draft" &&
    !group.snapshot && !group.files.length && !materials.length;
  return (
    <aside
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background"
      data-testid="materials-pane"
    >
      <div className="shrink-0 overflow-y-auto px-2 pt-4 pb-3 [scrollbar-gutter:stable_both-edges]" style={{ scrollbarWidth: "thin" }}>
        <div className="mx-auto w-full min-w-0 max-w-4xl space-y-2">
          {group && <div className="flex flex-wrap gap-2">
            <Select value={selection.srId ?? "ir"} onValueChange={(id) => aireq.select({
              ...selection, srId: id === "ir" ? undefined : id, materialPath: undefined,
            })}>
              <SelectTrigger aria-label="选择 IR 或独立 SR 材料"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ir">IR 共享及全部材料</SelectItem>{view?.srs.filter((item) => item.irId === group.id && item.projectId === group.projectId).map((item) => <SelectItem key={item.id} value={item.id}>{item.id} · {item.title}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={historyVersion || "current"} onValueChange={(id) => { setHistorySelection({ projectId: selection.projectId, irId: selection.irId, version: id === "current" ? "" : id }); setPath(""); }}>
              <SelectTrigger aria-label="选择材料历史版本"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="current">当前材料</SelectItem>{group.materialHistory?.map((item, index) => <SelectItem key={`${item.version}:${index}`} value={item.version}>历史只读 · {item.reason} · {new Date(item.changedAt).toLocaleString("zh-CN")}</SelectItem>)}</SelectContent>
            </Select>
            {/* 完整版本标识可能是长快照；阅读区保留原因，技术标识收进已有折叠区。 */}
            {historical && <p className="text-ui-sm text-foreground-subtle">历史只读 · 失效原因：{historical.reason}</p>}
          </div>}
          {proposalSolutionView && group && (
            <nav
              aria-label="方案材料定位"
              className="flex gap-1"
              data-testid="proposal-material-navigation"
            >
              <Button
                size="sm"
                variant={!showPlanning && path === solutionMaterial?.path ? "secondary" : "ghost"}
                className="min-w-0 flex-1"
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
                variant={!showPlanning && path === dependencyMaterial?.path ? "secondary" : "ghost"}
                className="min-w-0 flex-1"
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
                variant={showPlanning ? "secondary" : "ghost"}
                className="min-w-0 flex-1"
                aria-pressed={showPlanning}
                onClick={() => setShowPlanning(true)}
              >
                工期预估
              </Button>
            </nav>
          )}
          {!showPlanning && (
            <Select
              value={path || "none"}
              onValueChange={(value) => {
                setShowPlanning(false);
                setPath(value === "none" ? "" : value);
              }}
            >
              <SelectTrigger
                className="h-auto min-h-8 w-full min-w-0 py-1.5"
                data-testid="material-menu"
                aria-label="选择材料类型"
              >
                <SelectValue>
                  <span className="block min-w-0 whitespace-normal break-all text-left text-ui-sm">
                    {current
                      ? materialLabel(current)
                      : awaitingRequirements
                        ? "等待生成需求材料"
                        : "选择材料类型"}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {!materials.length && (
                  <SelectItem value="none">
                    {selection.irId
                      ? awaitingRequirements
                        ? "等待生成需求材料"
                        : selection.srId
                          ? "当前 SR 材料清单不可用"
                          : "IR 需求材料清单不可用"
                      : "选择需求后查看材料"}
                  </SelectItem>
                )}
                {materials.map((item) => (
                  <SelectItem key={item.path} value={item.path}>
                    {materialLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div
        key={`${selection.projectId}:${selection.irId}:${showPlanning ? "planning" : path}`}
        className="min-h-0 flex-1 overflow-auto px-2 py-4 [scrollbar-gutter:stable_both-edges]"
        style={{ scrollbarWidth: "thin" }}
        data-testid="material"
        data-material-path={showPlanning ? undefined : path}
        data-material-valid={showPlanning ? undefined : current?.valid}
      >
        <div className="mx-auto w-full min-w-0 max-w-4xl">
          {!showPlanning && (path || historical) && (
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
                {path && <p
                  className="pt-2 whitespace-pre-wrap break-all font-mono text-ui-sm text-foreground-subtle select-text"
                  data-testid="material-full-path"
                >
                  {displayPath(path)}
                </p>}
                {historical && <p className="pt-2 break-all font-mono text-ui-sm text-foreground-subtle select-text">历史版本标识：{historical.version}</p>}
              </CollapsibleContent>
            </Collapsible>
          )}
          {showPlanning && proposalSolutionView && group ? (
            <AIReqPlanningSummary group={group} rows={planningRows} />
          ) : error || current?.error ? (
            <div className="space-y-3">
              <p role="alert" className="text-ui-base text-destructive">
                {error ?? current?.error}
              </p>
              <Button
                size="sm"
                variant="outline"
                data-testid="material-retry"
                onClick={async () => {
                  const recovered = await aireq.retryMaterial(path);
                  setReadFeedback(
                    recovered
                      ? "材料已重新读取。"
                      : "仍无法读取；重读不会生成材料或推进阶段，请在当前需求对话中补充。",
                  );
                }}
              >
                重新读取材料
              </Button>
              {readFeedback && (
                <p role="status" className="text-ui-sm text-foreground-subtle">
                  {readFeedback}
                </p>
              )}
            </div>
          ) : !selection.irId ? (
            <p className="text-ui-base text-foreground-subtle">从提案表选择需求后，在此查看只读材料。</p>
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
            <div className="space-y-2"><p role="alert" className="text-ui-sm text-destructive">当前材料已失效或过期，不能作为本轮批准依据；以下内容只读保留。</p><AIReqMarkdownDocument>{current.content ?? "无历史正文。"}</AIReqMarkdownDocument></div>
          ) : !current.content?.trim() ? (
            <p role="status" className="text-ui-sm text-foreground-subtle">
              材料没有正文。
            </p>
          ) : (
            <>
              {path.endsWith("/sr-dependencies.json") && group && current ? (
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
                <article
                  className="w-full min-w-0"
                  data-testid="material-document"
                >
                  <AIReqMarkdownDocument
                    className="h-auto min-w-0 break-words"
                    theme={theme}
                    codePreviewSettings={codePreviewSettings}
                  >
                    {material?.content ?? "材料没有正文。"}
                  </AIReqMarkdownDocument>
                </article>
              )}
            </>
          )}
        </div>
      </div>
      {!historical && (proposal || !group) && <AIReqDocumentPhaseActions />}
    </aside>
  );
}
