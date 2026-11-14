import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import {
  countUnreadTasksSinceBaseline,
  mergeUnreadBaseline,
  selectSortedProjects,
  type UnreadAtBaseline,
} from "@/project-sidebar/view.js";
import { useProjectTree } from "@/project-sidebar/useProjectTree.js";
import { useProjectSidebarPreferences } from "@/project-sidebar/useProjectSidebarPreferences.js";
import { useZCodeStoreWithDefault } from "@/store/StoreProvider.js";
import { useTaskGroups } from "@/project-sidebar/useTaskGroups.js";

// 角标基线锚定 renderer 进程生命周期而不是组件生命周期：owner 可能因 services 切换
// 重挂（Root/RootWorkspaceContent/WorkspaceShellLayout 三处挂载点靠 context 去重，同一
// 时刻只有一个实例）——ref 随重挂重建会把本次运行已点亮的新未读吸收进新基线、角标
// 归零；模块级 Map 不受重挂影响，与「本次 app 运行」语义一致。多窗口为多 renderer
// 进程，各自独立基线互不影响。
const unreadBaseline: UnreadAtBaseline = new Map();

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
  // 任务栏/托盘角标与侧栏蓝点同源（都数权威树未读），但计数语义分叉：蓝点 = 全部未读，
  // 角标 = 本次运行新增的未读（基线分界，见下）。挂在 Provider owner（Root 顶层，常驻
  // 不卸载）而不是 ProjectSidebar：侧栏卸载期间后台完成的未读变化也要同步到任务栏/托盘。
  // 嵌入 pane / 测试环境无 Provider 时跳过。
  const platform = useOptionalPlatform();
  // 任务通知开关同时门控任务栏/托盘角标：关掉通知 = 连常驻提醒一起关闭
  // （同步 0 清空角标），侧栏蓝点作为应用内状态不受影响。
  const notificationEnabled = useZCodeStoreWithDefault((state) => state.notificationEnabled, true);
  // 角标基线（机制见 view.ts 注释与 docs/desktop/windows-taskbar-unread-badge.md）：
  // 首次成功读取时快照现有未读；此后角标只计基线外的新未读——用户带着历史未读开机
  // 时角标为 0，只有本次运行的新完成才点亮。每次树刷新都跑 merge，幂等：已建基线的
  // 任务不覆盖，只吸收新出现的任务。
  useEffect(() => {
    mergeUnreadBaseline(directory.tree, unreadBaseline);
  }, [directory.tree]);
  const unreadTaskCount = useMemo(
    () => countUnreadTasksSinceBaseline(directory.tree, unreadBaseline),
    [directory.tree],
  );
  useEffect(() => {
    platform?.syncWindowUnreadCount(notificationEnabled ? unreadTaskCount : 0);
  }, [platform, notificationEnabled, unreadTaskCount]);
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
