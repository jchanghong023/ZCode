import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import {
  conversationReadOnlyReason,
  proposalProgressIndex,
  proposalViewedIndex,
} from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIReqSessionPane } from "../conversation/AIReqSessionPane.js";
import { AIReqStageHeader } from "../proposals/AIReqWorkbench.js";
import { AIReqProposalStageBody } from "../proposals/AIReqPhaseHeader.js";
import { AIReqRequirementMenu } from "../proposals/AIReqRequirementMenu.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "./pageLayout.js";
import { AIReqRequirementReturnButton } from "./AIReqRequirementNavigation.js";

/** 主区只持有原生讨论；材料以明确对象目标交给工作台统一侧栏。 */
export function AIReqProposalWorkspace({ active }: { active: boolean }) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const sidePane = useAIReqSidePane();
  const { open } = sidePane;
  const openedTarget = useRef<string | undefined>(undefined);
  const proposal = ai.view?.drafts.find(
    (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
  );
  const workspace = source.resolveWorkspace(ai.view, ai.selection);
  const scope = { workspacePath: workspace.path ?? "", workspaceIdentity: workspace.identity };
  // 读取未就绪或对象失效时不能借上一阶段会话展示正常交付状态。
  const viewingIntake =
    ai.selectionReady &&
    !ai.error &&
    proposal &&
    proposalProgressIndex(proposal, ai.selection) === 3 &&
    (ai.selection.proposalStep === "intake" ||
      (!ai.selection.proposalStep && !ai.selection.discussionPhase));
  const selection = ai.selection;
  const proposalId = proposal?.id;
  const proposalTitle = proposal?.title;
  const releaseId = proposal?.releaseId;
  const ready = ai.selectionReady;
  const viewedStage = proposal ? proposalViewedIndex(proposal, selection) : -1;
  const [reviewDetailsOpen, setReviewDetailsOpen] = useState(false);
  useEffect(() => {
    setReviewDetailsOpen(false);
  }, [selection.projectId, selection.irId, viewedStage]);
  const reviewSession = Boolean(
    proposal &&
    ((viewedStage === 1 && proposal.originalReview) ||
      (viewedStage === 2 && selection.reviewAgent)),
  );
  useEffect(() => {
    if (!ready || !proposalId || !proposalTitle || !releaseId) return;
    const key = JSON.stringify([releaseId, selection]);
    if (openedTarget.current === key) return;
    // 刷新与面板收起不能重新激活或复活材料；仅新进入的对象／历史阶段确保一次。
    openedTarget.current = key;
    open({ kind: "materials", selection, releaseId, title: proposalTitle }, { ifAbsent: true });
  }, [ready, proposalId, proposalTitle, releaseId, selection, open]);
  const openMaterials = () => {
    if (!proposal || !ai.selectionReady) return;
    open({
      kind: "materials",
      selection: ai.selection,
      releaseId: proposal.releaseId,
      title: proposal.title,
    });
  };
  const materialsOpen =
    sidePane.isOpen &&
    sidePane.activeTab?.kind === "materials" &&
    sidePane.activeTab.selection.projectId === proposal?.projectId &&
    sidePane.activeTab.selection.irId === proposal?.id &&
    sidePane.activeTab.releaseId === proposal?.releaseId;
  const selectedSr =
    ai.selection.srId &&
    proposal &&
    ai.view?.srs.some(
      (item) =>
        item.projectId === ai.selection.projectId &&
        item.irId === proposal.id &&
        item.id === ai.selection.srId,
    );
  return (
    <div className="@container/conversation flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div
        className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b border-border/50 px-3"
        data-testid="aireq-proposal-toolbar"
      >
        <AIReqRequirementReturnButton />
        <span className="min-w-0 flex-1 truncate text-ui-sm font-medium" title={proposal?.title}>
          {proposal?.title}
        </span>
        {proposal && <AIReqRequirementMenu key={proposal.id} group={proposal} />}
        <Button
          variant="ghost"
          size="icon-md"
          aria-label={zh ? "查看需求材料" : "View requirement materials"}
          disabled={!proposal || !ai.selectionReady}
          onClick={openMaterials}
        >
          <FileText aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {ai.selection.irId && (
        <AIReqStageHeader
          reviewDetailsOpen={reviewDetailsOpen}
          onReviewDetailsChange={setReviewDetailsOpen}
        />
      )}
      {selectedSr ? (
        <div className="space-y-3 p-6 text-ui-base">
          <p>
            {zh
              ? "SR 规格为只读材料；讨论与阶段决策在所属 IR 进行。"
              : "SR specifications are read-only. Discussion and stage decisions belong to the parent IR."}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              ai.select({
                projectId: ai.selection.projectId,
                irId: ai.selection.irId,
              })
            }
          >
            {zh ? "返回 IR 讨论" : "Back to IR discussion"}
          </Button>
        </div>
      ) : viewingIntake ? (
        <AIReqProposalStageBody materialsOpen={materialsOpen} onOpenMaterials={openMaterials} />
      ) : ai.session ? (
        <div
          hidden={reviewSession && !reviewDetailsOpen}
          inert={reviewSession && !reviewDetailsOpen}
          className={
            reviewSession && !reviewDetailsOpen ? "hidden" : "flex min-h-0 flex-1 flex-col"
          }
        >
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
              focused={active && (!reviewSession || reviewDetailsOpen)}
            />
          </V4PaneConversationProvider>
        </div>
      ) : ai.selection.irId || !ai.view ? (
        <div className="m-auto space-y-3 p-6 text-ui-base text-foreground-subtle">
          <p role={ai.error ? "alert" : "status"}>
            {ai.error
              ? `${zh ? "读取需求或会话失败：" : "Failed to load the requirement or session: "}${ai.error}`
              : !ai.selectionReady
                ? ai.pending
                  ? zh
                    ? "正在加载需求与会话…"
                    : "Loading requirement and session…"
                  : zh
                    ? "需求与会话尚未加载，请重新读取。"
                    : "The requirement and session are not loaded. Reload to continue."
                : !proposal
                  ? zh
                    ? "需求提案不存在或已被删除。"
                    : "The proposal is unavailable or has been deleted."
                  : ai.selection.srId
                    ? zh
                      ? "所选 SR 不存在或已被删除。"
                      : "The selected SR is unavailable or has been deleted."
                    : zh
                      ? "当前阶段会话不可用，请重新读取或返回项目。"
                      : "This stage's session is unavailable. Reload or return to the project."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={ai.pending} onClick={() => void ai.refresh()}>
              {zh ? "重新读取" : "Reload"}
            </Button>
            <Button
              variant="outline"
              onClick={() => ai.navigate(() => ai.setMainView("projectOverview"))}
            >
              {zh ? "返回项目" : "Back to project"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="m-auto p-6 text-foreground-subtle">
          {zh
            ? "请从需求提案表进入讨论。"
            : "Open a proposal from the requirement list to start a discussion."}
        </div>
      )}
    </div>
  );
}
