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
      "登录后查看只读项目总览。通过左侧选择项目和具体 Release，再进入当前项目、需求共创、开发任务、进度分析或我的待办。项目总览和想法池跨项目，其余页面按所选项目与 Release 展示；项目和版本在设置中配置。",
    descriptionEn:
      "Sign-in opens the read-only project overview. Choose a project and Release in the sidebar before opening project tasks, requirements, analysis or todos. Projects and Ideas are global; the other pages use the selected project and Release. Manage projects and releases in Settings.",
  },
  {
    section: "待办与提案",
    sectionEn: "Todos and proposals",
    title: "保存原始短需求",
    titleEn: "Save the original request",
    // 进入讨论只加载历史，帮助文案须遵守显式发送才执行的接纳边界。
    description:
      "待办按当前项目与 Release 展示我的、待认领和全部事项，点击事项进入对应需求或任务。未排期需求可先保存到全局想法池，确定后转入一个或多个项目／版本；全部成功后原想法消失。已确定版本的需求也可从“需求共创”新增或导入。CSV 为 UTF-8 单列“原始需求”；空行跳过，重复提示但保留，导出包含全部筛选原文。IR 业务需求文档可导入 Markdown，预览并单独确认短需求后保存；导出时选择一个 IR 的有效业务文档。保存或导入不发送消息。进入需求澄清后，显式发送才开始本次讨论；业务文档校验通过后自动评审，业务确认后开放方案设计。",
    descriptionEn:
      "Todos show Mine, Unassigned and All in the selected project and Release. Open an item to reach its task. Move unplanned Ideas to project releases once scheduled; moving consumes the idea. CSV lists original requests, skipping blanks and retaining duplicates; export includes every filtered request. Import a business document as Markdown after previewing it and confirming a separate short request. Markdown export downloads one IR's valid business document. Saving or importing sends no messages. Clarification starts when you send a message. A validated business document is reviewed automatically; business confirmation unlocks solution design.",
  },
  {
    title: "从需求工作台进入任务",
    titleEn: "Open tasks from the requirement workspace",
    description:
      "提案入口先到需求工作台，查看当前进展和下一项待办，再进入需求澄清、需求评审、方案设计、方案审查或交付确认。汇总页没有聊天框；点击具体审查进入独立详情和专属会话，返回仍回到汇总。评审完成仍需人工确认，原始短需求始终独立保留。提案状态按当前有效材料、评审和确认分为未启动、IR 待评审、IR 待确认、方案待完善、方案待评审、方案待确认、待提交、待合入；材料变化会重新判断状态，转正后移入正式需求。",
    descriptionEn:
      "Open a proposal to view its workspace, progress and next action. Enter clarification, requirements review, solution design, solution review or delivery as separate tasks. Summaries have no chat input; each reviewer opens an independent detail page and conversation, returning to its summary. Completed reviews still require human confirmation. The original request remains separate. Status follows current valid materials, reviews and confirmations: Not started, IR review pending, IR confirmation pending, Solution incomplete, Solution review pending, Solution confirmation pending, Submission pending and Merge pending. Material changes recalculate status. Verified merged proposals move to formal requirements.",
  },
  {
    title: "每 SR 独立完整包",
    titleEn: "An independent complete package per SR",
    description:
      "在方案设计中与 AI 完善各 SR 的 proposal、design、tasks、specs 和追溯业务验收的 test-plan；每个 SR 是独立 OpenSpec change。IR 保留业务需求和权威依赖 JSON。文件缺失或格式校验失败时，页面显示具体文件和原因；历史材料在右侧只读。平台不执行开发任务或构建测试。",
    descriptionEn:
      "Develop each SR's independent OpenSpec change: proposal, design, tasks, specs and a business-traceable test plan. The IR retains the business requirements and authoritative dependency JSON. Missing or invalid files are listed with their reasons. Historical materials are read-only in the materials pane. AIReq never executes development tasks, builds or tests.",
  },
  {
    title: "自动审查与三方确认",
    titleEn: "Automatic reviews and three role confirmations",
    description:
      "完整材料通过校验后自动启动三路审查，再由方案综审 Agent 汇总。只有执行失败或缺报告时才重试。当前报告齐备可读后，业务、开发和测试分别确认；是否采纳意见由确认人判断，同一工号可分别承担三方，已确认角色保留原记录。材料更新按受影响范围重新校验、评审和确认，旧报告与确认只读。",
    descriptionEn:
      "Validated solution materials automatically start three independent reviews followed by synthesis. Retry only failed or missing reports. Once current reports are readable and complete, business, development and testing confirm separately. The confirmers decide whether to act on the findings. One employee can fill all roles; each role retains its first decision. Material changes invalidate only affected reviews and decisions, keeping history read-only.",
  },
  {
    title: "一个 IR 一个文档 PR",
    titleEn: "One document PR per IR",
    description:
      "三方齐全后，核对完整文件清单并明确授权提交文档 PR。失败后重试同一候选，复用已创建分支和已推送材料。PR 打开期间材料冻结，修改前须关闭未合入 PR；同一候选合入且核验完整后，以原 ID 转正。各 SR 以同一文档合入提交为基点创建开发分支；只有失败分支需要单独重试。",
    descriptionEn:
      "After all roles confirm, check every file and explicitly authorize submission of one document PR. A retry reuses the same candidate and completed branch or push steps. An open PR freezes its materials; close it before editing. The same candidate must merge and pass verification to become formal without changing its ID. Each SR gets a development branch from the document merge commit; retry only the failed branch.",
  },
  {
    section: "交付进度与分析运行",
    sectionEn: "Delivery progress and analysis runs",
    title: "分工与统一分析",
    titleEn: "Ownership and unified analysis",
    description:
      "需求转正后保留原有身份、讨论与材料。在“开发任务”中，以 IR 为主行、SR 为子行，同页查看当前状态、问题、材料和报告。人员可指定、认领和代办；待办按当前项目与 Release 展示。项目内“进度分析”查看当前范围的任务、执行历史与失败重试，自动分析周期和项目配置在“设置 → AI 配置 → 分析设置”中调整。分析失败保留上次成功结果，旧版本结果不能覆盖新事实。",
    descriptionEn:
      "Formal requirements retain their original identity, discussions and materials. Development tasks shows IR parent rows and SR children, with same-page status, issues, materials and reports. Assign, claim or act on behalf of others; todos follow the selected project and Release. Progress analysis shows tasks, execution history and retries in the current project scope. Adjust scheduling and project analysis configuration in Settings → AI configuration → Analysis settings. Failed analyses retain the last success and stale results cannot replace newer facts.",
  },
  {
    title: "合入 99%、人工验收 100%",
    titleEn: "Merged at 99%, accepted at 100%",
    description:
      "首次代码合入后停止该 SR 的进度分析，进度为 99%，不需要先有成功的分析报告。人工确认通过并填写依据后，进度变为 100%；测试发现问题时仍待验收，不在此流程追踪修复。IR 是全部 SR 的等权平均，全部 SR 完成后才可再次确认清理登记分支；逐项保留失败，不删主分支、材料或历史。",
    descriptionEn:
      "After the first code merge, analysis stops and progress stays at 99%, even without a successful analysis report. Human acceptance with evidence raises it to 100%. If testing finds a problem, the SR stays pending; this workflow does not track fixes. IR progress averages all SRs. Only after every SR completes may a confirmed cleanup remove registered development branches, retaining failures, the default branch, materials and history.",
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
              ? "项目总览和想法池跨项目；我的待办与其余页面按侧栏所选项目与 Release 展示。在总览选择“查看提案”可打开该版本的需求共创，也可在侧栏切换项目、版本和页面。同一需求从澄清到验收持续保留讨论、材料与记录。待办完成实际事项后自动消失，无需手工勾选完成。"
              : "Projects and Ideas span all projects. My todos and the other pages follow the selected project and release. Open a release’s proposals from the overview, or switch projects, releases and pages in the sidebar. Each requirement retains its discussions, materials and records from clarification through acceptance. Todos disappear when their actual work is complete."}
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
