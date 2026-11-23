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
    title: "从所有项目进入版本工作区",
    titleEn: "Start with a project",
    description:
      "登录后打开「所有项目」。选择版本的「进入工作区」打开项目概览，再使用侧栏进入需求共创。侧栏可切换项目和版本，项目和版本在设置中配置。",
    descriptionEn:
      "Sign-in opens All projects. Choose Enter workspace on a release to open its project overview, then use the sidebar to open Co-creation. Switch projects and releases in the sidebar. Manage projects and releases in Settings.",
  },
  {
    section: "想法与提案",
    sectionEn: "Ideas and proposals",
    title: "保存原始短需求",
    titleEn: "Save the original request",
    // 进入讨论只加载历史，帮助文案须遵守显式发送才执行的接纳边界。
    description:
      "未排期需求可先保存到全局想法池，确定后转入一个或多个项目／版本；全部成功后原想法消失。已确定版本的需求可从「项目概览」或「需求共创」新建，也可从「需求共创」导入。CSV 为 UTF-8 单列“原始需求”；空行跳过，重复提示但保留，导出包含全部筛选原文。IR 业务需求文档可导入 Markdown，预览并单独确认短需求后保存；导出时选择一个 IR 的有效业务文档。保存或导入不发送消息。进入需求澄清后，显式发送才开始本次讨论；业务文档校验通过后由用户提交需求评审，业务确认后开放方案设计。",
    descriptionEn:
      "Move unplanned Ideas to project releases once scheduled; moving consumes the idea. Create requirements from Project overview or Co-creation. To import, use Co-creation. CSV lists original requests, skipping blanks and retaining duplicates; export includes every filtered request. Import a business document as Markdown after previewing it and confirming a separate short request. Markdown export downloads one IR's valid business document. Saving or importing sends no messages. Clarification starts when you send a message. Submit the validated business document for review; business confirmation unlocks solution design.",
  },
  {
    title: "从需求工作台进入任务",
    titleEn: "Open tasks from the requirement workspace",
    description:
      "提案入口先到需求工作台，查看当前进展和下一项操作，再进入需求澄清、需求评审、方案设计、方案审查或交付确认。评审汇总直接显示当前报告。评审完成仍需人工确认，原始短需求始终独立保留。提案状态按当前有效材料、评审和确认分为未启动、IR 待评审、IR 待确认、方案待完善、方案待评审、方案待确认、待提交；材料变化会重新判断状态，转正后在需求共创显示为已归档。",
    descriptionEn:
      "Open a proposal to view its workspace, progress and next action. Enter clarification, requirements review, solution design, solution review or delivery as separate tasks. Review summaries open directly to the current report. Completed reviews still require human confirmation. The original request remains separate. Status follows current valid materials, reviews and confirmations: Not started, IR review pending, IR confirmation pending, Solution incomplete, Solution review pending, Solution confirmation pending, and Submission pending. Material changes recalculate status. After verification, the requirement appears as Archived in Co-creation.",
  },
  {
    title: "每 SR 独立完整包",
    titleEn: "An independent complete package per SR",
    description:
      "在方案设计中与 AI 完善各 SR 的 proposal、design、tasks、specs 和追溯业务验收的 test-plan；每个 SR 是独立 OpenSpec change。IR 保留业务需求和权威依赖 JSON。文件缺失或格式校验失败时，页面显示具体文件和原因；历史材料在右侧只读。",
    descriptionEn:
      "Develop each SR's independent OpenSpec change: proposal, design, tasks, specs and a business-traceable test plan. The IR retains the business requirements and authoritative dependency JSON. Missing or invalid files are listed with their reasons. Historical materials are read-only in the materials pane.",
  },
  {
    title: "提交审查与三方确认",
    titleEn: "Review submission and three role confirmations",
    description:
      "完整材料通过校验后，由用户提交并启动三路审查，再由方案综审 Agent 汇总。只有执行失败或缺报告时才重试。当前报告齐备可读后，业务、开发和测试分别确认；是否采纳意见由确认人判断，同一工号可分别承担三方，已确认角色保留原记录。材料更新后按受影响范围校验，由人重新提交评审并确认，旧报告与确认只读。",
    descriptionEn:
      "Submitting validated solution materials starts three independent reviews followed by synthesis. Retry only failed or missing reports. Once current reports are readable and complete, business, development and testing confirm separately. The confirmers decide whether to act on the findings. One employee can fill all roles; each role retains its first decision. Material changes invalidate only affected reviews and decisions, keeping history read-only.",
  },
  {
    title: "提交归档",
    titleEn: "Archive documents",
    description:
      "三方确认后，开发人员核对完整文件清单并提交归档。成功后可在同一需求的归档详情查阅完整材料和历史。",
    descriptionEn:
      "After all roles confirm, a project developer checks every file and submits it for archiving. Read the complete materials and history in the archived requirement.",
  },
  {
    title: "查阅已归档需求",
    titleEn: "Read formal documents",
    // 弹窗按语言读取 description 和 descriptionEn，字段不匹配会导致正文空白。
    description: "提交归档后，在当前版本的「已归档需求」查看原始需求、规格、方案及讨论评审历史。",
    descriptionEn:
      "After the documents are archived, open archived requirements for the original requirement, specifications, design and review history.",
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
              ? "从原始需求出发，协作澄清、评审并交付已归档需求。IR 是整体需求，SR 是拆分后可独立描述的需求规格。"
              : "Clarify, review and deliver formal documents from an initial requirement. An IR is the overall requirement and an SR is a separately defined system requirement."}
          </DialogDescription>
        </DialogHeader>
        <div
          className="min-h-0 overflow-y-auto px-6 pb-5"
          tabIndex={0}
          aria-label={zh ? "完整业务流程" : "Complete workflow"}
        >
          <p className="mb-4 text-ui-sm leading-6 text-foreground-subtle">
            {zh
              ? "「所有项目」和「想法池」跨项目。版本工作区的页面按侧栏所选项目与版本展示。"
              : "All projects and Ideas span all projects. Workspace pages follow the project and release selected in the sidebar."}
          </p>
          <p className="mb-4 text-ui-sm leading-6 text-foreground-subtle">
            {zh
              ? "设置分为外观、项目配置、AI 配置和文档格式；AI 配置包含模型和共享 Agent 指令。离开未保存表单时可保存、丢弃或取消，取消保留当前输入；往返设置保留未发送的讨论与附件。"
              : "Settings includes Appearance, Project configuration, AI configuration and Document formats. AI configuration includes models and shared Agent instructions. Save, discard or cancel when leaving an unsaved form; cancel keeps your input. Returning from settings preserves unsent discussion text and attachments."}
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
