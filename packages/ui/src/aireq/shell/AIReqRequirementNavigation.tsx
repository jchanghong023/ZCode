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
  const formal =
    ai.selection.formalView ||
    ai.view?.groups.some(
      (group) => group.projectId === ai.selection.projectId && group.id === ai.selection.irId,
    );
  const destination = ai.requirementReturnView ?? (formal ? "formal" : "proposals");
  const label = ai.canReturnToProjectOverview
    ? zh
      ? "返回当前项目"
      : "Back to current project"
    : destination === "formal"
      ? zh
        ? "返回正式需求列表"
        : "Back to formal requirements"
      : zh
        ? "返回提案列表"
        : "Back to proposals";
  return (
    <ControlHintTooltip title={label}>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 focus-visible:border-remote-foreground-muted"
        aria-label={label}
        onClick={() =>
          ai.canReturnToProjectOverview
            ? ai.returnToProjectOverview()
            : ai.navigate(() => ai.setMainView(destination))
        }
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {label}
      </Button>
    </ControlHintTooltip>
  );
}

/** 非材料详情保留对象身份，不提供重复的复制入口。 */
export function AIReqRequirementContext({ showReturn = true }: { showReturn?: boolean }) {
  const ai = useAIReq()!;
  const group = [...(ai.view?.groups ?? []), ...(ai.view?.drafts ?? [])].find(
    (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
  );
  const sr = ai.view?.srs.find(
    (item) =>
      item.projectId === ai.selection.projectId &&
      item.irId === ai.selection.irId &&
      item.id === ai.selection.srId,
  );
  const formal = Boolean(
    ai.view?.groups.some(
      (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
    ),
  );
  const title = sr?.title ?? group?.title ?? (ai.selection.srId ? "开发单元" : "需求");
  const subtitle = ai.selection.srId
    ? "开发单元 · SR"
    : formal
      ? "正式需求 · IR"
      : group
        ? "需求提案 · IR"
        : "只读上下文";
  return (
    <div
      className="shrink-0 space-y-1 border-b border-border/50 px-3 py-2 text-ui-sm"
      data-testid="aireq-requirement-context"
    >
      <div className="flex min-w-0 items-center gap-2">
        {showReturn && <AIReqRequirementReturnButton />}
        <span className="min-w-0 flex-1 truncate text-ui-base font-medium" title={title}>
          {title}
        </span>
      </div>
      <span className="text-ui-sm text-foreground-subtle">{subtitle}</span>
    </div>
  );
}
