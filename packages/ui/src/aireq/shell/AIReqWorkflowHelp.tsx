import type { RefObject } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReqDataSource } from "../data-source.js";

// 迁移保留完整业务流程，但不能把源个人 OMP、真实 Git 与数据库描述当成本产品能力。
const steps = [
  {
    section: "项目进度", sectionEn: "Project progress",
    title: "总览与当前项目详情", titleEn: "Totals and current-project details",
    description: "项目总览始终显示所有项目全部 Release 的提案数、正式 IR 数与进度；进入项目后，下方按当前项目／Release 列出全部正式 IR、SR 数和未分析标记，可进入 IR/SR 同页报告。项目与 Release 共用正式、提案和分析的范围，前进后退恢复范围；未保存输入继续走统一门禁。无项目或 Release 请使用项目设置，不自动创建或切换其他项目。",
    descriptionEn: "The overview shows proposal counts, formal IR counts and total progress across every Release for every project. Select a project to list all formal IRs, SR counts and unanalyzed markers in the current project/Release scope, with links to same-page IR/SR reports. Formal, proposal and analysis pages share this scope. Back/forward restores it through the existing unsaved-change guard. Use project settings for missing projects or Releases; none are created or substituted automatically.",
  },
  {
    section: "待办与提案", sectionEn: "Todos and proposals",
    title: "保存原始短需求", titleEn: "Save the original request",
    description: "登录默认待办列表，支持我的、待认领、全部和跨项目筛选。提案表工具栏依次为新增、导入、导出；新增只保存原文并停留表格，不运行 AI。CSV 是 UTF-8 单列“原始需求”，预览后原子导入；空行跳过，重复提示但不去重，导出包含全部筛选原文。新增与导入必须选择具体 Release。",
    descriptionEn: "Sign-in opens service-derived todos across projects, with Mine, Unassigned and All filters. The proposal toolbar offers New, Import and Export. Saving stays in the table and never starts AI. UTF-8 single-column CSV is previewed and imported atomically; blank rows are skipped and duplicates retained. Export includes every filtered original text. Creation requires a specific Release.",
  },
  {
    title: "澄清与单 Agent 评审", titleEn: "Clarification and single-agent review",
    description: "从提案表手动进入同一 IR 的原生讨论。业务阶段只整理业务需求文档；单 Agent 检查目标、范围、歧义和可验收性，无阻断且人工通过后才进入 SR 拆分。原始短需求始终独立保留。",
    descriptionEn: "Open an IR discussion explicitly from the proposal table. The business stage produces only business requirements. One agent reviews goals, scope, ambiguity and acceptance. A person must approve a non-blocking review before SR splitting. The short original request is preserved separately.",
  },
  {
    title: "每 SR 独立完整包", titleEn: "An independent complete package per SR",
    description: "开发在同一方案阶段与 AI 完善 SR 的 proposal、design、tasks、specs 和追溯业务验收的 test-plan；每个 SR 是独立 OpenSpec change。IR 保留业务需求、权威依赖 JSON 和整体验收。右侧可切 SR 和历史材料，全部只读；平台不执行开发任务或构建测试。",
    descriptionEn: "In one solution stage, develop each SR's independent OpenSpec change: proposal, design, tasks, specs and a business-traceable test plan. The IR retains shared requirements, dependency JSON and overall acceptance. Switch SRs and read-only historical packages in the materials pane. AIReq never executes development tasks, builds or tests.",
  },
  {
    title: "完整三审、终审与三方确认", titleEn: "Three reviews, synthesis and three perspectives",
    description: "同一完整快照由三路分别检查需求一致性、方案依赖、任务及测试充分性，全部完成后第四 Agent 终审，再由人工放行。业务、开发、测试三个视角分别记录版本、工号和时间，同一人可分别确认。任意材料变化使整包批准与确认全部失效；业务需求文档变化额外重做单评审，旧意见和失效原因保留。",
    descriptionEn: "Three agents review coverage, design/dependencies and task/test sufficiency on one complete snapshot. A fourth synthesizes only after all three complete, followed by human approval. Business, development and testing confirmations record the same version independently; one person may perform all three. Any material change invalidates the entire approval package. Business changes additionally require the original review again; history remains readable.",
  },
  {
    title: "一个 IR 一个文档 PR", titleEn: "One document PR per IR",
    description: "三方确认齐全后确认全部文件并提交模拟文档 PR。提交即冻结，修改前先关闭未合并 PR。等待、关闭、缺材料或版本不符都不转正；只有服务核实同一完整候选合入才以原 ID 转正，并逐 SR 建立开发分支，保留失败事实。所有模型、Git、PR 和分支操作均为共享服务内存模拟。",
    descriptionEn: "After all perspectives confirm, check all files and submit one simulated document PR. Submitted materials freeze; close an unmerged PR before changes. Waiting, closure, missing material or a stale candidate never makes an IR formal. The service verifies the complete merged candidate, preserves IDs and records per-SR branch creation outcomes. All AI, Git, PR and branch facts are in-memory simulations.",
  },
  {
    section: "正式需求与进度分析", sectionEn: "Formal requirements and progress",
    title: "分工与统一分析", titleEn: "Ownership and unified analysis",
    description: "正式表以 IR 为主行、SR 为子行；同页查看材料、代码证据、分支和最新报告。人员可指定、认领和代办，不是权限。正式、提案和进度分析共用项目／Release，包括全部 Release；待办仍跨项目。分析可手动或定时，失败保留上次成功结果，旧版本结果不得覆盖新事实。",
    descriptionEn: "Formal tables show IR parent rows and SR children, with same-page materials, evidence, branches and reports. Assignments, claims and acting on behalf of others do not grant permissions. Formal, proposal and analysis pages share project/Release scope; todos remain cross-project. Manual and scheduled analyses retain the last success on failure and reject stale results.",
  },
  {
    title: "合入 99%、人工验收 100%", titleEn: "Merged at 99%, accepted at 100%",
    description: "未合入时 AI 可估计 0–99，代码合入后业务进度固定 99%，不依赖 AI 恰好打出 99。人工填写依据记录测试通过才到 100；失败保持 99 并产生修复待办，修复版本合入后复测。IR 是全部 SR 的等权平均，全部 SR 完成后才可再次确认清理登记分支；逐项保留失败，不删主分支、材料或历史。",
    descriptionEn: "Before merge, AI estimates 0–99. Code merge fixes effective progress at 99 regardless of the raw AI score. Human test acceptance with evidence raises it to 100. Failure stays at 99 and creates repair work; retest a newly merged fix. IR progress averages all SRs. Only after every SR completes may a confirmed cleanup remove registered development branches, retaining failures, main branch, materials and history.",
  },
  {
    title: "项目与 Release 直接汇总 SR", titleEn: "Project and Release progress average SRs directly",
    description: "项目、Release 和 IR 的进度读取同一业务事实。项目与 Release 直接平均范围内全部正式 SR，不先平均 IR；提案不入分母。未分析正式 SR 按 0 并标注；没有正式 SR 显示“暂无正式需求”，不是 0%。只有全部完成才显示 100%。业务更新后自动重读，缺少投影或读取失败不会伪造零进度。",
    descriptionEn: "Projects, Releases and IRs read the same business facts. Project and Release totals directly average every formal SR, never IR averages; proposals are excluded. Unanalyzed formal SRs count as zero and are marked. No formal SRs means an empty state, not 0%. Only full completion displays 100%. Business changes trigger a reread; missing projections and failed reads never fabricate zero progress.",
  },
];

export function AIReqWorkflowHelp({
  open,
  onOpenChange,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { locale } = useZCodeIntl();
  const source = useAIReqDataSource();
  const zh = locale === "zh-CN";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          // 菜单项随关闭移出焦点序列；必须回到实际打开帮助的工作区或设置 footer 按钮。
          if (returnFocusRef?.current?.isConnected) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
        className="max-h-[85dvh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0"
        data-testid="aireq-workflow-help"
      >
        <DialogHeader className="px-6 pt-6 pb-4 pr-14">
          <DialogTitle>{zh ? "业务流程帮助" : "Workflow help"}</DialogTitle>
          <DialogDescription>
            {zh
              ? "AI 驱动的需求澄清、管理与进度跟踪。IR 是整体需求，SR 是其中可分别实现的系统需求；AIReq 不参与实际编码。"
              : "AI-driven requirement clarification, management and progress tracking. An IR is the overall requirement and an SR is a separately implementable system requirement. AIReq does not write code."}
          </DialogDescription>
        </DialogHeader>
        <div
          className="min-h-0 overflow-y-auto px-6 pb-5"
          tabIndex={0}
          aria-label={zh ? "完整业务流程" : "Complete workflow"}
        >
          <p className="mb-4 text-ui-sm leading-6 text-foreground-subtle">
            {zh
              ? "主导航依次为项目进度、待办列表、正式需求、需求提案、进度分析；登录默认待办。提案表详情复用原生 AI 讨论与右侧只读材料；历史只读。待办由服务端业务事实派生，实际操作后自动消失，不提供任意新建或勾选完成。"
              : "Navigate through Project progress, Todos, Formal requirements, Proposals and Progress analysis; sign-in still opens Todos. Proposal details reuse native AI discussion and read-only materials, including history. Todos are derived by the service and disappear after actual business actions; there are no manually created or checked-off tasks."}
            {source.provenance.kind === "sample" &&
              (zh
                ? "所有演示操作保存于共享后端内存，刷新保留、后端重启恢复样例。"
                : "Demo changes stay in shared backend memory across reloads and reset on backend restart.")}
          </p>
          <p className="mb-4 text-ui-sm leading-6 text-foreground-subtle">
            {zh
              ? "Skill 设计仍在设置，模型、Agent、Skill、项目与外观均保留。切换设置和项目／Release 走未保存门禁，原生会话正文和附件归原 owner。AIReq 不提供独立自动化或编码执行；现有分析调度保留。所有合法工号都可代办，实际操作者独立留痕。"
              : "Settings retain Skill design, models, agents, skills, projects and appearance. Unsaved changes gate navigation and project/Release switches; native session owners retain text and attachments. There is no standalone automation or coding execution. Analysis scheduling remains. Any valid employee may act on behalf of others, with actual operator provenance."}
          </p>
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step.title}>
                {step.section ? (
                  <h3
                    className={`${index ? "pt-3" : ""} mb-3 text-ui-sm font-medium text-foreground-subtle`}
                  >
                    {zh ? step.section : step.sectionEn}
                  </h3>
                ) : null}
                <div className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ui-sm text-foreground-subtle"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <h4 className="text-ui-base font-medium">{zh ? step.title : step.titleEn}</h4>
                    {/* 流程步骤是主要阅读正文，按 base 字阶显示，不弱化为辅助说明。 */}
                    <p className="text-ui-base leading-6 text-foreground">
                      {zh ? step.description : step.descriptionEn}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <DialogFooter className="border-t border-border px-6 py-3">
          <DialogClose asChild>
            <Button>{zh ? "我知道了" : "Got it"}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
