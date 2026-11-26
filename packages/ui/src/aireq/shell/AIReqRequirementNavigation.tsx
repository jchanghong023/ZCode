import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";

export function AIReqRequirementReturnButton() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const overview = ai.discussionFromOverview;
  const zh = locale === "zh-CN";
  const label = overview
    ? zh
      ? "返回项目总览"
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
          ai.navigate(() => ai.setMainView(overview ? "projectProgress" : "proposals"))
        }
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
      </Button>
    </ControlHintTooltip>
  );
}
