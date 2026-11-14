# 项目侧栏

Host projectService 的 readTree 决定行集合、项目归属和 CLI 事实镜像；UI 只保存折叠、视图与表单草稿。实时 sessions-index 只附加 activity，不补行、不写回归属。读取以请求序号拒绝迟到结果；workspace 变化立即取消旧结果资格。

设置页、侧栏与 composer 复用公开的 `useOptionalProjectDirectory` 读取同一本地项目目录 owner；嵌套 Provider 复用，不得从 tabs/cwd 生成第二份项目投影。

session 标题通过 `useOptionalProjectSelectionDirectory` 读取同一 owner 的项目投影，
不订阅展开偏好或任务活动；无 Provider 的嵌入场景返回 null。顶部导航与列表标题按原输入
隔离项目展开更新，真实目录、导航、视图及语言变化仍传播，不新增目录缓存或偏好 owner。

创建经 Host prepareSession 固化 cwd，草稿持有 projectId，首发前由 Host 原子预留归属。选择其他项目会重建尚未提升的预热实例，已提交任务不受影响。拖动只发 moveTask，缺 root 经确认重试，失败保持原树。软删项目保留任务归属；时间线可见；恢复需用户显式选择同 roots 的已删项目。

桌面和手机共用组件；沿用现有 task 行操作、shared-host attachment、continuous/replayable 传输。CLI 不接收项目 ID。

SCT03 显式 App 导航通过桌面平台注入的单窗口请求调用 `useProjectTaskNavigation`，复用任务行的同一导航 owner 和实际查看/未读规则。返回 `opened` 必须观察到原任务选择入口已把精确 workspace identity + task 设为活动任务；发送事件或 Controller open 校验均不代表导航完成。取消、卸载、请求被替换或 owner 拒绝选择返回 `unavailable`，迟到结果不得重新选择。手机不注册桌面导航处理器；后台 read/send 不调用此入口。目标必须已出现在当前窗口目录投影；尚未水合或归档过滤导致缺行时明确返回 `project.task-not-found`，不创建连接、重试导航或将未知目标冒充打开。

composer 的“创建项目”复用侧栏 ProjectCreation：项目服务可用即可创建，不能沿用打开原生文件夹的能力门禁。保存只刷新目录，取消不写入，两者不切换项目/工作区或改写聊天草稿；创建成功后同一草稿自动选中新项目。

可选 `windowProjectDirectory` 能力提供窗口项目服务与只读项目变化流。目录 owner 一次选择完整组，读取、修改、accepted snapshot 身份与订阅不可混用窗口和 Source；无能力时沿用 base 目录。有能力但就绪校验失败必须报错。原工作区 project/broadcast 服务不替换，非目录消费者保持 Source 语义。bridge 服务换代释放旧订阅并拒绝迟到结果。

UI 纠偏：分区复用 WorkspacePurposeSection 和原折叠/顺序偏好；项目行恢复旧行高、间距及 hover/focus/touch 操作。项目菜单用非模态右键导航，编辑弹窗独占模态限制。时间线通过插件市场下的筛选菜单开放为「最近更新」。项目加号直接显示名称和源文件夹。ProjectEditor 持有唯一草稿；有目录须先确认再保存。桌面本地项目添加目录通过 IPlatformService.selectDirectories 调起系统多选；无法调起时退回 projectService.readDirectory 的目录浏览，不从当前 tab 推导文件服务；DirectoryBrowser 的迟到响应沿用请求序号判定。选择在途与保存/关闭互斥，取消不修改草稿。见 docs/ui/project-local-directory-picker.md。

有源文件夹的新建（含恢复）在 saveProject 前显示本次目录信任确认，展示完整 roots。ProjectEditor 是唯一草稿和确认请求 owner；取消保留表单，卸载令旧查询与确认失效，单次保存以在途引用去重。确认只授权本次创建，不持久化、不改变 Hook Trust；重复使用目录仍确认，零 roots 直接创建。已保存项目的重试复用 created，不再次创建或确认。见 docs/specs/project-creation-folder-confirmation.md。

本地项目行根据 roots 数量和展开态显示文件夹：0/1 root 使用 Folder/FolderOpen，多个 root 使用 Folders/FoldersOpen。composer 当前项目和菜单候选复用同一数量规则，保持收起图标。图标直接派生自当前项目，不维护副本。不显示独立箭头；hover/focus/touch 保留更多、查看文件、新建任务三个入口，右键复用相同操作定义；按钮不触发行折叠。查看文件沿用现有 WorkspaceFileTree，多 root 先选择，空 root 禁用；迟到结果不得覆盖关闭或新选择。

每个 project ID 的折叠状态归常驻侧栏，项目行只接收值与切换命令；文件树替换列表后返回不能重置折叠状态。

编辑器的 roots/primary 只属于表单草稿，保存才通过 saveProject 提交；有 roots 显示紧凑列表和末行添加，空 roots 才展示整块空态。已有项目的删除入口复用 deleteProject；成功刷新后关闭，失败保留弹窗，保存/删除互斥。主要目录只决定后续新任务 cwd，不重绑旧任务。

旧体验保留：按项目选择器复用运行层稳定排序和更新时间，从同 project 的未归档成员（含置顶）派生收起未读点。偏好 hook 只拥有视图/折叠的 browser persistence；项目点击无导航。任务交互 owner 只保存尚在途的 pin 意图，Host 树始终是唯一已提交行集合；归档成功复用 UI 清理。任务行按 Shell 当前 workspaceKey 定位选中态，手机标记按完整目标地址；只有置顶区任务提供文件树按钮，按任务固化 cwd 与精确 identity/session 打开，不读取项目新主目录。

项目折叠复用共享 Collapsible 的 300ms 高度与淡入淡出，单一 open 值仍来自偏好 owner；不能条件卸载跳过收起动效。普通任务行不传递文件树回调；置顶区任务复用同一文件树 owner 和请求序号。项目文件入口与原右键/归档/置顶保留。

## 当前任务与归档

项目树读取 owner 接受新快照后，仅对同 workspaceKey + taskId 的未归档到已归档转换调用既有 removeTaskState。归档后的当前详情退出到原工作区草稿，不自动选择下一条同名任务；首次已归档、缺行、失败/迟到结果不触发清理；读取在途期间已有导航提交打开该任务时，以之后的导航为准，本轮不清理（快照可能已过期，清理不可撤回）。标题由 active-task hook 经已有 scoped TaskService.getTaskMeta 读取同一索引，正文冷恢复不参与标题 authority。

## 输入框项目选择器

`ProjectDirectoryProvider` 是 shell 内项目树读取和排序偏好的唯一 UI owner；`ProjectSidebar` 与公开 `ProjectComposerMenu` 共用该投影。菜单不得从 tabs/cwd 生成项目或推断归属。候选为未删除项目，按侧栏顺序，搜索名称和 roots。选中来自草稿 projectId，命令复用 onCreateTask -> prepareSession，目录绑定与桌面/手机导航仍由 Root/Host 承担。零 roots 不被过滤。旧 ChatEmptyState 的 tab 菜单退场。

归档管理经 index 公开，属于 project-sidebar/ui。RootWorkspaceContent 提供单一项目目录 owner，嵌套 Provider 复用；设置、侧栏、composer 共用树。归档按 projectId 分组，删除容器和未归类不按目录重绑；操作复用模块内 mutation adapter 与现有 Controller/TaskService。页面只保存筛选/分页/确认候选和在途状态，批量部分失败不伪造全部成功。见 `docs/superpowers/specs/2026-09-11-archive-management.md`。

项目管理（设置 › 项目）同样经 index 公开、复用同一目录 owner。行、疑似原因、筛选与排序是 `project-management-view.ts` 的纯派生；`useProjectManagement` 只持有在途批次锁与最近一次失败，走 `deleteProject` / `restoreProject`，每批结束只刷新一次树。选择是页面草稿，生效集合取草稿与当前可见可移除行的交集。侧栏更多菜单末尾的「管理项目…」仅桌面端。见 `docs/superpowers/specs/2026-10-24-project-management.md`。

侧栏分区标题与置顶行保留旧字号/缩进，空态由 ProjectTaskRows 统一展示。SortableProjects 持有 dnd-kit 暂态位移，排序只在同置顶分区内经原 reorderProjects 提交，任务原生拖入仍发 moveTask。

ProjectNode 从同一 dnd-kit active/over 派生项目插入蓝线的位置；只标记同置顶分区的其它可排序节点，释放/取消随拖拽暂态清除，不新增排序状态。见 `docs/project-drag-insertion-indicator.md`。

拖拽 context 仅进入 ProjectNode 排序外壳；菜单/标题/任务内容通过 memo 浅比较复用，活动项只在 activator attributes 变化时更新。内容仍由原项目投影和回调驱动，不维护第二份排序/项目状态。

主目录可用性见 `docs/project-primary-root-availability.md`：项目服务在 readTree/readProjects 中异步探测主目录，返回可选 primaryRootStatus，不写库、不持久缓存；prepareSession 再次检查，失效直接拒绝，不复活或替换 cwd。侧栏消费同一投影置灰标题并禁用新建与查看文件入口（含多 root 菜单和右键），标题仍可展开已有任务并读取历史，focus 刷新沿用请求序号；空项目与附加目录失效不误禁用。

分区标题兼作折叠与拖拽入口，操作按钮保持独立；PurposeSections 持有 dnd-kit 暂态并限制纵轴，WorkspacePurposeSection 从 active/over 派生目标蓝线。提交只写原 renderer-local sectionOrder，取消不写；侧栏滚动容器禁止横向滚动。见 `docs/ui/sidebar-purpose-section-order.md`。

首发完成接线见 `docs/task-first-submit-visibility.md`：共享目录接收真实 Host 行后，同次提交目录与既有详情回调；并发失效合并为后续读取，不能持续取消在途结果。服务换代/卸载取消旧结果及待完成导航。

## 侧栏视图

插件市场下胶囊按钮打开原全局搜索，旁侧筛选仅 projects / timeline。偏好 owner 保存 view，默认 projects，忽略旧 sort/time 偏好，保留展开状态。项目与 composer 读取当前控制端侧栏偏好的复合身份顺序。projects 保留全局置顶和运行优先；timeline 只取未归档任务（含置顶与已删除项目历史），按 CLI updatedAt / createdAt / taskId 倒序和完整身份稳定排序，20/+20；分页后只插入本地日历日期标题，不显示项目分组、不重排、不改变任务 key。最近更新向共享 TaskList 显式传递 timeline 行样式，显示标题、绑定 cwd 末级名、相对时间；无状态不显示圆点但保留对齐槽；按项目保留 default 行。

## 平铺项目与控制端排序

项目区按 projectKey 在同一区排序。显示顺序由现有侧栏偏好唯一持有，组织态不接收 UI 排序写入；跨置顶边界不改变 pinned。项目只有先选定并保存唯一固定目录才能新建会话；任务区只显示本地未归类任务。

目录首次带来未记录的完整 projectKey 时，共享偏好合并按目录顺序将新项目前插，桌面与手机相同；其余已记录项目保留本端手动相对顺序。重复刷新、改名、暂时缺席后恢复不重新置前，不按创建时间重排历史项目。创建端的显式 prepend 不代替接收端合并。

拖拽浮层只读当前拖拽数据，不提交项目顺序。

项目菜单与所有项目行共用只读项目详情浮层；名称只在标题出现一次，正文仅按 roots 顺序列出完整目录，零目录显示「—」。只读既有项目投影，hover 不发起查询或连接。仅项目行在桌面端提供“设置 › 项目”入口。侧栏会话行（项目内、置顶区、最近更新）hover/focus 显示任务卡（任务 cwd、最近活动、分支、变更统计）。

## 分组视图

按项目、按分组、最近更新、按未读共享同一 ProjectDirectory 任务树与任务命令。按未读与系统角标共用可见未读集合及完整身份去重，复用时间线排序、行与分页；偏好沿用现有 owner，空态显示暂无未读任务。已读提交后移除行，不改变当前导航或原 CAS 合同，详见 `docs/ui/task-unread-state.md`。分组呈现复用删除前的组件，保持原整行拖拽、右键菜单和空组新建语义。
`useTaskGroups` 只订阅控制端 Host 的结构，成员身份为 canonical workspace key + taskId；
视图不创建连接或 Agent，不以缺席清理成员，不修改项目或会话事实。
旧 grouped 偏好在没有有效新版选择时映射到按分组。
草稿 placement 独立于项目选择；普通项目选择沿用原草稿分组，既有会话不读取残留草稿分组。创建 ACK 后，权威目录确认同时触发 UI 提升与独立幂等入组；组织请求不占用共享目录读取，辅助分组重读不进入首发屏障。导航取消立即结束 UI 等待，尚未确认的组织回调继续由原目录 owner 保留，确认后只执行一次；迟到结果不得重新打开详情。
分组手工移动提交节点/来源/锚点，Host 事务处理并广播刷新。`grouped/` 的嵌套 view 只做展示和当前手势预览，不恢复旧任务事实缓存或整表 applyOrder。吸顶浮层位于统一渐隐容器之外，Hash/收起全部操作挂在既有列表工具栏。关闭草稿行只从 Composer 草稿 owner 清除分组意图。

Composer 头部通过 `ProjectComposerMenu.showEditProject` 启用当前项目 Plus 编辑入口；`children` 放置分支等既有控件，顺序为项目、children、编辑按钮。当前项目解析仍由菜单持有。复用 ProjectEditor 与目录服务，非 legacySingleRoot 才能编辑；project 身份、会话或草稿切换使已打开编辑器失效。保存/删除仅刷新目录，不调用导航；其他选择器默认不启用入口。

设置项目管理行菜单同样复用 ProjectEditor，页面只保存 projectId 键，当前项目从共享目录派生。移除或 legacy 能力使旧编辑器失效；保存和编辑器内删除刷新目录，不导航。窄屏和触屏保留可点击的行菜单。

目录读取保留同一 Provider owner。只发送目录命令的 pane 使用 `useOptionalProjectDirectoryActions`，不订阅任务树；工作区选择器使用项目切片。任务活动仍只广播给任务消费者，项目与权限变化继续发布给相关选择器。

会话切换不属于项目内容的展示输入；侧栏不接收未使用的代码预览回调，文件操作只依赖实际导航字段。
单行读取同一 session store 中自身的选中布尔值，保持 workspace 身份隔离，不增加选中态副本。
导航状态变化不能传播到全部项目内容，真实文件回调变化仍需生效。见 `docs/performance/ui-render-stability.md` 的 SPT08。
