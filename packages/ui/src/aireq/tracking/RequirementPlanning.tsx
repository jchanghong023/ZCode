import { formatUserFacingError } from "@/lib/errorMessage.js";
// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useId, useRef, useState } from "react";
import { AIReqMarkdownDocument } from "../proposals/AIReqMarkdownDocument.js";
import { buildMarkdownTableText } from "@/components/ai-elements/markdown-table.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { Badge } from "@/components/ui/badge.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import { getEmployeeId } from "../identity.js";
import { hasCurrentProposalSolution } from "../contract.js";
import { irPlanning, planningDate, planningWarnings, srDependencies } from "../contract.js";
import { parallelSrIds, readSrDependencies } from "../contract.js";
import type {
  AIReqRequirementGroup,
  AIReqSrPlanningInput,
  AIReqSystemRequirement,
  AIReqWorkflowView,
} from "../contract.js";

export function AIReqDependencies({
  sr,
  view,
  compact = false,
}: {
  sr: AIReqSystemRequirement;
  view: AIReqWorkflowView;
  compact?: boolean;
}) {
  const dependencies = srDependencies(view, sr);
  const group = [...view.groups, ...view.drafts].find(
    (item) => item.id === sr.irId && item.projectId === sr.projectId,
  );
  const result = group && readSrDependencies(group);
  if (!result || result.issue)
    return (
      <span className="text-ui-sm text-foreground-subtle">{result?.issue ?? "依赖材料不可用"}</span>
    );
  if (compact && dependencies.length)
    return (
      <ul className="space-y-1 text-ui-sm text-foreground">
        {dependencies.map((id) => {
          const title =
            view.srs.find((item) => item.projectId === sr.projectId && item.id === id)?.title ?? id;
          const reason = result.document?.srs
            .find((row) => row.srId === sr.id)
            ?.prerequisites.find((item) => item.srId === id)?.reason;
          return (
            <li key={id} className="min-w-0">
              <ControlHintTooltip title={`${title}（${id}）${reason ? `：${reason}` : ""}`}>
                <span
                  tabIndex={0}
                  className="block truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {title}
                </span>
              </ControlHintTooltip>
            </li>
          );
        })}
      </ul>
    );
  return dependencies.length ? (
    <ul className="space-y-1 text-ui-sm text-foreground">
      {dependencies.map((id) => (
        <li key={id} className="break-words" title={id}>
          {view.srs.find((item) => item.projectId === sr.projectId && item.id === id)?.title ?? id}
          <span className="block text-foreground-subtle">
            {
              result.document?.srs
                .find((row) => row.srId === sr.id)
                ?.prerequisites.find((item) => item.srId === id)?.reason
            }
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <span className="text-ui-sm text-foreground-subtle">无前置依赖</span>
  );
}

export function AIReqEditPlanning({
  group,
  sr,
  compact = false,
  onDialogOpenChange,
}: {
  group: AIReqRequirementGroup;
  sr: AIReqSystemRequirement;
  compact?: boolean;
  onDialogOpenChange?: (open: boolean) => void;
}) {
  const source = useAIReqDataSource();
  const aireq = useAIReq()!;
  const id = useId();
  const [open, setDialogOpen] = useState(false);
  const setOpen = (value: boolean) => {
    setDialogOpen(value);
    onDialogOpenChange?.(value);
  };
  const [input, setInput] = useState<AIReqSrPlanningInput>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const developerInput = useRef<HTMLInputElement>(null);
  const updateDeveloper = (value: string) => {
    // 手工输入和快捷认领共用校验清理，避免上次非法工号继续阻止提交。
    developerInput.current?.setCustomValidity("");
    setError("");
    // 空字符串是服务端的显式清空指令；undefined 只表示不修改。
    setInput((current) => ({ ...current, developerEmployeeId: value.trim() }));
  };
  const proposal = aireq.view?.drafts.some(
    (item) => item.projectId === group.projectId && item.id === group.id,
  );
  // 正式新 SR 尚无 AI 排期时，也允许创建人工安排。
  const canEdit = !proposal && source.planning;
  if (!canEdit)
    return compact ? (
      <span className="text-ui-sm">{sr.developerEmployeeId ?? "待认领"}</span>
    ) : null;
  const warnings =
    aireq.view && open ? planningWarnings(aireq.view, sr, { ...sr.planning!, ...input }) : [];
  return (
    <span onClick={(event) => event.stopPropagation()}>
      <Button
        size="sm"
        variant={compact ? "ghost" : "outline"}
        className={
          compact
            ? "max-w-full justify-start text-left focus-visible:ring-2 focus-visible:ring-ring/50"
            : undefined
        }
        aria-label={`调整${sr.title}开发测试分工与计划`}
        onClick={() => {
          setInput({
            developerEmployeeId: sr.developerEmployeeId,
            testingEmployeeId: sr.testingEmployeeId,
            operationId: createUuid(),
            expectedRevision: aireq.view!.revision,
            plannedStart: sr.planning?.plannedStart,
            plannedEnd: sr.planning?.plannedEnd,
          });
          setError("");
          setOpen(true);
        }}
      >
        {compact ? (sr.developerEmployeeId ?? "分配开发／测试负责人") : "调整分工与计划"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>调整开发／测试分工与计划</DialogTitle>
            <DialogDescription>
              {sr.title} · 初始继承 IR
              联系人，可显式调整或留空待认领；负责人不是操作权限，代办留实际操作者。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              setError("");
              try {
                await source.planning!.updateSr(group.projectId, group.id, sr.id, input);
                setOpen(false);
              } catch (cause) {
                setError(formatUserFacingError(cause, "分工与计划保存失败，输入已保留，请重试。"));
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={`${id}-developer`}>开发负责人工号</Label>
              <Input
                id={`${id}-developer`}
                ref={developerInput}
                value={input.developerEmployeeId ?? ""}
                pattern="[a-z][0-9]{8}"
                title="一个小写英文字母后接 8 位数字，例如 j00808874；可留空表示未分配。"
                aria-describedby={`${id}-developer-hint`}
                onInvalid={(event) => {
                  event.currentTarget.setCustomValidity(
                    "工号格式错误：须为一个小写英文字母后接 8 位数字，例如 j00808874。",
                  );
                  setError(
                    "工号格式错误：须为一个小写英文字母后接 8 位数字，例如 j00808874；留空表示未分配。",
                  );
                }}
                onChange={(event) => updateDeveloper(event.target.value)}
                placeholder="留空表示未分配"
              />
              <p id={`${id}-developer-hint`} className="text-ui-sm text-foreground-subtle">
                一个小写英文字母后接 8 位数字，例如 j00808874；可留空表示未分配。
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => updateDeveloper(getEmployeeId())}
              >
                由我负责开发
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-testing`}>测试负责人工号</Label>
              <Input
                id={`${id}-testing`}
                value={input.testingEmployeeId ?? ""}
                pattern="[a-z][0-9]{8}"
                title="一个小写字母后接 8 位数字；可留空待认领。"
                placeholder="留空表示待认领"
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    testingEmployeeId: event.target.value.trim(),
                  }))
                }
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setInput((current) => ({ ...current, testingEmployeeId: getEmployeeId() }))
                }
              >
                由我负责测试
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${id}-start`}>计划开始时间</Label>
                <Input
                  id={`${id}-start`}
                  type="datetime-local"
                  value={input.plannedStart ?? ""}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      plannedStart: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-end`}>计划结束时间</Label>
                <Input
                  id={`${id}-end`}
                  type="datetime-local"
                  value={input.plannedEnd ?? ""}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      plannedEnd: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <p className="text-ui-sm text-foreground-subtle">
              项目时区：Asia/Shanghai。开始和结束同时留空可取消排期；不单独维护工时。
            </p>
            {sr.planning?.suggestion && (
              <p className="text-ui-sm leading-5 text-foreground-subtle">
                原 AI 建议：{planningDate(sr.planning.suggestion.plannedStart)} →{" "}
                {planningDate(sr.planning.suggestion.plannedEnd)}
                。人工调整后保留建议，后台不得直接覆盖。
              </p>
            )}
            {warnings.length > 0 && (
              <div role="status" className="rounded-md border border-border p-3 text-ui-sm">
                <p className="mb-1 font-medium">排期提醒</p>
                <ul className="list-disc space-y-1 pl-4">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <p className="mt-2 text-ui-sm text-foreground-subtle">
                  可保存人工安排；提醒持续保留，不自动移动其他 SR。
                </p>
              </div>
            )}
            {error && (
              <p role="alert" className="text-ui-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "保存中…" : "保存开发安排"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </span>
  );
}

export function AIReqPlanningSummary({
  group,
  rows,
  editable = false,
}: {
  group: AIReqRequirementGroup;
  rows: AIReqSystemRequirement[];
  editable?: boolean;
}) {
  const aireq = useAIReq()!;
  const view = aireq.view;
  const theme = useZCodeStore((state) => state.theme);
  const codePreviewSettings = useZCodeStore((state) => state.codePreviewSettings);
  if (!view) return null;
  const proposal = view.drafts.some(
    (item) => item.id === group.id && item.projectId === group.projectId,
  );
  const ready = hasCurrentProposalSolution(group);
  if (proposal) {
    // 阅读只要求当前 JSON 的依赖结构有效；缺少预估不能遮住其他 SR 的已有工期。
    const result = readSrDependencies(group, group.srDependencyFile, false);
    const table = result.document
      ? buildMarkdownTableText([
          ["SR ID", "需求", "工期（工作日）", "估算假设"],
          ...result.document.srs.map((row) => {
            const estimate = row.estimate;
            const duration =
              estimate && Number.isFinite(estimate.workingDays) && estimate.workingDays > 0
                ? String(estimate.workingDays)
                : "待预估";
            const assumptions =
              typeof estimate?.assumptions === "string" && estimate.assumptions.trim()
                ? estimate.assumptions
                : "待补充";
            return [
              row.srId,
              rows.find((sr) => sr.id === row.srId)?.title ?? row.srId,
              duration,
              assumptions,
            ];
          }),
        ])
      : "";
    return (
      <section className="min-w-0 space-y-4" data-testid="requirement-planning-summary">
        <h2 className="text-ui-base font-medium">工期预估</h2>
        {result.issue ? (
          <p role="status" className="text-ui-sm">
            {result.issue}
          </p>
        ) : (
          <AIReqMarkdownDocument
            className="min-w-0 break-words"
            theme={theme}
            codePreviewSettings={codePreviewSettings}
          >
            {table}
          </AIReqMarkdownDocument>
        )}
        <p className="text-ui-sm leading-5 text-foreground-subtle">
          预估与依赖共同读取 sr-dependencies.json；通过方案对话让 AI
          更新。缺项标为待预估／待补充，提交前须补齐。
        </p>
        <p className="text-ui-sm leading-5 text-foreground-subtle">
          工作日不代表承诺日期或实际用时，不直接相加为 IR 总工期。转正后再安排人员及起止时间。
        </p>
      </section>
    );
  }

  const summary = irPlanning(rows);
  return (
    <section className="space-y-4" data-testid="requirement-planning-summary">
      <div>
        <h2 className="text-ui-base font-medium">开发安排</h2>
        <p className="mt-1 text-ui-sm leading-5 text-foreground-subtle">
          人员与排期：数据库元数据；实现思路与依赖：仓库文档。时间为计划，不代表实际开发活动。
        </p>
      </div>
      {!ready && (
        <p role="status" className="text-ui-sm">
          当前方案尚未完成或已失效，请在方案讨论中完成本轮分析；旧排期不作为当前建议。
        </p>
      )}
      {rows.length > 1 && (
        <p className="text-ui-sm">
          IR 汇总：{planningDate(summary.plannedStart)} → {planningDate(summary.plannedEnd)}
          {summary.incomplete ? "（部分 SR 未排期）" : ""}。调整下方 SR 后自动更新。
        </p>
      )}
      <ul className="space-y-4">
        {rows.map((sr) => (
          <li key={sr.id} className="space-y-2 rounded-md border border-border p-3">
            <p className="text-ui-sm font-medium">{sr.title}</p>
            <p className="font-mono text-ui-xs text-foreground-subtle">{sr.id}</p>
            {ready && sr.solutionAnalysis && (
              <div
                className="space-y-2 border-b border-border pb-3 text-ui-sm"
                data-testid={`sr-solution-analysis-${sr.id}`}
              >
                <p className="font-medium">实现思路</p>
                <p className="leading-6">{sr.solutionAnalysis.approach}</p>
                <p className="text-foreground-subtle">
                  依赖原因：
                  {readSrDependencies(group)
                    .document?.srs.find((row) => row.srId === sr.id)
                    ?.prerequisites.map((item) => `${item.srId}：${item.reason}`)
                    .join("；") || "无前置依赖"}
                </p>
                {/* 排期判断依据是辅助说明，不能按弱元数据缩小。 */}
                <p className="text-ui-sm leading-5">
                  可并行 SR（由依赖图推导）：
                  {parallelSrIds(group, sr.id)
                    .map(
                      (id) =>
                        view.srs.find((item) => item.projectId === sr.projectId && item.id === id)
                          ?.title ?? id,
                    )
                    .join("、") || "暂无已确认可并行的独立 SR"}
                  。各自前置依赖就绪后再协调安排。
                </p>
                {sr.solutionAnalysis.uncertainties.map((issue) => (
                  <p key={issue} className="text-ui-sm leading-5 text-foreground-subtle">
                    待确认：{issue}
                  </p>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-ui-sm">
              <span>
                开发负责人：{sr.developerEmployeeId ?? "待认领"} · 测试负责人：
                {sr.testingEmployeeId ?? "待认领"}
              </span>
              <Badge variant="outline">
                {sr.planning?.source === "manual" ? "人工调整" : sr.planning ? "AI 建议" : "待分析"}
              </Badge>
            </div>
            <dl className="space-y-1 text-ui-sm">
              <div>
                <dt className="text-foreground-subtle">计划开始</dt>
                <dd>{sr.planning?.plannedStart?.replace("T", " ") ?? "未排期"}</dd>
              </div>
              <div>
                <dt className="text-foreground-subtle">计划结束</dt>
                <dd>{sr.planning?.plannedEnd?.replace("T", " ") ?? "未排期"}</dd>
              </div>
              <div>
                <dt className="text-foreground-subtle">前置 SR（仓库文档）</dt>
                <dd>
                  <AIReqDependencies sr={sr} view={view} />
                </dd>
              </div>
            </dl>
            {sr.planning && (
              <p className="text-ui-sm leading-5 text-foreground-subtle">
                {sr.planning.assumptions}
              </p>
            )}
            {sr.planning?.source === "manual" && (
              <p className="text-ui-sm text-foreground-subtle">
                人工安排：{sr.planning.updatedBy} ·{" "}
                {sr.planning.updatedAt
                  ? new Date(sr.planning.updatedAt).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                      hour12: false,
                    })
                  : "未提供修改时间"}
              </p>
            )}
            {sr.planning?.source === "manual" && sr.planning.suggestion && (
              <p className="text-ui-sm text-foreground-subtle">
                原 AI 建议：{planningDate(sr.planning.suggestion.plannedStart)} →{" "}
                {planningDate(sr.planning.suggestion.plannedEnd)}；由 {sr.planning.updatedBy} 调整。
              </p>
            )}
            {planningWarnings(view, sr).map((warning) => (
              <p key={warning} className="text-ui-sm leading-5" role="status">
                排期提醒：{warning}
              </p>
            ))}
            {editable && <AIReqEditPlanning group={group} sr={sr} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
