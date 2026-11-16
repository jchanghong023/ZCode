import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button.js";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS_NAME,
} from "@/components/ui/resizable.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import { useAIReq } from "../AIReqContext.js";
import { conversationReadOnlyReason, proposalProgressIndex } from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIReqSessionPane } from "../conversation/AIReqSessionPane.js";
import { AIReqMaterialsPane, AIReqStageHeader } from "../proposals/AIReqWorkbench.js";
import { AIReqProposalStageBody } from "../proposals/AIReqPhaseHeader.js";
import { AIReqRequirementMenu } from "../proposals/AIReqRequirementMenu.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "./pageLayout.js";

/** 提案详情只拥有面板展示；需求、阶段与原生会话仍由既有 owner 管理。 */
export function AIReqProposalWorkspace({ active }: { active: boolean }) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [materialsOpen, setMaterialsOpen] = useState(true);
  const materialsPanel = useRef<PanelImperativeHandle>(null);
  const appliedMaterialsOpen = useRef(true);
  useLayoutEffect(() => {
    if (appliedMaterialsOpen.current === materialsOpen) return;
    appliedMaterialsOpen.current = materialsOpen;
    // 原生折叠会记住展开宽度；修改 minSize 或重新注册面板会把宽度夹到最小值。
    if (materialsOpen) materialsPanel.current?.expand();
    else materialsPanel.current?.collapse();
  }, [materialsOpen]);
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
  const toggleMaterials = () => setMaterialsOpen((open) => !open);
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
    // 新布局从可读的讨论／材料比例开始；后续拖拽继续交给现有布局持久化。
    <ResizablePanelGroup orientation="horizontal" layoutId="aireq-proposal-workspace-v3">
      <ResizablePanel id="discussion" defaultSize="52%" minSize="35%">
        <div
          className={`flex h-full min-h-0 flex-col overflow-hidden bg-background ${materialsOpen ? "rounded-xl border-[0.5px] border-border shadow-xs" : ""}`}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-4">
            {proposal && (
              <Button
                variant="ghost"
                size="icon-md"
                aria-label={zh ? "返回提案列表" : "Back to proposals"}
                title={zh ? "返回提案列表" : "Back to proposals"}
                onClick={() => ai.navigate(() => ai.setMainView("proposals"))}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
              </Button>
            )}
            <span
              className="min-w-0 flex-1 truncate text-ui-base font-medium"
              title={proposal?.title}
            >
              {proposal?.title ?? "AIReq"}
            </span>
            {proposal && <AIReqRequirementMenu key={proposal.id} group={proposal} />}
            <Button
              variant="ghost"
              size="icon-md"
              aria-label={
                zh
                  ? materialsOpen
                    ? "收起材料"
                    : "展开材料"
                  : materialsOpen
                    ? "Hide materials"
                    : "Show materials"
              }
              aria-expanded={materialsOpen}
              onClick={toggleMaterials}
            >
              {materialsOpen ? (
                <PanelRightClose aria-hidden="true" className="size-4" />
              ) : (
                <PanelRightOpen aria-hidden="true" className="size-4" />
              )}
            </Button>
          </div>
          {ai.selection.irId && <AIReqStageHeader />}
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
            <AIReqProposalStageBody
              materialsOpen={materialsOpen}
              onOpenMaterials={() => setMaterialsOpen(true)}
            />
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
      </ResizablePanel>
      {materialsOpen && (
        <ResizableHandle
          className={`${WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS_NAME} aria-[orientation=vertical]:w-[3px]`}
        />
      )}
      <ResizablePanel
        id="materials"
        panelRef={materialsPanel}
        defaultSize="45%"
        collapsible
        collapsedSize="0px"
        minSize="320px"
        maxSize="65%"
        onResize={(size) => setMaterialsOpen(size.asPercentage > 0)}
        className={materialsOpen ? "" : "pointer-events-none invisible"}
      >
        <div
          className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border-[0.5px] border-border bg-background shadow-xs"
          inert={!materialsOpen}
        >
          <div
            className="h-12 shrink-0 overflow-y-auto border-b border-border/50 px-2 text-ui-base [scrollbar-gutter:stable_both-edges]"
            style={{ scrollbarWidth: "thin" }}
          >
            <div className="mx-auto flex h-full w-full max-w-4xl items-center">
              <span className="flex-1">{zh ? "需求材料" : "Requirement materials"}</span>
              <Button
                variant="ghost"
                size="icon-md"
                aria-label={zh ? "收起材料" : "Hide materials"}
                onClick={toggleMaterials}
              >
                <PanelRightClose aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>
          <AIReqMaterialsPane />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
