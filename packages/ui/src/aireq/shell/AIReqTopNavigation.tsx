import { Folders, MessagesSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import aireqMarkUrl from "@/assets/aireq-mark.png";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqMainView } from "../contract.js";

export function AIReqTopNavigation({ overviewReleaseId }: { overviewReleaseId?: string }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const selected = ai.mainView === "chat" ? "proposals" : ai.mainView;
  const projectId = ai.selection.projectId ?? ai.view?.projects[0]?.id;
  function go(view: AIReqMainView) {
    if (
      view === "proposals" &&
      projectId &&
      (ai.mainView === "projectProgress" || !ai.selection.projectId)
    ) {
      ai.openProject(projectId, ai.mainView === "projectProgress" ? overviewReleaseId : undefined);
    } else {
      ai.navigate(() => ai.setMainView(view));
    }
  }
  function page(view: AIReqMainView, label: string, Icon: typeof Folders) {
    return (
      <Button
        type="button"
        size="lg"
        variant="ghost"
        data-aireq-motion-nav=""
        aria-current={selected === view ? "page" : undefined}
        disabled={
          view === "proposals" &&
          (!projectId || (ai.mainView === "projectProgress" && !ai.selectionReady))
        }
        onClick={() => go(view)}
        className="h-9 gap-2 px-3 text-foreground-subtle focus-visible:border-input-border-focused aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
      >
        <Icon aria-hidden="true" className="size-4" />
        <span data-aireq-motion-label="">{label}</span>
      </Button>
    );
  }
  return (
    <>
      <div className="mr-2 flex shrink-0 items-center gap-2 pr-4 border-r border-border">
        <img src={aireqMarkUrl} alt="" draggable={false} className="size-7 object-contain" />
        <span className="font-semibold text-ui-lg">{zh ? "AI 需求协作" : "AI Requirements"}</span>
      </div>
      {page("projectProgress", zh ? "项目总览" : "Project overview", Folders)}
      {page("proposals", zh ? "需求共创" : "Co-creation", MessagesSquare)}
      <div className="ml-auto">{page("roles", zh ? "角色管理" : "Roles", Users)}</div>
    </>
  );
}
