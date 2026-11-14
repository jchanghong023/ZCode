# 会话行悬浮卡片

## 目标

侧栏的会话行在桌面悬停时显示一张任务卡，内容与 [Workspace header](workspace-header-structure.md) 左侧工作区图标的卡片对齐。它解决两个高频问题：

- worktree 任务在侧栏只有 `GitBranch` 图标，看不出实际执行目录和所属 worktree。
- 切到非当前会话前，需要先确认它运行在哪个目录、最近是否活跃、当前 HEAD 是什么。

任务卡不是项目身份卡。项目行继续显示完整的项目身份详情；任务卡只显示任务自己的目录、最近活动、分支和变更统计。

## 覆盖范围

| 视图                   | 行组件                                 | 行为                                                                       |
| ---------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| 按项目                 | `TaskListItem`（`variant="default"`）  | 会话行显示任务卡                                                           |
| 置顶区                 | `TaskListItem`                         | 同上                                                                       |
| 时间线 / 未读          | `TaskListItem`（`variant="timeline"`） | 同上                                                                       |
| 按分组                 | `GroupedTaskRow`                       | 用同一张任务卡替换原来的单行 Tooltip；原 Tooltip 的 `+/-` 变更统计并入卡片 |
| Web remote（任意视图） | 不挂载                                 | 项目行由 `hoverEnabled=false` 禁用，分组行由 `disabled` 显式禁用           |

所有会话都走同一个 `TaskRowIdentityHoverCard`，不按视图复制字段逻辑。

## 触发与关闭

- 桌面指针进入会话行后延迟 300ms 打开，沿用 `ProjectIdentityHoverCard` 的 hover intent；移出立即关闭。
- 指针从会话行移入卡片时不关闭，允许选中、复制卡片里的路径。
- 卡片内右键不冒泡到会话列表的 `ContextMenuTrigger`，保留系统原生“复制”菜单。
- 卡片本身按 `side="right"`、`align="start"` 定位到会话行右侧，宽 `w-80`，空间不足时按 Radix 可用宽度收缩。
- 触屏指针不打开卡片；键盘 `:focus-visible` 聚焦会话行时延迟打开。
- `hoverEnabled=false`（手机远控 / Web remote）时，项目、置顶、时间线行不挂载卡片；分组行通过 `disabled` 不挂载。
- 分组视图拖拽期间（`tooltipsDisabled`）不挂载卡片。
- `Escape`、点击外部或指针离开行与卡片后关闭。

## 卡片内容

```text
[图标] 工作区 / worktree 标签
       ~/.zcode/worktrees/787b/z-code
──────────────────────────────────────
最近活动 1 分钟前
分支 main / 游离 HEAD
+12 -3（有变更统计时）
```

- **标题**：`worktreeRoot` 存在时使用 `formatWorktreeLabel`（`<仓库名> · <bucket>`）；否则使用会话行的工作区名（`workspacePath` 的叶子目录）。
- **图标**：受管 worktree `FolderGit2`，本地普通项目 `Folder`。
- **路径**：任务的 `cwd ?? workspacePath`，即 worktree 任务显示 worktree 根目录，不使用项目主目录。按本机 home 缩写为 `~`。
- **最近活动**：复用 `WorkspaceLastActivity`，取 `getTaskListRowActivity(task).lastActivityAt ?? task.updatedAt`。
- **分支**：卡片打开且 `rpcReady` 时按任务 cwd 调用 `git.getRepositorySummary`；`isRepository` 为真时显示 `branchName`，`headRefType === "detached"` 时显示“游离 HEAD”。
- **变更统计**：`changeSummary` 有 `added` / `removed` 时显示 `+N -N`，颜色沿用 `text-diff-added` / `text-diff-removed`。

## 数据源与边界

| 字段          | 唯一数据源                                                                    | 说明                                                                                                |
| ------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| worktree 标签 | `tasks-index.worktree_root` → `formatWorktreeLabel`                           | 与头部胶囊、行内图标同源，不在 UI store 保存副本                                                    |
| 路径          | `tasks-index.root_path` → `task.cwd`                                          | worktree 任务的 `workspacePath` 是项目主目录，不能拿来展示或查询 Git（`docs/git/worktree.md` §3.7） |
| 最近活动      | `sessions-index.lastActivityAt` / `task.updatedAt`                            | 复用 `getTaskListRowActivity`                                                                       |
| 分支          | `git.getRepositorySummary({ workspacePath: task.cwd ?? task.workspacePath })` | 只在卡片打开且 `rpcReady` 时查询；失败或非 Git 仓库时隐藏分支行                                     |
| 变更统计      | `task.changeSummary`                                                          | 无统计时不显示                                                                                      |

分支查询是只读快照，不做轮询，也不写回任务或 workspace 状态；卡片关闭即丢弃。Git 状态的实时来源仍是当前会话 header 的 `useGitRepository`。

服务来源按任务身份固定：任务统一使用 `useBaseWorkspaceServices()` 读取本机 home 和 Git，路径格式化不能只凭 `workspacePath` 推断。

## 与项目行卡片的边界

- 项目行卡片展示项目身份：项目名、所有 roots。
- 任务行卡片展示任务上下文：任务 cwd、最近活动、分支和变更统计。
- 任务卡不复制项目卡片的项目身份详情，避免项目身份详情在会话行重复出现。
- 分组视图中，任务卡保留原 Tooltip 的 `+/-` 变更统计，避免悬停时行内统计被操作按钮替换后完全丢失。
- `bucket` 仍按 worktree 规范显示；是否隐藏 bucket 属于独立产品决策，见 `docs/git/worktree.md` §3.7。

## 验证

- E2E：`packages/desktop/test/e2e/conversation-session/task-management/manual-review/pending/conversation-session-task-row-hover-details.test.ts`（pending）。覆盖按项目行与按分组行悬停、卡片字段、移出关闭。
- 桌面与手机远控分别验证：桌面悬停出现卡片，手机远控/触屏不出现且单击仍打开会话。
- 卡片内右键验证系统原生“复制”菜单可用。
- 深浅主题下检查卡片背景使用 `bg-popover`、`border-popover-border`、`rounded-xl`。
