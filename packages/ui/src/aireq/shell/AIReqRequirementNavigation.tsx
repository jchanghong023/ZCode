import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";

/** 返回属于聊天工具栏；复用原导航来源与门禁，不借浏览器后退推断来源。 */
export function AIReqRequirementReturnButton() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const returnToOverview = ai.canReturnToProjectOverview;
  const label = returnToOverview
    ? zh
      ? "返回项目概览"
      : "Back to project overview"
    : zh
      ? "返回需求共创"
      : "Back to co-creation";
  return (
    <ControlHintTooltip title={label}>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 focus-visible:border-remote-foreground-muted"
        aria-label={label}
        onClick={() =>
          returnToOverview
            ? ai.returnToProjectOverview()
            : ai.navigate(() => ai.setMainView("proposals"))
        }
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {label}
      </Button>
    </ControlHintTooltip>
  );
}

/** 非材料详情保留对象身份，不提供重复的复制入口。 */
export function AIReqRequirementContext() {
  const ai = useAIReq()!;
  const group = ai.view?.requirements.find(
    (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
  );
  const sr = ai.view?.srs.find(
    (item) =>
      item.projectId === ai.selection.projectId &&
      item.irId === ai.selection.irId &&
      item.id === ai.selection.srId,
  );
  const title = sr?.title ?? group?.title ?? (ai.selection.srId ? "需求规格" : "需求");
  const subtitle = ai.selection.srId
    ? "需求规格 · SR"
    : group?.archive
      ? "已归档需求 · IR"
      : group
        ? "需求提案 · IR"
        : "只读上下文";
  return (
    <div
      className="shrink-0 space-y-1 border-b border-border/50 px-3 py-2 text-ui-sm"
      data-testid="aireq-requirement-context"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-ui-base font-medium" title={title}>
          {title}
        </span>
      </div>
      <span className="text-ui-sm text-foreground-subtle">{subtitle}</span>
    </div>
  );
}
