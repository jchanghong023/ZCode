import { ArrowLeft, Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "./pageLayout.js";

/** 二级视图归需求内容区；选中仍从唯一导航派生，不另存页签状态。 */
export function AIReqRequirementViews() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const formal =
    ai.mainView === "formal" ||
    (ai.mainView === "chat" &&
      Boolean(
        ai.selection.formalView ||
        ai.view?.groups.some(
          (group) => group.projectId === ai.selection.projectId && group.id === ai.selection.irId,
        ),
      ));
  return (
    <Tabs
      value={formal ? "formal" : "proposals"}
      onValueChange={(value) =>
        ai.navigate(() => ai.setMainView(value === "formal" ? "formal" : "proposals"))
      }
      className="shrink-0"
    >
      <TabsList aria-label={zh ? "需求视图" : "Requirement views"}>
        <TabsTrigger value="proposals">{zh ? "提案" : "Proposals"}</TabsTrigger>
        <TabsTrigger value="formal">{zh ? "正式" : "Formal"}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/** 详情身份和返回动作随实际面板展示，避免全宽页头与右侧对象脱节。 */
export function AIReqRequirementContext({ discussion = false }: { discussion?: boolean }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const { writeClipboardText } = usePlatform();
  const [copiedLink, setCopiedLink] = useState("");
  const [copyError, setCopyError] = useState<{ link: string; message: string }>();
  const zh = locale === "zh-CN";
  const formal = ai.view?.groups.find(
    (group) => group.projectId === ai.selection.projectId && group.id === ai.selection.irId,
  );
  const group =
    formal ??
    ai.view?.drafts.find(
      (draft) => draft.projectId === ai.selection.projectId && draft.id === ai.selection.irId,
    );
  const sr = ai.view?.srs.find(
    (item) =>
      item.projectId === ai.selection.projectId &&
      item.irId === ai.selection.irId &&
      item.id === ai.selection.srId,
  );
  const release = ai.view?.releases.find(
    (item) => item.projectId === ai.selection.projectId && item.id === group?.releaseId,
  );
  const link = ai.objectLink();
  const isFormal = Boolean(formal || ai.selection.formalView);
  const returnLabel = isFormal
    ? zh
      ? "返回正式需求列表"
      : "Back to formal requirements"
    : zh
      ? "返回提案列表"
      : "Back to proposals";
  const copyLabel =
    copiedLink && copiedLink === link ? (zh ? "已复制" : "Copied") : zh ? "复制链接" : "Copy link";
  return (
    <div
      className={
        discussion
          ? "shrink-0 overflow-y-auto border-b border-border/50 py-2 text-ui-sm [scrollbar-gutter:stable_both-edges]"
          : "shrink-0 space-y-1 border-b border-border/50 px-3 py-2 text-ui-sm"
      }
      data-testid="aireq-requirement-context"
    >
      <div
        className={
          discussion ? `mx-auto min-w-0 space-y-1 px-2 ${AIREQ_CONTENT_WIDTH_CLASSNAME}` : undefined
        }
      >
        <div className="flex min-w-0 items-center gap-2">
          {!discussion && (
            <ControlHintTooltip title={returnLabel}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={returnLabel}
                onClick={() => ai.navigate(() => ai.setMainView(isFormal ? "formal" : "proposals"))}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Button>
            </ControlHintTooltip>
          )}
          <span
            className="min-w-0 flex-1 truncate text-ui-base font-medium"
            title={sr?.title ?? group?.title}
          >
            {sr?.title ?? group?.title ?? ai.selection.irId}
          </span>
          <ControlHintTooltip title={copyLabel}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label={copyLabel}
              disabled={!link}
              onClick={async () => {
                if (!link) return;
                try {
                  await writeClipboardText(link);
                  setCopiedLink(link);
                  setCopyError(undefined);
                } catch (cause) {
                  setCopiedLink("");
                  setCopyError({
                    link,
                    message: cause instanceof Error ? cause.message : String(cause),
                  });
                }
              }}
            >
              {copiedLink && copiedLink === link ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
            </Button>
          </ControlHintTooltip>
          <span role="status" className="sr-only">
            {copiedLink && copiedLink === link ? copyLabel : ""}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-foreground-subtle">
          <span className="shrink-0 font-mono">{ai.selection.srId ?? ai.selection.irId}</span>
          {release && (
            <span className="min-w-0 truncate" title={release.title}>
              {release.title}
            </span>
          )}
        </div>
        {copyError && copyError.link === link && (
          <p role="alert" className="break-words text-destructive">
            {zh ? "复制失败：" : "Copy failed: "}
            {copyError.message}
          </p>
        )}
      </div>
    </div>
  );
}
