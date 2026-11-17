import { WorkspaceSidePaneToggleButton } from "@/WorkspaceSidePaneToggleButton.js";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import { conversationReadOnlyReason } from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIReqSessionPane } from "../conversation/AIReqSessionPane.js";
import { AIReqProposalStageBody } from "../proposals/AIReqPhaseHeader.js";
import { AIReqRequirementMenu } from "../proposals/AIReqRequirementMenu.js";
import { AIReqProposalOverview } from "../proposals/AIReqProposalOverview.js";
import { AIReqProposalReviewPage } from "../proposals/AIReqProposalReviewPage.js";
import { AIReqProposalManagement } from "../proposals/AIReqProposalManagement.js";
import { AIReqProposalFeedback } from "../proposals/AIReqProposalFeedback.js";
import { proposalTaskParent, proposalTaskTitles } from "../proposals/proposalTasks.js";
import {
  AIREQ_CONTENT_WIDTH_CLASSNAME,
  AIREQ_PAGE_CONTENT_CLASSNAME,
  AIREQ_PAGE_TITLE_CLASSNAME,
} from "./pageLayout.js";
import { AIReqRequirementReturnButton } from "./AIReqRequirementNavigation.js";

/** 工作台与任务共享导航 owner；独立 Agent 详情不通过同页标签替换聊天身份。 */
export function AIReqProposalWorkspace({ active }: { active: boolean }) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const { open, activeTab, isOpen, toggle } = useAIReqSidePane();
  const proposal = ai.view?.drafts.find(
    (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
  );
  const task = ai.proposalTask;
  const detail = task === "requirementsReviewDetail" || task === "solutionReviewDetail";
  const conversation = task === "requirements" || task === "solution" || detail;
  const original = task === "requirementsReview" || task === "requirementsReviewDetail";
  const review = original ? proposal?.originalReview : proposal?.review;
  const agent = detail
    ? review?.agents?.find((item) => item.id === ai.selection.reviewAgent)
    : undefined;
  const workspace = source.resolveWorkspace(ai.view, ai.selection);
  const scope = { workspacePath: workspace.path ?? "", workspaceIdentity: workspace.identity };
  const root = useRef<HTMLDivElement>(null);
  const scrollMemory = useRef(new Map<string, number>());
  const routeKey = JSON.stringify([
    ai.selection.projectId,
    ai.releaseId,
    ai.selection.irId,
    task,
    ai.selection.reviewAgent,
  ]);
  useLayoutEffect(() => {
    const main = root.current?.querySelector("main");
    if (main && ai.selectionReady) main.scrollTop = scrollMemory.current.get(routeKey) ?? 0;
  }, [routeKey, ai.selectionReady]);
  const openedTarget = useRef("");
  useEffect(() => {
    if (!conversation || !ai.selectionReady || !proposal) return;
    const key = JSON.stringify([proposal.projectId, proposal.id, proposal.releaseId, ai.selection]);
    if (openedTarget.current === key) return;
    openedTarget.current = key;
    open(
      {
        kind: "materials",
        selection: ai.selection,
        releaseId: proposal.releaseId,
        title: proposal.title,
      },
      { ifAbsent: true },
    );
  }, [conversation, ai.selectionReady, ai.selection, proposal, open]);
  const managementReturn = useMemo(() => ({ dirty: false, busy: false, discard: () => {} }), []);
  const openMaterials = () => {
    if (proposal && ai.selectionReady)
      open({
        kind: "materials",
        selection: ai.selection,
        releaseId: proposal.releaseId,
        title: proposal.title,
      });
  };
  const materialsOpen =
    isOpen &&
    activeTab?.kind === "materials" &&
    activeTab.selection.projectId === proposal?.projectId &&
    activeTab.selection.irId === proposal?.id;
  const parent = proposalTaskParent(task);
  const backLabel = parent === "overview" ? "返回需求工作台" : `返回${proposalTaskTitles[parent]}`;
  let content;
  if (!ai.selectionReady || !proposal)
    content = (
      <div className="m-auto space-y-3 p-6 text-ui-sm text-foreground-subtle">
        <p role={ai.error ? "alert" : "status"}>
          {ai.error || (ai.pending ? "正在读取需求…" : "需求暂不可用，请重新读取。")}
        </p>
        <Button variant="outline" disabled={ai.pending} onClick={() => void ai.refresh()}>
          重新读取
        </Button>
      </div>
    );
  else if (task === "overview") content = <AIReqProposalOverview group={proposal} />;
  else if (task === "requirementsReview" || task === "solutionReview")
    content = (
      <AIReqProposalReviewPage
        key={`${proposal.projectId}:${proposal.id}:${task}`}
        group={proposal}
        full={!original}
      />
    );
  else if (task === "delivery")
    content = (
      <AIReqProposalStageBody materialsOpen={materialsOpen} onOpenMaterials={openMaterials} />
    );
  else if (task === "management")
    content = (
      <main
        className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]"
        data-testid="proposal-management-page"
      >
        <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-6`}>
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>管理需求</h1>
          <AIReqProposalManagement
            key={`${proposal.projectId}:${proposal.id}`}
            group={proposal}
            returnDraft={managementReturn}
          />
          {proposal.status === "requirements-pr" && proposal.proposalDelivery && (
            <Button
              variant="outline"
              disabled={ai.pending}
              onClick={() =>
                void ai.command({
                  type: "closeProposalPr",
                  projectId: proposal.projectId,
                  irId: proposal.id,
                  candidate: proposal.proposalDelivery!.candidate,
                })
              }
            >
              关闭未合并 MR 后修改
            </Button>
          )}
        </div>
      </main>
    );
  else if (detail && !agent)
    content = (
      <div className="m-auto space-y-3 p-6 text-ui-sm">
        <p role="status">该评审记录暂不可用，请返回汇总查看当前审查。</p>
        <Button variant="outline" onClick={() => ai.openProposalTask(parent)}>
          {backLabel}
        </Button>
      </div>
    );
  else
    content = (
      <>
        <div className="shrink-0 overflow-y-auto pb-5 [scrollbar-gutter:stable_both-edges]">
          <div
            className={`mx-auto flex min-w-0 flex-wrap items-center justify-between gap-3 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}
          >
            <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>
              {agent?.name ?? proposalTaskTitles[task]}
            </h1>
            {!detail && (
              <Button
                variant="outline"
                onClick={() =>
                  ai.openProposalTask(
                    task === "requirements" ? "requirementsReview" : "solutionReview",
                  )
                }
              >
                {task === "requirements" ? "前往需求评审" : "前往方案审查"}
              </Button>
            )}
          </div>
        </div>
        {task === "requirements" && <AIReqProposalFeedback />}
        {ai.selection.srId ? (
          <div className="space-y-3 p-6 text-ui-sm text-foreground-subtle">
            <p>SR 规格为只读材料，方案讨论在所属需求进行。</p>
            <Button variant="outline" onClick={() => ai.openProposalTask("solution")}>
              返回需求方案设计
            </Button>
          </div>
        ) : ai.session ? (
          <V4PaneConversationProvider scope={scope} sessionId={ai.session.sessionId}>
            <AIReqSessionPane
              contentWidthClassName={AIREQ_CONTENT_WIDTH_CLASSNAME}
              paneId="aireq-proposal"
              sessionId={ai.session.sessionId}
              {...scope}
              readOnly={Boolean(
                conversationReadOnlyReason(ai.view, ai.selection, source.capabilities),
              )}
              embedded
              focused={active}
            />
          </V4PaneConversationProvider>
        ) : (
          <div className="m-auto space-y-3 p-6 text-ui-sm text-foreground-subtle">
            <p role="status">当前会话暂不可用，可重新读取或返回工作台。</p>
            <Button variant="outline" onClick={() => void ai.refresh()}>
              重新读取
            </Button>
          </div>
        )}
      </>
    );
  return (
    <div
      ref={root}
      className="@container/conversation flex h-full min-h-0 flex-col overflow-hidden bg-background"
      data-testid="proposal-task-workspace"
      data-proposal-task={task}
      onScrollCapture={(event) => {
        if (
          ai.selectionReady &&
          event.target instanceof HTMLElement &&
          event.target.tagName === "MAIN"
        ) {
          if (scrollMemory.current.size > 128)
            scrollMemory.current.delete(scrollMemory.current.keys().next().value!);
          scrollMemory.current.set(routeKey, event.target.scrollTop);
        }
      }}
    >
      <div
        className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b border-border/50 px-3"
        data-testid="aireq-proposal-toolbar"
      >
        {task === "overview" ? (
          <AIReqRequirementReturnButton />
        ) : (
          <ControlHintTooltip title={backLabel}>
            <Button
              variant="ghost"
              size="icon-md"
              aria-label={backLabel}
              onClick={() => ai.openProposalTask(parent)}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
          </ControlHintTooltip>
        )}
        <span className="min-w-0 flex-1 truncate text-ui-sm font-medium" title={proposal?.title}>
          {proposal?.title ?? "需求工作台"}
        </span>
        {proposal && <AIReqRequirementMenu key={proposal.id} group={proposal} />}
        {task !== "overview" && (
          <Button
            variant="ghost"
            size="icon-md"
            aria-label="查看需求材料"
            disabled={!proposal || !ai.selectionReady}
            onClick={openMaterials}
          >
            <FileText className="size-4" aria-hidden="true" />
          </Button>
        )}
        {task !== "overview" && !isOpen && activeTab && (
          <WorkspaceSidePaneToggleButton isSidePaneOpen={false} onToggleSidePane={toggle} />
        )}
      </div>
      {content}
    </div>
  );
}
