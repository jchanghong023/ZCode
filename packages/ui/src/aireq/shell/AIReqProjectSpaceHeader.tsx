import { ArrowLeft, Copy, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useAIReq } from "../AIReqContext.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "./pageLayout.js";

export function AIReqProjectSpaceHeader({ onManageProjects }: { onManageProjects(): void }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const { writeClipboardText } = usePlatform();
  const [copiedLink, setCopiedLink] = useState("");
  const [copyError, setCopyError] = useState("");
  const zh = locale === "zh-CN";
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const releases = ai.view?.releases.filter((item) => item.projectId === project?.id) ?? [];
  const release = releases.find((item) => item.id === ai.releaseId);
  const formalGroup = ai.view?.groups.find(
    (item) => item.projectId === project?.id && item.id === ai.selection.irId,
  );
  const proposal = ai.view?.drafts.find(
    (item) => item.projectId === project?.id && item.id === ai.selection.irId,
  );
  const group = formalGroup ?? proposal;
  const groupRelease = releases.find((item) => item.id === group?.releaseId);
  const sr = ai.view?.srs.find(
    (item) =>
      item.projectId === project?.id &&
      item.irId === ai.selection.irId &&
      item.id === ai.selection.srId,
  );
  // 详情仍属于需求；仅从唯一导航和目标归属派生选中，不另存一份页签。
  const proposalView =
    ai.mainView === "proposals" ||
    (ai.mainView === "chat" && !ai.selection.formalView && !formalGroup);
  const requirementView =
    ai.mainView === "proposals" || ai.mainView === "formal" || ai.mainView === "chat"
      ? proposalView
        ? "proposals"
        : "formal"
      : ai.requirementView;
  const section =
    ai.mainView === "projectOverview"
      ? "overview"
      : ai.mainView === "requirementAnalysis"
        ? "analysis"
        : "requirements";
  const detail = ai.mainView === "chat" && Boolean(ai.selection.irId);
  const returnLabel = proposalView
    ? zh
      ? "返回提案列表"
      : "Back to proposals"
    : zh
      ? "返回正式需求列表"
      : "Back to formal requirements";

  return (
    <header className="shrink-0 border-b border-border/50" data-testid="aireq-project-space-header">
      <div className={`mx-auto min-w-0 space-y-3 px-2 pt-3 pb-2 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
        {/* 较窄窗口为固定历史按钮让位，宽窗口仍与居中正文对齐。 */}
        <div className="flex flex-wrap items-center gap-2 [padding-left:max(0px,calc(4.75rem_-_(100cqw_-_100%)_/_2))]">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1 text-foreground-subtle"
            onClick={() => ai.navigate(() => ai.setMainView("projectProgress"))}
          >
            <ArrowLeft className="size-3.5" />
            {zh ? "全部项目" : "All projects"}
          </Button>
          <Select
            value={project?.id ?? ""}
            onValueChange={(id) => ai.navigate(() => ai.switchProject(id))}
            disabled={!ai.view?.projects.length}
          >
            <SelectTrigger
              className="w-60 max-w-full bg-surface"
              aria-label={zh ? "当前项目" : "Current project"}
            >
              <SelectValue placeholder={zh ? "选择项目" : "Choose project"} />
            </SelectTrigger>
            <SelectContent>
              {ai.view?.projects.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={release?.id ?? "all"}
            onValueChange={(id) => ai.navigate(() => ai.setReleaseId(id === "all" ? "" : id))}
            disabled={!project || !releases.length}
          >
            <SelectTrigger
              className="w-52 max-w-full bg-surface"
              aria-label={zh ? "当前 Release" : "Current Release"}
            >
              <SelectValue placeholder={zh ? "选择 Release" : "Choose Release"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{zh ? "全部 Release" : "All Releases"}</SelectItem>
              {releases.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ControlHintTooltip title={zh ? "项目配置" : "Project settings"}>
            <Button
              variant="ghost"
              size="icon-md"
              className="ml-auto shrink-0"
              aria-label={zh ? "项目配置" : "Project settings"}
              onClick={onManageProjects}
            >
              <Settings2 className="size-4" />
            </Button>
          </ControlHintTooltip>
        </div>
        {(!project || !releases.length) && (
          <div className="flex flex-wrap items-center gap-2 text-ui-sm text-foreground-subtle">
            <span>
              {!project
                ? zh
                  ? "请选择项目，或添加项目配置。"
                  : "Choose a project or add project settings."
                : zh
                  ? "当前项目尚无 Release。"
                  : "This project has no Releases."}
            </span>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={onManageProjects}>
              {zh ? "管理项目与 Release" : "Manage projects and Releases"}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Tabs
            value={section}
            onValueChange={(value) =>
              ai.navigate(() =>
                ai.setMainView(
                  value === "overview"
                    ? "projectOverview"
                    : value === "requirements"
                      ? requirementView
                      : "requirementAnalysis",
                ),
              )
            }
          >
            <TabsList variant="line" aria-label={zh ? "项目空间页面" : "Project space pages"}>
              <TabsTrigger value="overview" className="px-3">
                {zh ? "概览" : "Overview"}
              </TabsTrigger>
              <TabsTrigger value="requirements" className="px-3">
                {zh ? "需求" : "Requirements"}
              </TabsTrigger>
              <TabsTrigger value="analysis" className="px-3">
                {zh ? "分析运行" : "Analysis runs"}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {section === "requirements" && (
            <Tabs
              value={requirementView}
              onValueChange={(value) =>
                ai.navigate(() => ai.setMainView(value === "proposals" ? "proposals" : "formal"))
              }
            >
              <TabsList aria-label={zh ? "需求视图" : "Requirement views"}>
                <TabsTrigger value="proposals" className="px-3">
                  {zh ? "提案" : "Proposals"}
                </TabsTrigger>
                <TabsTrigger value="formal" className="px-3">
                  {zh ? "正式" : "Formal"}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
        {detail && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-2 text-ui-sm">
            <span className="min-w-0 flex-1 truncate font-medium" title={sr?.title ?? group?.title}>
              {sr?.title ?? group?.title ?? ai.selection.irId}
            </span>
            {groupRelease && <span className="text-foreground-subtle">{groupRelease.title}</span>}
            <span className="shrink-0 font-mono text-foreground-subtle">
              {ai.selection.srId ?? ai.selection.irId}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!ai.objectLink()}
              onClick={async () => {
                const link = ai.objectLink();
                if (!link) return;
                try {
                  await writeClipboardText(link);
                  setCopiedLink(link);
                  setCopyError("");
                } catch (cause) {
                  setCopiedLink("");
                  setCopyError(cause instanceof Error ? cause.message : String(cause));
                }
              }}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {copiedLink && copiedLink === ai.objectLink()
                ? zh
                  ? "已复制"
                  : "Copied"
                : zh
                  ? "复制链接"
                  : "Copy link"}
            </Button>
            {copyError && (
              <span role="alert" className="text-destructive">
                {zh ? "复制失败：" : "Copy failed: "}
                {copyError}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => ai.navigate(() => ai.setMainView(requirementView))}
            >
              {returnLabel}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
