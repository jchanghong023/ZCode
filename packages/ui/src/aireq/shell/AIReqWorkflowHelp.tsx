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
    section: "需求提案",
    sectionEn: "Proposal",
    title: "提出需求",
    titleEn: "Describe the need",
    description:
      "进入提案 IR 与业务需求 Agent 讨论，明确目标、范围和验收标准，再拆分为 SR。提案列表只显示 IR，点击整行进入；拆分出的 SR 规格在右侧材料中查看，讨论、修改和阶段推进统一从 IR 进入。",
    descriptionEn:
      "Discuss goals, scope and acceptance criteria in the proposal IR before splitting it into SRs. The proposal list shows IRs only. Click a row to open it and read its SR specifications in the right materials pane; discussion, changes and stage actions belong to the IR.",
  },
  {
    title: "检查需求",
    titleEn: "Review requirements",
    description:
      "IR／SR 完整后，A／B／C 用不同模型角色并行只读评审，综合评审 Agent 汇总来源与分歧；默认查看综合意见，由人判断通过进入方案或返回业务 Agent 补充后重评。当前演示使用模拟评审，不调用真实模型。",
    descriptionEn:
      "Once the IR/SRs are complete, three model roles review them in parallel and read-only. A fourth agent synthesizes sources and disagreements. A person reads the synthesis and decides to proceed or return for clarification. Reviews in this demo are simulated; no real model is called.",
  },
  {
    title: "制定方案",
    titleEn: "Design the solution",
    description:
      "在共享模拟项目的同一提案中与方案 Agent 对话，通过讨论生成和更新技术方案、SR 依赖与工期预估，不需要点击生成按钮。逐 SR 预估工期、假设与依赖共同呈现在 sr-dependencies.json 材料中；提案不安排人员或起止日期。回答不了 Agent 的问题时，复制问题，点击退回并粘贴意见，返回业务 Agent；通过讨论更新 IR／SR，重评后再继续方案。当前对话与材料为模拟业务流程，不读取个人目录。",
    descriptionEn:
      "Discuss the design in the same proposal of the shared mock project. Conversation generates and updates the design, SR dependencies and duration estimates, without a Generate button. Per-SR estimates, assumptions and dependencies appear in sr-dependencies.json materials; proposals do not assign people or dates. If questions cannot be answered, copy them into the Return dialog for the Business Requirements Agent, update IR/SR through discussion, and review again before resuming design. This simulated workflow does not read personal directories.",
  },
  {
    title: "自动入库",
    titleEn: "Automatic intake",
    description:
      "方案完成并确认后，模拟提案分支与 MR 创建、人工评审和合并流程。后台检查模拟合入状态，核验提案分支已合入默认分支且 IR、全部 SR、方案文档完整，才自动转为正式需求，并生成各 SR 分支信息。无需个人目录、手填 MR 链接或人工通知；入库仅展示流程状态，不另建 Agent 会话。所有操作只改变后端内存，不执行真实 Git 提交、推送或合并。",
    descriptionEn:
      "After solution confirmation, the demo simulates proposal branch and MR creation, human review and merge. Backend checks admit the requirement only when the simulated proposal branch is merged and all IR, SR and solution documents are complete, then generate SR branch information. No personal directory, manually entered MR URL or manual notification is needed. Intake shows workflow state without a separate agent session. All changes stay in backend memory; no real Git commit, push or merge occurs.",
  },
  {
    section: "开发进度跟踪",
    sectionEn: "Progress tracking",
    title: "安排人员与排期",
    titleEn: "Assign people and dates",
    description:
      "转为正式需求后分配 IR 负责人，安排各 SR 开发人员及计划起止时间，查看依赖、可并行关系和排期冲突。人员与时间属于共享项目的后端内存元数据，不改仓库文档、不新增 PR；平台不执行编码或调度开发。",
    descriptionEn:
      "After conversion to formal requirements, assign an IR owner and SR developers and planned dates. Inspect dependencies, parallel work and scheduling conflicts. People and dates are shared project metadata in backend memory, not repository document changes or new PRs. AIReq does not implement code or schedule coding agents.",
  },
  {
    title: "查看代码证据",
    titleEn: "Inspect code evidence",
    description:
      "正式需求在大表格展示，选择 IR／SR 后在同页右侧查看进度报告和需求材料。报告说明已实现内容、遗留问题、不确定项、代码活动、分支及分析版本。当前报告与代码证据来自模拟样例，不读取真实仓库。",
    descriptionEn:
      "Formal requirements appear in a table. Select an IR or SR to view its report and materials beside the table. Reports include implemented scope, outstanding issues, uncertainty, code activity, branches and analysed revisions. Current reports and code evidence are mock samples; no real repository is read.",
  },
  {
    title: "核对完成条件",
    titleEn: "Check completion criteria",
    description:
      "SR 的 0%～99% 进度仅由分析结果决定。只有已合入默认分支且分析到 99% 时，管理员或 IR 负责人才可填写依据，人工确认到 100%；不能填写其他百分比。IR 进度自动取全部 SR 的算术平均值。当前分析与合入检查均为模拟，但完成门禁仍生效。",
    descriptionEn:
      "Analysis alone determines SR progress from 0% to 99%. Only an administrator or IR owner may confirm a merged SR at 99% as 100%, recording the reason. Other manual percentages are not allowed. IR progress is the arithmetic mean of all its SRs. Analysis and merge checks are simulated here, but completion gates still apply.",
  },
  {
    title: "持续跟踪遗留问题",
    titleEn: "Track outstanding work",
    description:
      "根据新的模拟代码版本持续更新进度和遗留问题；合入不等于完成，排期不等于实际进度。开发者在平台外使用自己的工具开发、测试和评审，AIReq 不提供计划／执行 Agent、固定通过验收或编码交付流水线。",
    descriptionEn:
      "Track progress and outstanding issues against new simulated code revisions. Merging is not completion, and planned dates are not implementation progress. Developers implement, test and review with their own tools outside AIReq. AIReq has no coding-agent pipeline or automatically passing acceptance stage.",
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
              ? "提案沿用三栏：左侧需求列表、中间 AI 讨论、右侧只读材料。阅读材料后在底栏评审、退回或确认方案；点击阶段只查看历史。正式需求使用大表格与同页报告，不显示开发聊天或阶段推进按钮。"
              : "Proposals use three panes: navigation, AI discussion and read-only materials. Use the materials footer to review, return or confirm the solution; stage clicks only view history. Formal requirements use a table and same-page reports, without coding chat or execution controls."}
            {source.provenance.kind === "sample" &&
              (zh
                ? "所有演示操作保存于共享后端内存，刷新保留、后端重启恢复样例。"
                : "Demo changes stay in shared backend memory across reloads and reset on backend restart.")}
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
                    <p className="text-ui-sm leading-6 text-foreground-subtle">
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
