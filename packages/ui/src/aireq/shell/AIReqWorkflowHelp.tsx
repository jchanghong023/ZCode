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

const steps = [
  {
    title: "查看需求",
    titleEn: "Open a requirement",
    description: "从「所有项目」选择云龙项目，再打开要澄清的需求。",
    descriptionEn:
      "Choose a CloudDragon project from All projects, then open a requirement to clarify it.",
  },
  {
    title: "与 Agent 协作",
    titleEn: "Work with the Agents",
    description:
      "所有人可进入需求 Agent，项目开发和测试可进入方案 Agent。在对应聊天中修改文档，或随时让独立子代理评审当前文件。意见回到聊天。",
    descriptionEn:
      "Everyone can open the Requirements Agent. Project developers and testers can open the Solution Agent. Edit documents in chat or request an independent review of the latest files. Feedback appears in chat.",
  },
  {
    title: "查看和确认版本",
    titleEn: "View and confirm versions",
    description:
      "文档区默认显示最新版。首次生成文件时创建 V1，开发或测试确认后固定该版全部文件，记录工号和时间。确认后的首次文件变更开启下一版。已确认的旧版随时可查。",
    descriptionEn:
      "Documents opens on the latest version. The first files start V1. One developer or tester confirms the entire version, recording their employee ID and the time. The next file change starts a new version. Older confirmed versions remain available.",
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
              ? "在需求共创讨论需求、完善方案和查阅文档。"
              : "Discuss requirements, develop solutions, and read documents in Co-creation."}
          </DialogDescription>
        </DialogHeader>
        <div
          className="min-h-0 overflow-y-auto px-6 pb-5"
          tabIndex={0}
          aria-label={zh ? "完整业务流程" : "Complete workflow"}
        >
          <p className="mb-4 text-ui-sm leading-6 text-foreground-subtle">
            {zh
              ? "「所有项目」汇总各个项目。「需求共创」按侧栏所选项目展示。"
              : "All projects shows the project overview. Co-creation follows the project selected in the sidebar."}
          </p>
          <p className="mb-4 text-ui-sm leading-6 text-foreground-subtle">
            {zh
              ? "设置分为外观、项目配置、AI 配置和文档格式；AI 配置包含模型和共享 Agent 指令。离开未保存表单时可保存、丢弃或取消，取消保留当前输入；往返设置保留未发送的讨论与附件。"
              : "Settings includes Appearance, Project configuration, AI configuration and Document formats. AI configuration includes models and shared Agent instructions. Save, discard or cancel when leaving an unsaved form; cancel keeps your input. Returning from settings preserves unsent discussion text and attachments."}
          </p>
          <ol className="space-y-3">
            {steps.map((step) => (
              <li key={step.title} className="space-y-1">
                <h3 className="text-ui-base font-medium">{zh ? step.title : step.titleEn}</h3>
                <p className="text-ui-base leading-6 text-foreground">
                  {zh ? step.description : step.descriptionEn}
                </p>
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
