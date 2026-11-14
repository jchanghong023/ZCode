import { SidebarTooltipProvider } from "@/ControlHintTooltip.js";
export { readProjectSidebarView } from "@/project-sidebar/view-preference.js";
import { SortableProjects } from "@/project-sidebar/SortableProjects.js";
export { ArchiveManagement } from "@/project-sidebar/ArchiveManagement.js";
export { ProjectManagement } from "@/project-sidebar/ProjectManagement.js";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { ScrollFadeViewport } from "@/components/ui/scroll-fade-viewport.js";
import { TID_SIDEBAR } from "@zcode/shared/test-ids";
import type { ProjectSidebarProps, VirtualProject, Theme } from "@/project-sidebar/contract.js";
import { useProjectPinIntent } from "@/project-sidebar/useProjectPinIntent.js";
import { ProjectTaskListContext } from "@/project-sidebar/ProjectTaskListContext.js";
import { useProjectDirectory } from "@/project-sidebar/ProjectDirectoryProvider.js";
export {
  ProjectDirectoryProvider,
  useOptionalProjectDirectory,
  useOptionalProjectDirectoryActions,
  useOptionalProjectSelectionDirectory,
} from "@/project-sidebar/ProjectDirectoryProvider.js";
export { ProjectComposerMenu } from "@/project-sidebar/ProjectComposerMenu.js";
import { useProjectTaskNavigation } from "@/project-sidebar/useProjectTaskNavigation.js";
import { useProjectFileTree } from "@/project-sidebar/useProjectFileTree.js";
import {
  selectProjectRows,
  selectSortedProjects,
  projectKey,
  projectHasUnread,
} from "@/project-sidebar/view.js";
import { TaskGroupedView } from "@/project-sidebar/TaskGroupedView.js";
import { taskGroupKey } from "@/project-sidebar/grouped-view.js";
import { ProjectTaskRows } from "@/project-sidebar/ProjectTaskRows.js";
import {
  ProjectSidebarNode,
  runProjectAction as action,
} from "@/project-sidebar/ProjectSidebarNode.js";
import { ProjectCreation } from "@/project-sidebar/ProjectCreation.js";
import { ProjectEditor } from "@/project-sidebar/ProjectEditor.js";
import { ManagedWorktreesDialog } from "@/project-sidebar/ManagedWorktreesDialog.js";
import { useManagedWorktreeService } from "@/project-sidebar/useManagedWorktrees.js";
import { ProjectSections } from "@/project-sidebar/ProjectSections.js";
import { ProjectSidebarListHeader } from "@/project-sidebar/ProjectSidebarListHeader.js";
import { ProjectSidebarNavigation } from "@/project-sidebar/ProjectSidebarNavigation.js";
import { WorkspaceSidebarFooter } from "@/WorkspaceSidebarFooter.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useTabStoreApi } from "@/store/TabStoreProvider.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
export type {
  SidebarFileTreeOpenRequest,
  ProjectSidebarProps,
} from "@/project-sidebar/contract.js";

// 右侧面板显隐曾让所有项目的菜单和 Tooltip 重渲染；只隔离无关父更新，保留目录/context 订阅。
export const ProjectSidebar = memo(function ProjectSidebar(props: ProjectSidebarProps) {
  const {
    tree: authoritativeTree,
    service,
    refresh,
    error,
    loading,
    preferences,
    groups,
  } = useProjectDirectory();
  const { tree, pin } = useProjectPinIntent(authoritativeTree);
  const navigateToTask = useProjectTaskNavigation(props);
  const onSelectTask = useCallback<ProjectSidebarProps["onSelectTask"]>(
    (...args) => {
      void navigateToTask(...args);
    },
    [navigateToTask],
  );
  const { intl } = useZCodeIntl();
  const tabStore = useTabStoreApi();
  const setTheme = useZCodeStore((state) => state.setTheme);
  const { view, setView } = preferences;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [groupedToolbar, setGroupedToolbar] = useState<HTMLDivElement | null>(null);
  const [groupedSticky, setGroupedSticky] = useState<HTMLDivElement | null>(null);
  const [editor, setEditor] = useState<{ project: VirtualProject | null } | null>(null);
  const [creating, setCreating] = useState(false);
  const [worktreeProject, setWorktreeProject] = useState<VirtualProject | null>(null);
  const managedWorktreeService = useManagedWorktreeService();
  // 入口条件：桌面且 Host 提供服务；是否 Git 仓库交给弹窗空状态表达。
  const canManageWorktrees = Boolean(managedWorktreeService && props.isDesktop);
  const { openFiles, openTaskFiles } = useProjectFileTree(props);
  const taskPresentation = useMemo(
    () => ({
      activeWorkspaceKey: props.workspaceIdentity?.trim() || props.workspacePath,
      onPin: pin,
      onOpenTaskFiles: openTaskFiles,
    }),
    [props.workspacePath, props.workspaceIdentity, pin, openTaskFiles],
  );
  const start = async (projectId?: string, taskGroupId?: string | null) => {
    const activeTaskId = useZCodeSessionStore
      .getState()
      .getWorkspaceState(props.workspacePath, props.workspaceIdentity).activeTaskId;
    const inheritedGroup =
      view === "grouped" && !projectId && activeTaskId
        ? (groups.parents.get(
            taskGroupKey({
              taskId: activeTaskId,
              workspacePath: props.workspacePath,
              workspaceIdentity: props.workspaceIdentity,
            }),
          ) ?? null)
        : view === "grouped" && !projectId
          ? (useZCodeSessionStore
              .getState()
              .getWorkspaceState(props.workspacePath, props.workspaceIdentity).draftTaskGroupId ??
            null)
          : null;
    props.onCreateTask({
      projectId: projectId ?? null,
      taskGroupId: taskGroupId === undefined ? inheritedGroup : taskGroupId,
    });
  };
  const projects = preferences.sort(selectSortedProjects(tree));
  const hasExpandedProjects = projects.some(preferences.isExpanded);
  const reorder = (active: string, over: string) => {
    const source = projects.find((item) => projectKey(item) === active);
    const target = projects.find((item) => projectKey(item) === over);
    if (!source || !target || source.pinned !== target.pinned) return;
    preferences.reorder(
      projects.filter((item) => item.pinned === source.pinned),
      active,
      over,
    );
  };
  const renderProject = (project: VirtualProject) => (
    <ProjectSidebarNode
      key={projectKey(project)}
      project={project}
      expanded={preferences.isExpanded(project)}
      onExpandedChange={preferences.setExpanded}
      hasUnread={projectHasUnread(authoritativeTree, project)}
      tasks={selectProjectRows(tree, {
        kind: "project",
        projectId: project.id,
      })}
      onSelect={onSelectTask}
      refresh={refresh}
      service={service}
      isDesktop={props.isDesktop}
      onCreateTask={props.onCreateTask}
      onEdit={setEditor}
      onViewFiles={openFiles}
      onOpenWorktrees={canManageWorktrees ? setWorktreeProject : undefined}
    />
  );
  const openSettings = useCallback(() => {
    tabStore.getState().openSettingsTab();
  }, [tabStore]);
  const changeTheme = useCallback((value: string) => setTheme(value as Theme), [setTheme]);
  return (
    <ProjectTaskListContext.Provider value={taskPresentation}>
      <SidebarTooltipProvider>
        <aside data-testid={TID_SIDEBAR} className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="h-12 shrink-0 [app-region:drag]" />
          {/* 内联改名聚焦曾把 hidden 容器横向滚动，导致手机整栏左移；滑动面板只裁切，不允许焦点滚动。 */}
          <div className="relative min-h-0 flex-1 overflow-clip">
            <div
              data-project-sidebar-panel="navigation"
              className="absolute inset-0 flex min-h-0 flex-col"
            >
              {/* 原因：顶层新建显式传 null 会抹掉当前项目；省略归属，让 Root 与快捷键共用继承路径。 */}
              <ProjectSidebarNavigation props={props} onCreate={props.onCreateTask} />
              <div
                data-testid="sidebar-task-list-region"
                className="flex min-h-0 flex-1 flex-col border-t border-border/50 pt-3 [anchor-name:--sidebar-task-list-divider]"
              >
                <ProjectSidebarListHeader
                  onOpenCommandCenter={props.onOpenCommandCenter}
                  view={view}
                  onViewChange={setView}
                  groupedActionsRef={setGroupedToolbar}
                />
                {/* 原因：仅设 overflow-y:auto 会让拖拽位移打开水平滚动；列表始终只允许纵向滚动。 */}
                {/* 原因：项目侧栏迁移后普通滚动容器遗漏边缘渐隐；复用统一 mask，随实际滚动边界更新。 */}
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <div ref={setGroupedSticky} />
                  <ScrollFadeViewport ref={scrollRef} className="overflow-x-hidden">
                    <div className="flex flex-col gap-3 pb-3">
                      {view === "projects" ? (
                        <>
                          <ProjectTaskRows
                            kind="pinned"
                            tasks={selectProjectRows(tree, { kind: "pinned" })}
                            onSelect={onSelectTask}
                            refresh={refresh}
                          />
                          <SortableProjects
                            projects={projects.filter((project) => project.pinned)}
                            renderProject={renderProject}
                            onReorder={reorder}
                          />
                          <ProjectSections
                            tree={tree}
                            projects={projects}
                            renderProject={renderProject}
                            onReorder={reorder}
                            loading={loading}
                            onSelect={onSelectTask}
                            refresh={refresh}
                            onCreate={() => action(() => start())}
                            onAddProject={() => setCreating(true)}
                            hasExpandedProjects={hasExpandedProjects}
                            canToggleProjects={projects.length > 0}
                            onToggleProjects={() =>
                              preferences.setAllExpanded(projects, !hasExpandedProjects)
                            }
                          />
                        </>
                      ) : view === "grouped" ? (
                        <>
                          <ProjectTaskRows
                            kind="pinned"
                            tasks={selectProjectRows(tree, { kind: "pinned" })}
                            onSelect={onSelectTask}
                            refresh={refresh}
                          />
                          <TaskGroupedView
                            tasks={tree.tasks}
                            onSelect={onSelectTask}
                            refresh={refresh}
                            scrollRef={scrollRef}
                            toolbarTarget={groupedToolbar}
                            stickyTarget={groupedSticky}
                            workspacePath={props.workspacePath}
                            workspaceIdentity={props.workspaceIdentity}
                            onOpenAutomations={props.onOpenAutomations}
                            onCreate={(groupId) => action(() => start(undefined, groupId))}
                          />
                        </>
                      ) : (
                        <ProjectTaskRows
                          key={view}
                          kind={view}
                          tasks={selectProjectRows(view === "unread" ? authoritativeTree : tree, {
                            kind: view,
                          })}
                          onSelect={onSelectTask}
                          refresh={refresh}
                        />
                      )}
                      {loading ? (
                        <p className="px-4 text-ui-sm text-foreground-subtle">
                          {intl.formatMessage({ id: "common.loading" })}
                        </p>
                      ) : null}
                      {error ? (
                        <p role="alert" className="px-4 text-ui-sm text-destructive">
                          {error}
                        </p>
                      ) : null}
                    </div>
                  </ScrollFadeViewport>
                </div>
              </div>
              <WorkspaceSidebarFooter
                className="pr-3"
                theme={props.theme}
                onThemeChange={changeTheme}
                onSettingsButtonClick={openSettings}
                onUsageClick={openSettings}
                onLogin={props.onLogin}
                onLogout={props.onLogout}
                user={props.user}
                workspacePath={props.workspacePath}
                workspaceIdentity={props.workspaceIdentity}
                isDesktop={props.isDesktop}
              />
            </div>
          </div>
          {creating && service ? (
            <ProjectCreation
              workspacePath={props.workspacePath}
              workspaceIdentity={props.workspaceIdentity}
              onCreateTask={props.onCreateTask}
              projects={tree.projects}
              service={service}
              onClose={() => setCreating(false)}
              onSaved={refresh}
            />
          ) : null}
          {editor && service ? (
            <ProjectEditor
              key={editor.project?.id ?? "new"}
              project={editor.project}
              projects={tree.projects}
              service={service}
              onClose={() => setEditor(null)}
              onSaved={refresh}
              onDeleted={refresh}
            />
          ) : null}
          {worktreeProject && managedWorktreeService ? (
            <ManagedWorktreesDialog
              key={projectKey(worktreeProject)}
              project={worktreeProject}
              service={managedWorktreeService}
              onClose={() => setWorktreeProject(null)}
              onOpenTask={onSelectTask}
            />
          ) : null}
        </aside>
      </SidebarTooltipProvider>
    </ProjectTaskListContext.Provider>
  );
});

export { ComposerSubmissionPendingContext } from "@/project-sidebar/ComposerSubmissionPendingContext.js";
