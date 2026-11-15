import { useEffect, useRef, useState } from "react";
import { GitFork } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { WorkflowAgentFace } from "@/components/workflow-timeline/WorkflowAgentFace.js";
import { WorkflowTimeline } from "@/components/workflow-timeline/WorkflowTimeline.js";
import type {
  TimelineStation,
  WorkflowTimelineModel,
} from "@/components/workflow-timeline/timeline-model.js";
import { useAIReq } from "../AIReqContext.js";
import { proposalViewedIndex, requirementsReviewCurrent } from "../contract.js";
import type { AIReqReviewAgentId } from "../contract.js";

// Retain the keyboard focus handoff while the selected review metadata refreshes.
let keyboardTarget: AIReqReviewAgentId | undefined;

/** Native session navigation and native parallel graph, never a report editor or approval engine. */
export function AIReqReviewNavigation() {
  const aireq = useAIReq()!;
  const [expanded, setExpanded] = useState(false);
  const tabList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = keyboardTarget;
    if (!id || id !== (aireq.selection.reviewAgent ?? "summary")) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        tabList.current
          ?.querySelector<HTMLButtonElement>(`[data-testid="review-avatar-${id}"]`)
          ?.focus();
        keyboardTarget = undefined;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [aireq.selection.reviewAgent, aireq.session?.sessionId]);
  const group = aireq.view?.drafts.find(
    (item) => item.id === aireq.selection.irId && item.projectId === aireq.selection.projectId,
  );
  if (!group || aireq.selection.srId || proposalViewedIndex(group, aireq.selection) !== 1)
    return null;
  // 缺失评审数据必须明确展示，不能通过非空断言把失败态变成页面崩溃。
  if (!group.review?.agents?.length)
    return (
      <p role="alert" className="border-b border-border p-4 text-ui-sm text-destructive">
        本轮四路评审报告缺失，不能人工通过。
      </p>
    );
  const review = group.review;
  const agents = review.agents!;
  const selected = aireq.selection.reviewAgent ?? "summary";
  const current = agents.find((agent) => agent.id === selected);
  const choose = (id: string) =>
    aireq.select({ ...aireq.selection, reviewAgent: id as AIReqReviewAgentId });
  const independentDone = agents.filter(
    (agent) => agent.id !== "summary" && agent.status === "completed",
  ).length;
  const reviewDescriptionParts = [
    current?.name ?? "所选评审报告缺失",
    current?.session.modelConfig?.modelName ?? "模型未配置",
    `独立评审 ${independentDone}/3`,
    requirementsReviewCurrent(group)
      ? review.humanDecision
        ? `已由 ${review.humanDecision.employeeId} 人工通过`
        : "综合后由人工判断"
      : "旧版本，仅供历史查看",
  ];
  const reviewDescription = reviewDescriptionParts.join(" · ");
  const diagramAgents = (["a", "b", "c", "summary"] as const).flatMap((id) =>
    agents.filter((agent) => agent.id === id),
  );
  const diagramComplete =
    diagramAgents.length === 4 && new Set(diagramAgents.map((agent) => agent.id)).size === 4;
  const awaitingHuman =
    requirementsReviewCurrent(group) &&
    !review.humanDecision &&
    diagramAgents.every((agent) => agent.status === "completed");
  const stations: TimelineStation[] = diagramAgents.map((agent, index) => ({
    id: agent.id,
    naming: {
      id: agent.id,
      name: `${agent.id === "summary" ? "综合意见" : agent.name}${agent.id === selected ? "（查看中）" : ""}`,
    },
    visited: agent.status !== "pending",
    rounds: 1,
    onLoop: false,
    track: index < 3 ? index : 0,
    status:
      agent.status === "completed" ? "done" : agent.status === "failed" ? "failed" : agent.status,
    pills: [
      {
        key: agent.id,
        lane: { id: agent.id, name: agent.session.modelConfig?.modelName, laneClass: "agent" },
        laneClass: "agent",
        avatarIndex: agents.indexOf(agent) + 1,
        slot: { siteId: agent.id, ordinal: 1 },
        status: agent.status === "completed" ? "done" : agent.status,
        stepIds: [],
      },
    ],
  }));
  stations.push({
    id: "human",
    naming: { id: "human", name: awaitingHuman ? "人工判断（待决定）" : "人工判断" },
    pills: [],
    visited: Boolean(review.humanDecision),
    status: review.humanDecision ? "done" : "pending",
    rounds: 0,
    onLoop: false,
    track: 0,
  });
  const runningIndex = diagramAgents.findIndex((agent) => agent.status === "running");
  const diagram: WorkflowTimelineModel = {
    stations,
    rails: [
      { from: 0, to: 3, ink: "strong" },
      { from: 1, to: 3, ink: "strong", kind: "merge" },
      { from: 2, to: 3, ink: "strong", kind: "merge" },
      { from: 3, to: 4, ink: review.humanDecision ? "strong" : "faint" },
    ],
    arcs: [],
    bands: [
      {
        from: 0,
        to: 2,
        join: 3,
        tracks: [0, 1, 2].map((index) => ({
          stations: [index],
          entry: diagramAgents[index]?.status === "pending" ? "faint" : "strong",
          exit: diagramAgents[index]?.status === "completed" ? "strong" : "faint",
        })),
      },
    ],
    live: true,
    runningIndex: runningIndex < 0 ? undefined : runningIndex,
  };
  return (
    <div
      className="w-full min-w-0 shrink-0 space-y-2 border-b border-border px-4 py-2"
      data-testid="aireq-review-navigation"
    >
      <div
        className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2"
        data-testid="review-session-actions"
      >
        <Tabs value={selected} onValueChange={choose} className="min-w-0 max-w-full">
          <TabsList
            ref={tabList}
            aria-label="评审 Agent 会话"
            className="h-auto max-w-full flex-wrap gap-1 p-1 group-data-horizontal/tabs:h-auto"
            onKeyDownCapture={(event) => {
              const ids = ["summary", "a", "b", "c"] as const;
              const index = ids.indexOf(selected);
              const next =
                event.key === "ArrowRight"
                  ? ids[(index + 1) % ids.length]
                  : event.key === "ArrowLeft"
                    ? ids[(index + ids.length - 1) % ids.length]
                    : event.key === "Home"
                      ? ids[0]
                      : event.key === "End"
                        ? ids[ids.length - 1]
                        : undefined;
              if (!next) return;
              event.preventDefault();
              event.stopPropagation();
              keyboardTarget = next;
              choose(next);
            }}
          >
            {(["summary", "a", "b", "c"] as const).map((id) => {
              const agent = agents.find((item) => item.id === id);
              const label =
                id === "summary" ? "综合意见" : (agent?.name ?? `评审 ${id.toUpperCase()}（缺失）`);
              return (
                <ControlHintTooltip
                  key={id}
                  title={`${label} · ${agent?.session.modelConfig?.modelName ?? "模型未配置"}`}
                >
                  <span className="inline-flex min-w-0 max-w-full">
                    <TabsTrigger
                      value={id}
                      aria-label={label}
                      className="h-auto min-h-9 max-w-full flex-none gap-1.5 px-2 py-1.5 data-[state=active]:bg-selected data-[state=active]:ring-1 data-[state=active]:ring-border"
                      data-testid={`review-avatar-${id}`}
                    >
                      <WorkflowAgentFace
                        name={label}
                        avatarIndex={agent ? agents.indexOf(agent) + 1 : 1}
                        status={
                          agent?.status === "completed" ? "done" : (agent?.status ?? "failed")
                        }
                        showCompletionMark={agent?.status === "completed"}
                        className="size-6 shrink-0"
                      />
                      {/* 可见文字区分评审入口，不让颜色或悬停成为辨认前提。 */}
                      <span className="whitespace-normal text-ui-base">
                        {id === "summary" ? "综合意见" : `评审 ${id.toUpperCase()}`}
                      </span>
                    </TabsTrigger>
                  </span>
                </ControlHintTooltip>
              );
            })}
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="sm"
          disabled={!diagramComplete}
          className="shrink-0 gap-1.5"
          aria-label="展开评审工作流"
          title={diagramComplete ? "展开评审工作流" : "四路评审数据不完整"}
          onClick={() => setExpanded(true)}
        >
          <GitFork className="size-4" />
          评审流程
        </Button>
      </div>
      <ControlHintTooltip title={reviewDescription}>
        <p
          tabIndex={0}
          className="mx-auto flex max-w-full flex-wrap items-baseline justify-center gap-x-1.5 gap-y-1 rounded-sm text-center text-ui-sm text-foreground-subtle outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          data-testid="review-session-description"
        >
          {reviewDescriptionParts.map((part, index) => (
            <span key={index} className="inline-flex min-w-0 max-w-full items-baseline gap-1.5">
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{part}</span>
              {index < reviewDescriptionParts.length - 1 && (
                <span aria-hidden="true" className="shrink-0">
                  ·
                </span>
              )}
            </span>
          ))}
        </p>
      </ControlHintTooltip>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] flex-col gap-6 overflow-hidden p-6 sm:max-w-5xl">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>需求评审工作流</DialogTitle>
            <DialogDescription>
              三个模型并行只读审查同一版需求 → 第四个 Agent 综合意见 →
              人工决定。评审结论以当前版本的报告为准。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto">
            <WorkflowTimeline
              model={diagram}
              onOpenPill={(pill) => {
                choose(pill.key);
                setExpanded(false);
              }}
              onSelectStation={(station) => {
                if (station.id !== "human") {
                  choose(station.id);
                  setExpanded(false);
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
