import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useAIReq } from "../AIReqContext.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "../shell/pageLayout.js";

/** 原文只读；页面内独立滚动，全屏阅读不切换阶段或改变聊天位置。 */
export function AIReqProposalFeedback({ openMaterials }: { openMaterials?: () => void }) {
  const aireq = useAIReq()!;
  const [expanded, setExpanded] = useState(false);
  const group = aireq.view?.requirements.find(
    (item) => !item.merge && item.projectId === aireq.selection.projectId && item.id === aireq.selection.irId,
  );
  const feedback = group?.returnFeedback;
  if (
    !group ||
    aireq.selection.srId ||
    !feedback ||
    (feedback.target ?? "requirements") !== aireq.selection.discussionPhase
  )
    return null;
  const hasReason = Boolean(feedback.reason.trim());
  const title = hasReason
    ? feedback.resumedAt
      ? "退回意见 · 已处理"
      : "最新待处理意见"
    : feedback.resumedAt
      ? "需求已更新 · 可重新送审"
      : "已返回需求澄清";
  return (
    <>
      <div className={`mx-auto min-w-0 shrink-0 py-3 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
        <section
          className={`rounded-xl border border-card-border bg-card px-4 py-3 ${hasReason ? "" : "text-center"}`}
          aria-label={title}
          data-testid="proposal-latest-feedback"
        >
          <div className="mx-auto w-full min-w-0 max-w-4xl space-y-2">
            <div
              className={`flex items-center gap-3 ${hasReason ? "justify-between" : "justify-center"}`}
            >
              <h3 className="text-ui-base font-semibold">{title}</h3>
              {hasReason && (
                <Button size="sm" variant="ghost" onClick={() => setExpanded(true)}>
                  <Maximize2 className="size-3.5" />
                  全屏阅读
                </Button>
              )}
            </div>
            <p className="text-ui-sm text-foreground-subtle">
              {hasReason ? "提出意见" : "操作人"} {feedback.employeeId}
            </p>
            {hasReason && (
              <div
                className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-ui-base leading-6"
                role="region"
                aria-label="最新意见原文，可滚动"
                tabIndex={0}
                data-testid="proposal-feedback-scroll"
              >
                {feedback.reason}
              </div>
            )}
            <p className="text-ui-sm text-foreground-subtle">
              {feedback.resumedAt
                ? "已更新材料，请核对当前版本后再次送审。"
                : !hasReason
                  ? "可继续补充业务规则，核对更新后的材料，再提交需求评审。"
                  : feedback.target === "solution"
                    ? "在方案设计中讨论这些意见。更新材料并通过校验后，请再次提交方案审查。"
                    : "在需求澄清中讨论这些意见。更新材料并通过校验后，请再次提交需求评审。"}
            </p>
            {openMaterials && !feedback.resumedAt && (
              <Button variant="link" size="sm" className="h-auto p-0" onClick={openMaterials}>
                查看退回前的材料
              </Button>
            )}
          </div>
        </section>
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          className="inset-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
          data-testid="proposal-feedback-fullscreen"
        >
          <DialogHeader className="shrink-0 border-b border-border px-4 py-4 md:px-6 md:py-6">
            <div className="mx-auto w-full max-w-4xl space-y-1 pr-8">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {group.title} · 提出意见 {feedback.employeeId} · 只读原文
              </DialogDescription>
            </div>
          </DialogHeader>
          <div
            className="min-h-0 flex-1 overflow-auto px-4 py-4 text-ui-base leading-7 md:px-6 md:py-6"
            role="region"
            aria-label="完整意见原文，可滚动"
            tabIndex={0}
            data-testid="proposal-feedback-fulltext"
          >
            <div className="mx-auto w-full max-w-4xl whitespace-pre-wrap break-words">
              {feedback.reason}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border px-4 py-3 md:px-6">
            <div className="mx-auto flex w-full max-w-4xl justify-end">
              <Button variant="outline" onClick={() => setExpanded(false)}>
                返回讨论
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
