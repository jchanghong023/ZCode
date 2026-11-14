# Host 项目服务

当前治理范围（纯 Web）：`contract.ts` 的 `IProjectService` 与项目数据端口/结果类型（`data/contract.ts`
经本契约再导出）。SQLite 仓储、迁移、CLI 交接与远端装配实现已随桌面/CLI 链路移除；mock 后端
（`packages/server/src/mock/project.ts`）与 `packages/ui/src/project-sidebar` 等 UI 消费方按同一契约注册与调用。

- 唯一写者是当前 Host 的项目组织态存储（`project-storage` 契约）；UI 只经 hooks 调用此契约。远程调用使用
  拥有组织态的现有 Host attachment，不让 main/relay 创建业务副本。
- 目录解析的 task 归属与 roots 来自同一读快照。已知 task 无项目时返回空附加目录；引用悬空项目或读取失败
  直接拒绝。`prepareSession` 的 cwd 创建后固定；编辑 roots 只影响下一次 runtime materialization。
- 删除项目不删除会话；移动不写执行事实、时间或 cwd。已删除容器默认永久保留，恢复仅由新建时明确选择同 roots
  的已删项目；例外是彻底删除数据（见下）。
- 全局创建显式空归属，不按目录猜项目。跨 host 移动失败；同 host 缺目录时先返回错误，用户明确确认后原子追加
  root 与移动。显式本地单目录打开走 `saveProject` 的 `reuseExistingRoot`：仅接受无 ID、无编辑字段的单 root
  请求，复用包含该 root 的未删除项目或创建单 root 项目，不改项目元数据、不恢复已删除项目。
- `readProjects` 只查项目/roots，`readTree` 只读投影，两者都不加载任务、不触发自动归档；自动归档只在启动首轮、
  每小时与设置变更补扫时执行，不挂在任何读取或 UI 动作上。
- 主目录可用性由所属 Host 异步探测并作为只读投影返回，不写库、不持久缓存；`prepareSession` 再次检查，失效
  直接拒绝，不复活或替换 cwd。空项目与附加目录失效不误禁用。
- 远端装配器在 `prepareSession` 与 `resolveSessionDirectories` 后，经既有 workspace identity resolver 为真实
  cwd 登记并返回 `workspaceIdentity`；不复制请求中的身份，resolver 失败直接拒绝。identity 登记按同一物理连接
  内同一路径去重，失败不缓存；不能用跨重连不换代的 logical handle。UI 不得从远端真实路径推断本机 workspace。
- 可信 ownerHostId 非 local 的持库宿主只允许恰好一个固定 root；远程创建必须有项目，`prepareSession`、
  创建预留与 `moveTask` 不得产生无归属或附加目录；根路径更新和缺 root 拖动在写事务中拒绝。客户端 hostId 不能
  改变持库身份，历史迁移数据不被裁剪，失败不得部分写入。
- 缺少 virtualProjects 握手能力的远端只使用单 root 读适配器：读取远端旧 app 数据，不写本机项目、不启动 Agent，
  项目组织操作显式拒绝；合成 ID 由 host/cwd 稳定导出，`directoryMatchPath` 只用于目录匹配，不落库、不合并
  历史 ID。
- 未归类 Composer 可传 UUID `draftId`，目录由 Host 在 workspaceDirectory 下确定性派生；并发与重试只准备同一
  目录，`reuseDraft` 表示客户端已拿到该目录，缺失时报错、不重新 mkdir。
- `measureProjectData` / `deleteProjectData` 只在本机 Host 执行（远程与 Source Server 报
  `project.data-local-only`，旧单 root 只读）。副作用经注入的 `ProjectDataPort`；`deleteProjectData` 只接受已
  软删除项目，保留（运行中 / 附件被引用）或失败会话的 cwd 不删记忆与检查点，目录全部删除成功后才删任务索引行，
  有失败时项目保持软删除以便重试。
- 规格：`docs/git/worktree.md`（worktree 任务的 cwd 与 workspace 区分）、`docs/ui/internal-source-packages.md`
  （包约定）。桌面 continuous 与手机 replayable 复用同一组织 owner。
