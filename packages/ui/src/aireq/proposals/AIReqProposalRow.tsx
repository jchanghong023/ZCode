import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useAIReq } from "../AIReqContext.js";
import { proposalStateLabel, type AIReqRequirementGroup } from "../contract.js";

/** 提案表行：正文直达讨论，行内操作统一默认隐藏（spec：全局想法池），悬停／聚焦显现。 */
export function AIReqProposalRow({ item, zh }: { item: AIReqRequirementGroup; zh: boolean }) {
  const ai = useAIReq()!;
  const open = () => ai.select({ projectId: item.projectId, irId: item.id });
  return (
    <tr
      data-aireq-motion-row=""
      className="group/row border-b border-border/50 hover:bg-hover"
    >
      <td className="hidden px-4 py-4 @min-[640px]/conversation:table-cell">{item.submittedBy}</td>
      <td
        data-aireq-motion-cell=""
        className="max-w-xl whitespace-pre-wrap break-words px-4 py-4"
      >
        {/* 正文应和详情入口一样可直接打开讨论，同时保留键盘操作。 */}
        <div className="flex flex-col items-start gap-2">
          <ControlHintTooltip title={item.originalText}>
            <Button
              variant="link"
              // 修复原因：行悬停底色抬升后 foreground-subtle 对比不足 4.5:1；悬停时升为主文字。
              className="h-auto max-w-full whitespace-pre-wrap break-words p-0 text-left text-foreground-subtle group-hover/row:text-foreground hover:text-foreground"
              onClick={open}
            >
              <span className="line-clamp-3 text-left">{item.originalText}</span>
            </Button>
          </ControlHintTooltip>
          {/* 窄分栏隐藏提交人／日期列时并入正文单元格，筛选判断不必横滚。 */}
          <p className="text-ui-sm text-foreground-subtle group-hover/row:text-foreground @min-[640px]/conversation:hidden">
            {item.submittedBy} ·{" "}
            {new Date(item.createdAt).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </p>
        </div>
      </td>
      {/* 修复原因：行悬停底色上 12px foreground-subtle 实测 4.16:1（<4.5）；悬停时升为主文字。 */}
      <td className="hidden px-4 py-4 text-foreground-subtle group-hover/row:text-foreground @min-[640px]/conversation:table-cell">
        <time
          dateTime={item.createdAt}
          title={`${new Date(item.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} 北京时间`}
        >
          {new Date(item.createdAt).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </time>
      </td>
      <td className="px-4 py-4">{proposalStateLabel(item, zh ? "zh-CN" : "en-US")}</td>
      <td className="px-2 py-4 text-right align-middle">
        <ControlHintTooltip title={zh ? "打开需求工作台" : "Open requirement workspace"}>
          <Button
            variant="ghost"
            size="icon"
            className="pointer-events-none size-8 text-foreground-subtle opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 hover:text-foreground focus-visible:pointer-events-auto focus-visible:text-foreground focus-visible:opacity-100 focus-visible:border-remote-foreground-muted"
            aria-label={
              zh
                ? `查看 ${item.title} 需求工作台`
                : `Open requirement workspace for ${item.title}`
            }
            onClick={open}
          >
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Button>
        </ControlHintTooltip>
      </td>
    </tr>
  );
}