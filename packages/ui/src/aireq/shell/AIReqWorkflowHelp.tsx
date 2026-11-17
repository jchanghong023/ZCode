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

// 迁移保留完整业务流程，但不能把源个人 OMP、真实 Git 与数据库描述当成本产品能力。
const steps = [
  {
    section: "项目空间",
    sectionEn: "Project spaces",
    title: "从项目总览进入工作",
    titleEn: "Start with a project",
    description:
      "登录后先看全部项目。点击项目总览中的项目或版本卡片进入对应范围，“需求规划”包含项目总览、想法池和需求共创，“研发交付”包含开发任务和进度分析。项目总览、想法池与我的待办始终跨项目，项目页面通过页头筛选版本；项目与版本仍在原有设置中配置。",
    descriptionEn:
      "Sign-in opens all projects. Open a project or release from its card in Projects. Requirements contains Projects, Ideas and Co-creation; Development & delivery contains Development tasks and Progress analysis. Projects, Ideas and My todos always span all projects. Project pages share the release filter. Manage projects and releases in the existing settings.",
  },
  {
    section: "待办与提案",
    sectionEn: "Todos and proposals",
    title: "保存原始短需求",
    titleEn: "Save the original request",
    // 进入讨论只加载历史，帮助文案须遵守显式发送才执行的接纳边界。
    description:
      "待办支持我的、待认领、全部及跨项目筛选，显示需求名称和当前事项，点击事项直接进入对应需求。未排期需求可先保存到全局想法池，确定后一次转入一个或多个项目／版本；全部成功后原想法消失，各版本独立管理。已确定版本的需求也可从“需求共创”新增或导入；先选择具体 Release，只保存原始短需求，成功后留在表格。CSV 为 UTF-8 单列“原始需求”，预览后整批导入；空行跳过，重复提示但保留，导出包含全部筛选原文。打开讨论后，只有显式发送消息才开始本次 AI 澄清。",
    descriptionEn:
      "Todos show requirement names and pending actions across projects, with Mine, Unassigned and All filters. Open an action to reach its requirement directly. Save unplanned requests in the global Ideas pool. Moving one to one or more project releases consumes the idea and creates independent proposals. Add or import requests directly in Co-creation when their release is already known. Saving preserves the original short request and stays in the table. UTF-8 single-column CSV is previewed and imported as a complete batch; blanks are skipped and duplicates retained. Export includes every filtered original request. Opening a discussion only reads its existing content; AI clarification starts only after you explicitly send a message.",
  },
  {
    title: "澄清与单 Agent 评审",
    titleEn: "Clarification and single-agent review",
    description:
      "从提案表手动进入同一 IR 的原生讨论。业务阶段只整理业务需求文档；单 Agent 检查目标、范围、歧义和可验收性，无阻断且人工通过后才进入 SR 拆分。原始短需求始终独立保留。",
    descriptionEn:
      "Open an IR discussion explicitly from the proposal table. The business stage produces only business requirements. One agent reviews goals, scope, ambiguity and acceptance. A person must approve a non-blocking review before SR splitting. The short original request is preserved separately.",
  },
  {
    title: "每 SR 独立完整包",
    titleEn: "An independent complete package per SR",
    description:
      "开发在同一方案阶段与 AI 完善 SR 的 proposal、design、tasks、specs 和追溯业务验收的 test-plan；每个 SR 是独立 OpenSpec change。IR 保留业务需求、权威依赖 JSON 和整体验收。右侧可切 SR 和历史材料，全部只读；平台不执行开发任务或构建测试。",
    descriptionEn:
      "In one solution stage, develop each SR's independent OpenSpec change: proposal, design, tasks, specs and a business-traceable test plan. The IR retains shared requirements, dependency JSON and overall acceptance. Switch SRs and read-only historical packages in the materials pane. AIReq never executes development tasks, builds or tests.",
  },
  {
    title: "完整三审、终审与三方确认",
    titleEn: "Three reviews, synthesis and three perspectives",
    description:
      "同一完整材料由三路分别检查需求一致性、方案依赖、任务及测试充分性，全部完成后第四 Agent 终审，再由人工放行。阶段主体直接显示业务、开发、测试三个视角的确认状态、操作和剩余条件，同一人可分别确认。任意材料变化使整包批准与确认全部失效；业务需求文档变化额外重做单评审，旧意见和失效原因保留。",
    descriptionEn:
      "Three agents review coverage, design/dependencies and task/test sufficiency on one complete package. A fourth synthesizes after all three complete, followed by human approval. The stage shows business, development and testing confirmation states, actions and remaining conditions directly; one person may perform all three. Any material change invalidates the entire approval package. Business changes additionally require the original review again; history remains readable.",
  },
  {
    title: "一个 IR 一个文档 PR",
    titleEn: "One document PR per IR",
    description:
      "三方确认齐全后确认全部文件并提交文档 PR。提交即冻结，修改前先关闭未合并 PR。等待、关闭、缺材料或版本不符都不转正；只有服务核实同一完整候选合入才以原 ID 转正，并逐 SR 建立开发分支，保留失败事实。",
    descriptionEn:
      "After all perspectives confirm, check all files and submit one document PR. Submitted materials freeze; close an unmerged PR before changes. Waiting, closure, missing material or a stale candidate never makes an IR formal. The service verifies the complete merged candidate, preserves IDs and records per-SR branch creation outcomes.",
  },
  {
    section: "交付进度与分析运行",
    sectionEn: "Delivery progress and analysis runs",
    title: "分工与统一分析",
    titleEn: "Ownership and unified analysis",
    description:
      "需求转正后保留原有身份、讨论与材料。在“开发任务”中，以 IR 为主行、SR 为子行，同页查看当前状态、问题、材料和报告。人员可指定、认领和代办；待办仍跨项目。项目内“进度分析”查看当前范围的任务、执行历史与失败重试，自动分析周期和项目配置在“设置 → AI 配置 → 分析设置”中调整。分析失败保留上次成功结果，旧版本结果不能覆盖新事实。",
    descriptionEn:
      "Formal requirements retain their original identity, discussions and materials. Development tasks shows IR parent rows and SR children, with same-page status, issues, materials and reports. Assign, claim or act on behalf of others; todos remain cross-project. Progress analysis shows tasks, execution history and retries in the current project scope. Adjust scheduling and project analysis configuration in Settings → AI configuration → Analysis settings. Failed analyses retain the last success and stale results cannot replace newer facts.",
  },
  {
    title: "合入 99%、人工验收 100%",
    titleEn: "Merged at 99%, accepted at 100%",
    description:
      "未合入时 AI 可估计 0–99，代码合入后业务进度固定 99%，不依赖 AI 恰好打出 99。人工填写依据记录测试通过才到 100；失败保持 99 并产生修复待办，修复版本合入后复测。IR 是全部 SR 的等权平均，全部 SR 完成后才可再次确认清理登记分支；逐项保留失败，不删主分支、材料或历史。",
    descriptionEn:
      "Before merge, AI estimates 0–99. Code merge fixes effective progress at 99 regardless of the raw AI score. Human test acceptance with evidence raises it to 100. Failure stays at 99 and creates repair work; retest a newly merged fix. IR progress averages all SRs. Only after every SR completes may a confirmed cleanup remove registered development branches, retaining failures, main branch, materials and history.",
  },
  {
    title: "项目与 Release 直接汇总 SR",
    titleEn: "Project and Release progress average SRs directly",
    description:
      "项目、Release 和 IR 的进度读取同一业务事实。项目与 Release 直接平均范围内全部正式 SR，不先平均 IR；提案不入分母。未分析正式 SR 按 0 并标注；没有正式 SR 显示“暂无正式需求”，不是 0%。只有全部完成才显示 100%。业务更新后自动重读，缺少投影或读取失败不会伪造零进度。",
    descriptionEn:
      "Projects, Releases and IRs read the same business facts. Project and Release totals directly average every formal SR, never IR averages; proposals are excluded. Unanalyzed formal SRs count as zero and are marked. No formal SRs means an empty state, not 0%. Only full completion displays 100%. Business changes trigger a reread; missing projections and failed reads never fabricate zero progress.",
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
              ? "项目总览、想法池和我的待办跨项目。返回项目总览，点击项目或版本卡片进入目标，在需求共创、开发任务和进度分析中工作；页头选择版本。同一需求从澄清到验收持续保留讨论、材料与记录。待办跨项目汇总，完成实际事项后自动消失，无需手工勾选完成。"
              : "Projects, Ideas and My todos span all projects. Open a project or release from Projects, then use Co-creation, Development tasks and Progress analysis. Choose the release in the page header. Each requirement retains its discussions, materials and records from clarification through acceptance. Todos span projects and disappear when their actual work is complete; there is no manual mark-done action."}
          </p>
          <p className="mb-4 text-ui-sm leading-6 text-foreground-subtle">
            {zh
              ? "设置分为外观、项目配置、AI 配置；AI 配置包含模型、共享 Agent 指令和分析设置。离开未保存表单时可保存、丢弃或取消，取消保留当前输入；往返设置保留未发送的讨论与附件。所有合法工号都可认领或代办，记录实际操作者。"
              : "Settings groups Appearance, Project configuration and AI configuration. AI configuration includes models, shared Agent instructions and analysis settings. Save, discard or cancel when leaving an unsaved form; cancel keeps your input. Returning from settings preserves unsent discussion text and attachments. Any valid employee may claim or act on behalf of others, with the actual operator recorded."}
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
