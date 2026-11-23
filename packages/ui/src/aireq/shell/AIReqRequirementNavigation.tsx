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
        size="icon-lg"
        data-aireq-agent-back=""
        aria-label={label}
        onClick={() =>
          returnToOverview
            ? ai.returnToProjectOverview()
            : ai.navigate(() => ai.setMainView("proposals"))
        }
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
      </Button>
    </ControlHintTooltip>
  );
}
