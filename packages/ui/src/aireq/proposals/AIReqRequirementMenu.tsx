import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import type { AIReqRequirementGroup } from "../contract.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { AIReqAgentModelSummary } from "./AIReqAgentModelSummary.js";
import { AIReqDeleteRequirement } from "./AIReqDeleteRequirement.js";

const operationLabels: Record<string, string> = {
  createProposal: "创建提案",
  generateRequirements: "整理需求",
  supplementRequirements: "补充需求",
  runRequirementsReview: "需求评审",
  acceptProposal: "接手技术方案",
  generateProposalSolution: "方案 Agent 更新材料",
  returnProposal: "退回业务补充",
  confirmProposal: "确认需求与方案",
  publishProposal: "提交并推送",
  importProposals: "原子导入提案",
  runFullReview: "完整材料三审与终审",
  approveFullReview: "人工通过完整终审",
  confirmAlignment: "独立视角确认",
  closeProposalPr: "关闭未合并文档 PR",
  reviseProposalMaterial: "修改材料并失效旧批准",
  assignContacts: "调整联系人",
};

// 同一历史弹窗的时间统一转为北京时间，避免 UTC 原文与本地格式混排。
function recordTime(value: string) {
  return `${new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  })}（北京时间）`;
}
/** 查看历史只读取已记录事实，不恢复退役的开发、修订或争议写入口。 */
export function AIReqRequirementMenu({ group }: { group: AIReqRequirementGroup }) {
  const aireq = useAIReq()!;
  const [panel, setPanel] = useState<"info" | "history">();
  // 原子导入共用一条批次收据，每个新 IR 都需要看到创建来源，而不是归到导入前的选择。
  const operations =
    aireq.view?.operations.filter(
      (item) => item.irId === group.id || item.irIds?.includes(group.id),
    ) ?? [];
  if (
    aireq.selection.projectId !== group.projectId ||
    aireq.selection.irId !== group.id ||
    aireq.selection.srId
  )
    return null;
  return (
    <>
      <AIReqDeleteRequirement
        group={group}
        renderTrigger={(openDelete, prohibition) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="更多提案选项">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" data-testid="proposal-more-menu">
              <DropdownMenuItem onSelect={() => setPanel("info")}>提案信息</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPanel("history")}>操作记录</DropdownMenuItem>
              {openDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!!prohibition}
                    title={prohibition}
                    onSelect={openDelete}
                  >
                    <span className="min-w-0">
                      删除提案
                      {prohibition && (
                        <span className="block max-w-64 whitespace-normal break-words text-ui-sm text-foreground-subtle">
                          {prohibition}
                        </span>
                      )}
                    </span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) setPanel(undefined);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{panel === "info" ? "提案信息" : "操作记录"}</DialogTitle>
            <DialogDescription>
              {group.id} · {group.title} · 只读，不改变阶段或发送消息。
            </DialogDescription>
          </DialogHeader>
          {panel === "info" ? (
            <div className="space-y-4 text-ui-sm">
              <dl className="space-y-3">
                <div>
                  <dt className="text-foreground-subtle">提出人</dt>
                  <dd>{group.submittedBy}</dd>
                </div>
                <div>
                  <dt className="text-foreground-subtle">方案参与人</dt>
                  <dd>{group.developerAcceptance?.employeeId ?? "尚未记录"}</dd>
                </div>
                <div>
                  <dt className="text-foreground-subtle">需求文件</dt>
                  <dd className="break-all font-mono">{group.documentPath}</dd>
                  <p className="mt-2 whitespace-pre-wrap">{group.originalText}</p>
                  {group.sourceIrId && <p>关联来源 IR：{group.sourceIrId}</p>}
                </div>
              </dl>
              <AIReqAgentModelSummary
                binding={aireq.session?.modelConfig ?? group.review?.modelConfig}
              />
            </div>
          ) : (
            <div className="space-y-4 text-ui-sm" data-testid="proposal-operation-records">
              {operations.length ? (
                operations.map((item) => (
                  <section key={item.operationId} className="space-y-1 border-b border-border pb-3">
                    <p>
                      {operationLabels[item.type] ?? "其他操作"} ·{" "}
                      {item.status === "completed"
                        ? "已完成"
                        : item.status === "running"
                          ? "进行中"
                          : "失败"}
                    </p>
                    <time dateTime={item.startedAt}>{recordTime(item.startedAt)}</time>
                    {item.steps.map((step, index) => (
                      <p key={index} className="text-foreground-subtle">
                        {step.detail}
                      </p>
                    ))}
                    {item.error && <p className="text-destructive">{item.error}</p>}
                  </section>
                ))
              ) : (
                <p>暂无操作记录。</p>
              )}
              {[
                ...(group.returnFeedbackHistory ?? []),
                ...(group.returnFeedback ? [group.returnFeedback] : []),
              ].map((feedback, index) => (
                <details key={`${feedback.returnedAt}:${index}`}>
                  <summary className="cursor-pointer">
                    退回意见 · {feedback.employeeId} ·{" "}
                    <time dateTime={feedback.returnedAt}>{recordTime(feedback.returnedAt)}</time> ·{" "}
                    {feedback.resumedAt ? "已补充" : "待处理"}
                  </summary>
                  <p
                    className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words"
                    tabIndex={0}
                  >
                    {feedback.reason}
                  </p>
                </details>
              ))}
              {[...(group.originalReviewHistory ?? []), ...(group.reviewHistory ?? [])].map(
                (review, index) => (
                  <details key={`${review.id}:${index}`}>
                    <summary className="cursor-pointer">
                      历史评审 · 第 {review.round ?? 1} 轮 · {review.id}
                    </summary>
                    <p className="my-2 break-all text-foreground-subtle">
                      版本 {review.snapshotDigest} ·{" "}
                      {review.invalidatedReason && (
                        <span className="block text-destructive">
                          失效原因：{review.invalidatedReason}
                        </span>
                      )}
                      {review.humanDecision ? (
                        <>
                          人工通过 {review.humanDecision.employeeId} ·{" "}
                          <time dateTime={review.humanDecision.decidedAt}>
                            {recordTime(review.humanDecision.decidedAt)}
                          </time>
                        </>
                      ) : (
                        "无当前批准"
                      )}
                    </p>
                    {review.agents?.length ? (
                      review.agents.map((agent) => (
                        <details key={agent.id} className="my-2">
                          <summary className="cursor-pointer">
                            {agent.name} · {agent.status} · 会话 {agent.session.sessionId}
                          </summary>
                          {agent.report?.trim() ? (
                            <AIReqMarkdownDocument>{agent.report}</AIReqMarkdownDocument>
                          ) : (
                            <p role="status">历史报告正文不可用。</p>
                          )}
                        </details>
                      ))
                    ) : (
                      <AIReqMarkdownDocument>
                        {review.report || "历史报告正文不可用。"}
                      </AIReqMarkdownDocument>
                    )}
                  </details>
                ),
              )}
              {[...(group.alignmentHistory ?? []), ...(group.alignment ?? [])].map(
                (entry, index) => (
                  <p
                    key={`${entry.perspective}:${entry.confirmedAt}:${index}`}
                    className="break-all"
                  >
                    {entry.perspective === "business"
                      ? "业务"
                      : entry.perspective === "development"
                        ? "开发"
                        : "测试"}
                    视角 · {entry.employeeId} · {recordTime(entry.confirmedAt)} · 版本{" "}
                    {entry.version}（历史只读）
                  </p>
                ),
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
