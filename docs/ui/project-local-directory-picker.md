# 本地项目使用系统多目录选择器

## 当前纯 Web 裁决（覆盖下方历史桌面说明）

目录是浏览器当前连接的后端服务器（含挂载目录）可访问的目录，不是浏览器电脑的目录。
ProjectEditor 是未保存 roots/primary/name 的唯一草稿 owner；保存后后端项目服务拥有组织态，
创建会话固定其 cwd，切换项目或工号不得改写会话 cwd。`hostId: local` 指当前后端。

```text
浏览器 → 同源 RPC projectService.readDirectory → 后端只读目录浏览
        ← 服务器绝对路径与目录名
ProjectEditor 草稿 → 显式 saveProject → 后端共享项目表
                   → prepareSession → cwd + 稳定 workspaceIdentity → 当前后端会话服务
```

工作区 identity 是数据身份而非旧远程 Host 路由；非空 identity 不得造成 remote-waiting。
只有显式旧远程连接元数据继续遵循断连拒绝，不允许误投当前后端，不恢复 SSH/relay/桌面运行时。
工号仅浏览器自报操作者，不进入身份、路径键或项目/会话过滤；所有浏览器共享业务事实，
但各自保留握手及订阅生命周期。一端取消订阅不得删除另一端订阅。

验收：两个独立浏览器以不同工号进入，浏览后端目录并保存项目，创建带稳定 identity 的会话；
另一端看到同一项目/任务，刷新后可加载会话、文件树、Git 和已有预览，无旧远程等待；
一端断开/取消订阅不影响另一端继续接收会话更新。以下桌面用例仅是历史记录，不恢复其测试体系。

## 行为与归属

桌面创建本地项目、编辑本地项目的「添加文件夹」使用操作系统原生目录选择框，允许一次多选目录。沿用平台接口的 native dialog 能力，新增可选 `IPlatformService.selectDirectories(): Promise<string[]>`；Electron main 使用 `openDirectory`、`createDirectory`、`multiSelections`，返回全部路径，取消返回空数组。旧 `selectDirectory` 单选契约不变。

ProjectEditor 仍是名称、roots、primary 的唯一草稿 owner；多选结果按返回顺序追加并去重。原 roots 为空时第一个目录成为主目录，否则保留现有主目录。选择操作不创建项目、不打开 workspace 或启动 Agent，仅显式保存才调用原 `saveProject`。

```text
桌面 + 本地 Host → 平台 selectDirectories → preload IPC → main 原生多选
                                                         ↓ 全部路径 / []
                                                ProjectEditor 草稿
                                                         ↓ 显式保存
                                                   Host saveProject
Web 本地（Chrome / Firefox）→ projectService.readDirectory(hostId)
                                  ↓ 服务端真实目录浏览（只读目录名）
                          ProjectEditor 草稿 → 显式保存 → Host saveProject
远端 / 手机 → 原 projectService.readDirectory(hostId) → 同一草稿
```

## Web 形态

浏览器不向页面暴露系统绝对路径（`showDirectoryPicker` 仅 Chromium 且拿不到完整路径），因此 Web 本地项目
统一走服务端目录浏览：`projectService.readDirectory` 读取本机真实目录名，`systemService.info().homedir`
返回真实 home。Chrome 与 Firefox 走同一条 RPC，不使用浏览器专属 API。目录浏览只读名称与类型，
不读写文件内容；远端 Host 仍通过所属连接浏览。

## 边界与失败语义

- 仅 `hostId` 未指定或为 `local`，且平台提供 `selectDirectories` 时使用系统选择器；判定不依赖当前 tab/cwd。远端项目继续浏览所属 Host，Web/手机未提供该能力，不能选择浏览器所在设备的目录作为 Host root。
- 原生选择在途期间禁用编辑、保存、删除和关闭，避免异步返回与草稿修改交错；选择完成后再合并一次。组件卸载后的结果不能触发持久化或重新打开编辑器。
- 取消不修改草稿；调用失败显示原错误区域、保留草稿并允许重试，不自动切换到另一选择方式。
- 目录选择不改变 Host 组织态、workspaceIdentity、owner/lease、桌面 continuous 或手机 replayable 语义；无数据库/CLI 协议迁移。
- 明暗主题沿用原编辑器，系统弹窗由操作系统渲染；macOS、Windows、Linux 共用 Electron 原生目录选项。

## 验收用例（accepted / pending）

| 用例  | 操作与断言                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------- |
| NDP01 | 桌面本地点击添加，一次选择两个真实目录；原生参数包含多选，不出现应用内目录浏览器；保存后重新编辑仍有两目录                  |
| NDP02 | 追加含已有目录的多选结果，只追加新目录并保留原主目录；取消选择不变更目录；取消编辑不保存                                    |
| NDP03 | 原生选择在途时禁止保存/关闭，失败后草稿保留且可重试；远端 Host 即使具备原生能力也使用 Host 浏览；Web/手机无原生能力仍可浏览 |
| NDP04 | 原有单选仍返回一个路径或 null；多选取消返回 []；明暗编辑器可用                                                              |

Electron 交互用例：`packages/desktop/test/e2e/workspace/projects/project-native-directory-picker.test.ts`。mock 仅替代系统弹窗的用户返回值，真实执行 UI → preload → main、保存与重新编辑；不声称覆盖操作系统原生窗口内的鼠标多选。单测覆盖 Host/平台边界及失败/在途状态。既有本地目录浏览 E2E 同步改用原生弹窗 mock。真实手机连接与 Windows/Linux GUI 需另行验证。

## 验证记录（2026-09-15）

- 相关单测 5 文件 / 21 项通过；`pnpm typecheck`、desktop `typecheck:e2e` 通过；`pnpm lint` 0 errors / 47 既有 warnings。
- Electron：`desktop-e2e-20260915125744659-p84856-08e67d2dd0407c35`，2/2 通过，包含 NDP01/NDP02、既有 WCP01 删除后重启回归及明暗截图。
- `architecture:check --changed --base HEAD` 为 0 violations；默认 staging 基线检查仍有开工前已存在的 `packages/ui/src/root/resolveConversationWorkspaceTarget.ts` unmanaged-new-file，未新增违规。
- 未运行真实手机配对、SSH/WSL Host、Windows/Linux GUI 或原生弹窗内手动多选；这些边界不以桌面弹窗 mock 代替实测。
