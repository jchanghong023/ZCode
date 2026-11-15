import { useRef } from "react";
import { CircleHelp, FolderGit2, Layers, LogOut, Plus, UserRound } from "lucide-react";
import { WorkspaceSidebarFooter } from "@/WorkspaceSidebarFooter.js";
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import { getEmployeeId } from "../identity.js";

export function AIReqWorkspaceFooter({
  onOpenSettings,
  onManageProjects,
  onLogout,
  onHelp,
  settingsButtonMode = "settings",
}: {
  onOpenSettings: () => void;
  onManageProjects: () => void;
  onLogout: () => void;
  onHelp: (returnFocusTo?: HTMLButtonElement | null) => void;
  settingsButtonMode?: "settings" | "back";
}) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const theme = useZCodeStore((state) => state.theme);
  const setTheme = useZCodeStore((state) => state.setTheme);
  const employeeId = getEmployeeId();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  // 读投影切换期间可能仍含旧项目数据；Release 始终按当前项目过滤，不能跨项目误选。
  const releases = ai.view?.releases.filter((item) => item.projectId === project?.id) ?? [];
  const release = releases.find((item) => item.id === ai.releaseId);
  const back = settingsButtonMode === "back";
  const projectLabel = project?.name ?? "请选择项目";
  const releaseLabel = release?.title ?? (project ? "尚无 Release" : "请先选择项目");

  return (
    <WorkspaceSidebarFooter
      theme={theme}
      onThemeChange={(value) => {
        if (value === "system" || value === "zai-dark" || value === "zai-light") setTheme(value);
      }}
      onSettingsButtonClick={onOpenSettings}
      settingsButtonMode={settingsButtonMode}
      profileTriggerRef={menuTriggerRef}
      profileAriaLabel={back ? `工号 ${employeeId}` : "项目与 Release 菜单"}
      profileLabel={
        <span title={back ? employeeId : projectLabel}>{back ? employeeId : projectLabel}</span>
      }
      profileDescription={
        back ? undefined : <span title={`Release · ${releaseLabel}`}>Release · {releaseLabel}</span>
      }
      customMenuContent={
        <>
          <DropdownMenuItem disabled>
            <UserRound className="size-4" />
            工号 {employeeId}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onLogout}>
            <LogOut className="size-4" />
            切换工号
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            Web 所有者 {source.backend?.owner ?? "未提供"}
            {source.provenance.kind === "sample" ? " · 演示" : ""}
          </DropdownMenuItem>
          {!back ? (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="project-select">
                  <FolderGit2 className="size-4" />
                  <span className="shrink-0">项目</span>
                  <span
                    className="ml-4 max-w-40 truncate text-foreground-subtle"
                    title={projectLabel}
                  >
                    {projectLabel}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[60vh] w-72 overflow-y-auto">
                  <DropdownMenuRadioGroup
                    value={ai.selection.projectId ?? ""}
                    onValueChange={(id) => ai.navigate(() => ai.switchProject(id))}
                  >
                    {ai.view?.projects.map((item) => (
                      <DropdownMenuRadioItem key={item.id} value={item.id} className="min-w-0">
                        <span className="truncate" title={item.name}>
                          {item.name}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {!ai.view?.projects.length ? (
                    <DropdownMenuItem disabled>尚无项目</DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={onManageProjects}>
                    <Plus className="size-4" />
                    添加或管理项目
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="release-select" disabled={!project}>
                  <Layers className="size-4" />
                  <span className="shrink-0">Release</span>
                  <span
                    className="ml-4 max-w-40 truncate text-foreground-subtle"
                    title={releaseLabel}
                  >
                    {releaseLabel}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[60vh] w-72 overflow-y-auto">
                  <DropdownMenuRadioGroup
                    value={release?.id ?? ""}
                    onValueChange={(id) => ai.navigate(() => ai.setReleaseId(id))}
                  >
                    {releases.map((item) => (
                      <DropdownMenuRadioItem key={item.id} value={item.id} className="min-w-0">
                        <span className="truncate" title={item.title}>
                          {item.title}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {!releases.length ? (
                    <DropdownMenuItem disabled>当前项目尚无 Release</DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={onManageProjects}>
                    <Plus className="size-4" />
                    添加或管理 Release
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onHelp(menuTriggerRef.current)}
            data-testid="aireq-workflow-help-open"
          >
            <CircleHelp className="size-4" />
            帮助
          </DropdownMenuItem>
        </>
      }
    />
  );
}
