import type { AIReqReview, AIReqReviewAgentId } from "../contract.js";
import { useEffect, useMemo, useRef } from "react";
import { WorkflowTimeline } from "@/components/workflow-timeline/WorkflowTimeline.js";
import type {
  TimelinePill,
  TimelineStation,
  WorkflowTimelineModel,
} from "@/components/workflow-timeline/timeline-model.js";
import type { StepRunStatus } from "@/components/workflow-graph/types.js";
import { Button } from "@/components/ui/button.js";
import { WorkflowAgentFace } from "@/components/workflow-timeline/WorkflowAgentFace.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "../shell/pageLayout.js";

/** Only projects AIReq state into the native renderer; owns no workflow transitions. */
export function AIReqWorkflowTimeline({
  labels,
  phase,
  selected,
  complete,
  running,
  proposal,
  rounds,
  returned,
  canNavigate,
  entered,
  onSelect,
  review,
  reviewAgent,
  canOpenReview,
  onSelectReview,
}: {
  review?: AIReqReview;
  reviewAgent?: AIReqReviewAgentId;
  canOpenReview: boolean;
  onSelectReview(id: AIReqReviewAgentId): void;
  labels: string[];
  phase: number;
  selected: number;
  complete: boolean;
  running: boolean;
  proposal: boolean;
  sr: boolean;
  rounds: number[];
  returned: boolean;
  canNavigate: boolean;
  entered: boolean[];
  onSelect(index: number): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  // The proposal timeline has four stages; depend on their values, not caller-created arrays.
  const [businessLabel, reviewLabel, solutionLabel, deliveryLabel] = labels;
  const [businessEntered, reviewEntered, solutionEntered, deliveryEntered] = entered;
  const [businessRound, reviewRound, solutionRound, deliveryRound] = rounds;
  const model = useMemo<WorkflowTimelineModel>(() => {
    const stageLabels = [businessLabel, reviewLabel, solutionLabel, deliveryLabel];
    const stageEntered = [businessEntered, reviewEntered, solutionEntered, deliveryEntered];
    const stageRounds = [businessRound, reviewRound, solutionRound, deliveryRound];
    const agents = [["业务需求 Agent"], ["需求评审 Agent"], ["方案 Agent"], []];
    const loop = proposal && returned;
    const stations: TimelineStation[] = stageLabels.map((name, index) => {
      // A current station can be idle awaiting a person; do not fabricate a running lamp.
      const status: StepRunStatus =
        complete || index < phase ? "done" : index === phase && running ? "running" : "pending";
      const pills: TimelinePill[] = (agents[index] ?? []).map((agent) => {
        const avatarIndex = agent === "业务需求 Agent" ? 0 : agent === "需求评审 Agent" ? 1 : 2;
        return {
          key: `${index}:${agent}`,
          lane: { id: agent, name: agent, laneClass: "agent" },
          laneClass: "agent",
          runtimeName: proposal ? (index === 0 ? "需求" : index === 2 ? "方案" : "评审") : agent,
          avatarIndex,
          status,
          stepIds: [],
        };
      });
      if (proposal && index === 1 && review?.agents) {
        pills.splice(
          0,
          pills.length,
          ...review.agents
            .filter(
              (agent) => agent.id === (selected === 1 ? (reviewAgent ?? "summary") : "summary"),
            )
            .map(
              (agent): TimelinePill => ({
                key: `review:${agent.id}`,
                lane: {
                  id: `review:${agent.id}`,
                  name: `${agent.name} · ${agent.session.modelConfig?.modelName ?? "模型未配置"}`,
                  laneClass: "agent",
                },
                laneClass: "agent",
                avatarIndex: review.agents!.findIndex((item) => item.id === agent.id) + 1,
                runtimeName: agent.id === "summary" ? "综合" : `评审${agent.id.toUpperCase()}`,
                status:
                  agent.status === "completed"
                    ? "done"
                    : agent.status === "failed"
                      ? "failed"
                      : agent.status,
                ...(canOpenReview ? { slot: { siteId: `review:${agent.id}`, ordinal: 1 } } : {}),
                stepIds: [],
              }),
            ),
        );
      }
      const stateLabel = [index === phase ? "当前阶段" : "", index === selected ? "查看中" : ""]
        .filter(Boolean)
        .join(" · ");
      return {
        id: String(index),
        naming: { id: String(index), name: stateLabel ? `${name}（${stateLabel}）` : name },
        pills,
        status,
        visited: stageEntered[index] ?? false,
        rounds: stageEntered[index] ? (stageRounds[index] ?? 0) : 0,
        onLoop: loop && index <= 2,
        track: 0,
      };
    });
    return {
      stations,
      rails: stageLabels.slice(1).map((_, index) => ({
        from: index,
        to: index + 1,
        ink: complete || index < phase ? "strong" : "faint",
      })),
      arcs: loop
        ? [{ from: 2, to: 0, lane: 0, air: 0, ink: phase === 0 ? "strong" : "faint" }]
        : [],
      bands: [],
      runningIndex: running ? phase : undefined,
      live: true,
    };
  }, [
    businessLabel,
    reviewLabel,
    solutionLabel,
    deliveryLabel,
    phase,
    selected,
    complete,
    running,
    proposal,
    businessRound,
    reviewRound,
    solutionRound,
    deliveryRound,
    returned,
    businessEntered,
    reviewEntered,
    solutionEntered,
    deliveryEntered,
    review,
    reviewAgent,
    canOpenReview,
  ]);
  useEffect(() => {
    if (proposal) return;
    const scroller = root.current?.querySelector<HTMLElement>(
      '[data-testid="workflow-timeline-scroller"]',
    );
    if (scroller)
      scroller.scrollTo({
        left: Math.max(0, selected * 192 - scroller.clientWidth / 2 + 84),
        behavior: "instant",
      });
  }, [proposal, selected, labels.length, returned]);
  // 修复：当前通用时间线按 192px 站距排版，放入讨论栏会把第四阶段挤出首屏。
  // 提案仍以同一模型驱动四个原生控件，不复制旧时间线的紧凑样式或另建阶段状态。
  // 修复：原限宽流程区靠左，宽屏下偏离居中的输入框；复用会话内容列宽度并居中。
  if (proposal)
    return (
      <nav
        className={`mx-auto grid min-w-0 grid-cols-4 gap-1 px-2 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}
        data-testid="aireq-workflow-timeline"
        aria-label={`当前阶段：${labels[phase]}；查看：${labels[selected]}`}
      >
        {model.stations.map((station, index) => (
          <div key={station.id} className="flex min-w-0 flex-col items-center gap-1">
            <Button
              variant={index === selected ? "secondary" : "ghost"}
              size="sm"
              className="h-auto min-h-8 w-full min-w-0 whitespace-normal px-1 text-ui-sm"
              disabled={!canNavigate || !entered[index]}
              aria-current={index === phase ? "step" : undefined}
              aria-pressed={index === selected}
              onClick={() => onSelect(index)}
            >
              {labels[index]}
              {/* 查看历史只切换选中态，当前业务阶段必须仍有独立的可见标记。 */}
              {index === phase && (
                <span className="rounded-sm bg-surface px-1 text-ui-xs text-foreground-subtle">
                  当前
                </span>
              )}
            </Button>
            {station.pills.map((pill) => (
              <Button
                key={pill.key}
                variant="ghost"
                size="sm"
                className="h-8 min-w-0 max-w-full gap-1 px-1 text-ui-sm"
                disabled={
                  pill.key.startsWith("review:") ? !canOpenReview : !canNavigate || !entered[index]
                }
                aria-label={pill.lane.name ?? pill.runtimeName}
                onClick={() => {
                  if (pill.key.startsWith("review:"))
                    onSelectReview(pill.key.slice(7) as AIReqReviewAgentId);
                  else onSelect(index);
                }}
              >
                <WorkflowAgentFace
                  name={pill.lane.name ?? ""}
                  avatarIndex={pill.avatarIndex ?? 0}
                  status={pill.status}
                  className="size-5 shrink-0"
                />
                <span className="truncate">{pill.runtimeName}</span>
              </Button>
            ))}
            {returned && index < 3 && station.rounds > 0 && (
              <span className="text-ui-xs text-foreground-subtle">↻ {station.rounds}</span>
            )}
          </div>
        ))}
      </nav>
    );
  return (
    <div
      ref={root}
      className="w-full min-w-0 max-w-3xl"
      data-testid="aireq-workflow-timeline"
      aria-label={`当前阶段：${labels[phase]}；查看：${labels[selected]}`}
    >
      <WorkflowTimeline
        className={
          proposal
            ? "[&_.wf-agent-pill]:h-7 [&_.wf-agent-pill]:gap-1.5 [&_.wf-agent-pill]:px-1.5"
            : undefined
        }
        model={model}
        onOpenPill={(pill) => {
          if (canOpenReview && pill.key.startsWith("review:"))
            onSelectReview(pill.key.slice(7) as AIReqReviewAgentId);
        }}
        onSelectStation={
          canNavigate
            ? (station) => {
                const index = Number(station.id);
                if (entered[index]) onSelect(index);
              }
            : undefined
        }
      />
    </div>
  );
}
