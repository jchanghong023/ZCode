import { createContext, useContext, useMemo, type ReactNode } from "react";
import { selectSortedProjects } from "@/project-sidebar/view.js";
import { useProjectTree } from "@/project-sidebar/useProjectTree.js";
import { useProjectSidebarPreferences } from "@/project-sidebar/useProjectSidebarPreferences.js";
import { useTaskGroups } from "@/project-sidebar/useTaskGroups.js";

function useDirectoryState() {
  const result = useProjectTree();
  const groups = useTaskGroups(result.factTree);
  const sortedProjects = useMemo(
    () => selectSortedProjects(result.factTree),
    [result.factTree.projects],
  );
  const preferences = useProjectSidebarPreferences(sortedProjects, result.loading);
  const projects = useMemo(() => {
    const sorted = preferences.sort(sortedProjects);
    return [...sorted.filter((p) => p.pinned), ...sorted.filter((p) => !p.pinned)];
  }, [sortedProjects, preferences.order]);
  // Context 不受消费方 memo 保护；父级更新 children 时，等价目录不能再次广播。
  return useMemo(
    () => ({ ...result, preferences, projects, groups }),
    [result, preferences, projects, groups],
  );
}
type DirectoryState = ReturnType<typeof useDirectoryState>;
const Context = createContext<DirectoryState | null>(null);
type DirectoryActions = {
  commitCreatedTask: DirectoryState["commitCreatedTask"];
  refreshTaskGroups: DirectoryState["groups"]["refresh"];
};
const ActionsContext = createContext<DirectoryActions | null>(null);
type ProjectSelection = Pick<DirectoryState, "projects" | "error" | "service" | "refresh"> & {
  allProjects: DirectoryState["tree"]["projects"];
};
const ProjectSelectionContext = createContext<ProjectSelection | null>(null);
/** 侧栏和 composer 共享读取与偏好，避免各自订阅后出现两份项目目录。 */
export function ProjectDirectoryProvider({
  children,
}: {
  children: ReactNode;
  isDesktop?: boolean;
}) {
  const existing = useContext(Context);
  return existing ? children : <DirectoryOwner>{children}</DirectoryOwner>;
}
function DirectoryOwner({ children }: { children: ReactNode }) {
  const directory = useDirectoryState();
  // 全量目录 Context 会让任务活动穿透 memo；在同一 owner 上按消费职责拆分广播。
  const { commitCreatedTask, groups, projects, error, service, refresh, tree } = directory;
  const actions = useMemo(
    () => ({ commitCreatedTask, refreshTaskGroups: groups.refresh }),
    [commitCreatedTask, groups.refresh],
  );
  const projectSelection = useMemo(
    () => ({
      projects,
      allProjects: tree.projects,
      error,
      service,
      refresh,
    }),
    [projects, tree.projects, error, service, refresh],
  );
  return (
    <Context.Provider value={directory}>
      <ActionsContext.Provider value={actions}>
        <ProjectSelectionContext.Provider value={projectSelection}>
          {children}
        </ProjectSelectionContext.Provider>
      </ActionsContext.Provider>
    </Context.Provider>
  );
}
export function useProjectDirectory() {
  const directory = useContext(Context);
  if (!directory) throw new Error("project.directory-provider-required");
  return directory;
}

/** 嵌入式 pane 可无侧栏；完整 Shell 必须使用同一目录 owner。 */
export function useOptionalProjectDirectory() {
  return useContext(Context);
}

/** 只发送目录命令，不订阅任务活动。嵌入 pane 允许没有目录 owner。 */
export function useOptionalProjectDirectoryActions() {
  return useContext(ActionsContext);
}
/** 工作区选择器只读取项目信息，任务状态不属于它的展示输入。 */
export function useProjectSelectionDirectory() {
  const selection = useOptionalProjectSelectionDirectory();
  if (!selection) throw new Error("project.directory-provider-required");
  return selection;
}

/** 标题只读项目信息；全量目录的展开偏好曾让无关 session 标题重渲染。 */
export function useOptionalProjectSelectionDirectory() {
  return useContext(ProjectSelectionContext);
}
