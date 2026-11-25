import { Folders, FolderGit2, MessagesSquare, Tag, Users } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import aireqMarkUrl from "@/assets/aireq-mark.png";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqMainView } from "../contract.js";

type SidebarPage = {
  view: AIReqMainView;
  label: string;
  labelEn: string;
  icon: typeof Folders;
};

const globalPages = [
  { view: "projectProgress", label: "所有项目", labelEn: "All projects", icon: Folders },
] satisfies SidebarPage[];

const coCreationPage = {
  view: "proposals",
  label: "需求共创",
  labelEn: "Co-creation",
  icon: MessagesSquare,
} satisfies SidebarPage;

export function AIReqSidebarNavigation() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const releases = ai.view?.releases.filter((item) => item.projectId === project?.id) ?? [];
  const release = releases.find((item) => item.id === ai.selection.releaseId);
  const selected = ai.mainView === "chat" ? "proposals" : ai.mainView;
  // 角色管理在页面内选择项目，无需沿用侧栏的项目 范围。
  const inWorkspace = selected !== "roles" && globalPages.every((page) => page.view !== selected);
  const renderPage = ({ view, label, labelEn, icon: Icon }: SidebarPage) => (
    <Button
      key={view}
      variant="ghost"
      size="lg"
      // 全局焦点样式会清除 outline 和阴影；复用按钮已有边框标出键盘焦点，行宽不变。
      className="h-auto min-h-9 w-full justify-start gap-3 py-2 [@media(max-height:740px)]:min-h-8 [@media(max-height:740px)]:py-1 focus-visible:border-remote-foreground-muted aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:hover:bg-selected"
      aria-current={selected === view ? "page" : undefined}
      data-aireq-motion-nav=""
      onClick={() => ai.navigate(() => ai.setMainView(view))}
    >
      <Icon
        className={`size-4 ${selected === view ? "text-foreground" : "text-remote-foreground-muted"}`}
        aria-hidden="true"
      />
      <span data-aireq-motion-label="" className="min-w-0 flex-1 truncate text-left">
        {zh ? label : labelEn}
      </span>
    </Button>
  );
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2 px-4">
        <img
          src={aireqMarkUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="size-8 shrink-0 select-none object-contain"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span lang="zh-CN" className="text-ui-lg leading-tight font-semibold text-foreground">
            AI 需求协作
          </span>
          <span lang="en" className="text-ui-sm leading-none text-remote-foreground-muted">
            AI Requirements
          </span>
        </div>
      </div>
      <nav
        aria-label={zh ? "全局导航" : "Global navigation"}
        className="flex shrink-0 flex-col gap-1 px-3 pb-3"
      >
        {globalPages.map(renderPage)}
      </nav>
      {inWorkspace && (
        <section
          aria-label={zh ? "项目工作区" : "Project workspace"}
          className="mx-3 flex min-h-0 flex-1 flex-col border-t border-border pt-2"
        >
          {/* 范围区固定在滚动区外：页面分组滚动时项目 始终可见，切范围不必先找回选择器。 */}
          <div className="shrink-0 pb-2">
            <section
              aria-label={zh ? "当前工作范围" : "Current workspace"}
              className="space-y-0.5 rounded-xl border border-border/70 p-1"
            >
              <Select
                value={project?.id ?? ""}
                onValueChange={(id) => ai.navigate(() => ai.switchProject(id))}
                disabled={!ai.view?.projects.length}
              >
                <SelectTrigger
                  variant="ghost"
                  className="h-auto min-h-12 w-full min-w-0 justify-start gap-3 rounded-lg px-2.5 py-2 text-left focus-visible:border-remote-foreground-muted data-[state=open]:bg-selected"
                  aria-labelledby="sidebar-project-label"
                  title={project?.name}
                >
                  <FolderGit2 className="size-4 text-foreground-subtle" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      id="sidebar-project-label"
                      className="text-ui-sm leading-4 text-remote-foreground-muted"
                    >
                      {zh ? "项目" : "Project"}
                    </span>
                    <SelectValue
                      className="block truncate text-ui-base leading-5 font-semibold text-foreground"
                      placeholder={zh ? "未选择项目" : "Choose project"}
                    />
                  </span>
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  sideOffset={6}
                  className="w-(--radix-select-trigger-width) [&_[data-position=popper]]:min-w-0"
                >
                  {ai.view?.projects.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {project && (
                <>
                  <div className="mx-2.5 border-t border-border/50" aria-hidden="true" />
                  <Select
                    value={release ? `release:${release.id}` : "all"}
                    onValueChange={(value) =>
                      ai.openProject(
                        project.id,
                        value === "all" ? undefined : value.slice("release:".length),
                      )
                    }
                    disabled={!ai.selectionReady || !releases.length}
                  >
                    <SelectTrigger
                      variant="ghost"
                      className="h-auto min-h-12 w-full min-w-0 justify-start gap-3 rounded-lg px-2.5 py-2 text-left focus-visible:border-remote-foreground-muted data-[state=open]:bg-selected"
                      aria-labelledby="sidebar-release-label"
                      title={release?.title}
                    >
                      <Tag className="size-4 text-foreground-subtle" aria-hidden="true" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span
                          id="sidebar-release-label"
                          className="text-ui-sm leading-4 text-remote-foreground-muted"
                        >
                          Release
                        </span>
                        <SelectValue className="block truncate text-ui-base leading-5 text-foreground" />
                      </span>
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      align="start"
                      sideOffset={6}
                      className="w-(--radix-select-trigger-width)"
                    >
                      <SelectItem value="all">{zh ? "全部需求" : "All requirements"}</SelectItem>
                      {releases.map((item) => (
                        <SelectItem key={item.id} value={`release:${item.id}`}>
                          {item.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </section>
          </div>
          <nav
            aria-label={zh ? "项目导航" : "Project navigation"}
            className="min-h-0 space-y-1 overflow-y-auto pb-3 [@media(max-height:740px)]:space-y-0.5"
          >
            {renderPage(coCreationPage)}
          </nav>
        </section>
      )}
      {!inWorkspace && <div className="flex-1" />}
      <div className="shrink-0 px-3 pb-2">
        {renderPage({
          view: "roles",
          label: "角色管理",
          labelEn: "Role management",
          icon: Users,
        })}
      </div>
    </>
  );
}
