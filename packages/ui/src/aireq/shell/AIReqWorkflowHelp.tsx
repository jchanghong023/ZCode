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
    title: "黄区澄清需求",
    titleEn: "Clarify requirements in the yellow zone",
    description:
      "从「项目总览」打开项目或版本，选择 IR 进入「讨论需求」。用一次实际操作说明输入和预期结果，在右侧对照云龙原文与业务需求。",
    descriptionEn:
      "Open a project or release in Project overview, then discuss an IR. Describe an input and expected result and compare the draft with the original IR on the right.",
  },
  {
    title: "将需求交接到红区",
    titleEn: "Hand requirements to the red zone",
    description:
      "黄区定时单向交接全部项目的 IR 和最新已保存需求，也可点击「同步全部项目到红区」。交接可以包含草稿。IR 详情中的评论发送只在云龙该条需求下追加正文。",
    descriptionEn:
      "All projects’ IRs and saved requirements, including drafts, are handed off in one direction on a schedule or with Sync to red zone. Posting a document in IR details adds a comment to that IR in CloudDragon.",
  },
  {
    title: "红区讨论方案",
    titleEn: "Develop the solution in the red zone",
    description:
      "项目开发和测试进入「讨论方案」，结合代码拆分 SR，在右侧查阅设计和测试方案。可从输入框邀请独立评审，意见回到讨论。",
    descriptionEn:
      "Developers and testers discuss the solution, split the IR into SRs, and read their designs and test plans on the right. Request an independent review from the composer.",
  },
  {
    title: "在本区核对并定版",
    titleEn: "Check and confirm the version",
    description:
      "开发或测试在右侧检查定版条件。黄区核对需求正文，红区核对需求依据和各 SR 材料。确认后记录工号和时间；后续修改开启下一版。",
    descriptionEn:
      "Check the documents on the right. The yellow zone confirms requirements and the red zone confirms their basis and SR deliverables. Confirmation records who signed and when. Later edits start a new version.",
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
