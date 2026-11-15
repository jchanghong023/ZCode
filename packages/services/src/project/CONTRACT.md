# 当前后端项目服务

当前治理范围（纯 Web）：`contract.ts` 的 `IProjectService` 与项目数据端口/结果类型（`data/contract.ts`
经本契约再导出）。SQLite 仓储、迁移、CLI 交接与远端装配实现已随桌面/CLI 链路移除；mock 后端
（`packages/server/src/mock/project.ts`）与 UI 消费方按同一契约注册与调用。

- 当前浏览器连接的后端是目录、项目与会话的唯一 owner；所有工号共享同一套数据。工号不进入
  hostId、workspaceIdentity、路径键或服务路由。`hostId: local` 表示当前后端，不表示浏览器所在电脑。
- `workspaceIdentity` 标识后端工作区，`workspacePath` 是后端可访问的执行目录；两者均须保留。
  identity 非空不是远程连接证据；当前后端的稳定 identity 通过现有根 accessor 提供服务，不等待旧 Host attachment。
  显式旧 remoteSessionId/remoteTarget 仍不得误落回当前后端；本轮不恢复旧远程连接。
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
- `prepareSession` 与 `resolveSessionDirectories` 返回真实 cwd 对应的稳定 `workspaceIdentity`，
  与 `/api/server-info`、任务行、controller、会话和 v4 topic 的身份一致；附加目录不改变该 cwd 的身份。
  identity 不含工号或连接 ID；断开、重连、切换工号不改变身份。mock 的身份由服务器主机及绝对路径稳定派生，
  业务内存仍随进程重启清空。路径型请求保留原协议兼容，不能令带身份的同一会话变成第二套数据。
- 未归类 Composer 可传 UUID `draftId`，目录由 Host 在 workspaceDirectory 下确定性派生；并发与重试只准备同一
  目录，`reuseDraft` 表示客户端已拿到该目录，缺失时报错、不重新 mkdir。
- `measureProjectData` / `deleteProjectData` 只在本机 Host 执行（远程与 Source Server 报
  `project.data-local-only`，旧单 root 只读）。副作用经注入的 `ProjectDataPort`；`deleteProjectData` 只接受已
  软删除项目，保留（运行中 / 附件被引用）或失败会话的 cwd 不删记忆与检查点，目录全部删除成功后才删任务索引行，
  有失败时项目保持软删除以便重试。
- 状态顺序与连接边界：

  ```text
  当前后端启动 → 发布路径及稳定 identity → 浏览器根 accessor
                                               ↓
  目录浏览 → ProjectEditor 草稿 → saveProject → prepareSession(path + identity)
                                               ↓
                                      创建会话 → 同源任务 / controller / v4 topic
  浏览器连接 A/B → 各自握手 / 订阅 → 同一个业务 owner
  A 取消订阅 / 断线 → 只释放 A 的订阅；B 与共享项目、会话不变
  ```

  UI 异步读取沿用既有 generation / effect cleanup，旧 accessor 的迟到结果不得覆盖新连接。
  conversation、sessions-index、workspace-config 继续由逐连接 facade 保护订阅归属；共享业务不共享握手。

- 运行验收：稳定 identity 下打开后端目录、创建项目和会话，刷新后任务/会话可加载，文件树/Git/预览仍可用，
  不出现 identity-only 的 remote-waiting；两个独立浏览器以不同工号观察同一项目和任务，一端退订/断线另一端仍接收更新。
- mock 仍是内存原型：目录浏览只读服务器目录名，文件/Git 使用原 fixture；不增加真实文件写入或 Git 执行。
  命令去重、CAS、结果查询及 controller 订阅归属仍有简化，真实后端不能据此弱化协议（见 mock 域契约）。
