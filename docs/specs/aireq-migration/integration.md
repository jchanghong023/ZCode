# 前后端接线与集成边界

本文说明当前可运行路径、依赖方向与交互 owner；公开成员见[契约设计](contract-design.md)，身份和时序见[连接身份](connection-identity.md)，实现限制见[后端拓扑](../../architecture/mock-backend.md)。

## 1. 唯一产品入口

`packages/web/src/main.tsx` 装配 Web platform、主题、EmployeeEntry 与 AIReqApplication。同源 ws/wss 地址由页面 origin 生成 `/ws`，附合法工号和稳定 v4 clientId。没有独立业务 REST、事件 WebSocket、worker 后端或另一个聊天产品入口。

`connectViaWebSocket` 用 ArrayBuffer 包装 ISocket，创建 SocketProtocol/ChannelClient，收到 Channel Initialize 后返回 RemoteServiceAccess。关闭／错误终结旧 pending 请求；Web entry 有限退避重建 accessor，AIReqApplication 在同一工号生命周期保持挂载，不以连接代次重建 React 树。工号退出才结束该身份范围。

开发代理只是开发路由；生产入口必须实际承载 `/ws` Upgrade、`/api/` 和同次静态资源，不能把 Vite 成功当生产可达。HTTP 配置与 telemetry 的精确信封／部署 token 见后端文档。

## 2. 模块与依赖方向

| 模块                   | 当前路径／公开入口                                     | 职责                                                  |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| aireq-contract         | `packages/services/src/aireq`，`@zcode/services/aireq` | 浏览器安全领域类型、纯派生、operation map、descriptor |
| aireq-mock             | `packages/server/src/aireq`，`contract.ts`             | 唯一共享业务 owner 与原生 admission/completion 接线   |
| aireq-ui               | `packages/ui/src/aireq`，`contract.ts`／`index.ts`     | canonical port 与应用／UI；导航、草稿、读取投影       |
| client                 | `packages/client/src/remoteServiceAccess.ts`           | 以 ProxyChannel 构造 IServiceAccessor                 |
| rpc                    | `packages/rpc/src`                                     | 二进制 framing、序列化、调用和事件                    |
| browser-employee-entry | `packages/web/src/auth`                                | 自报工号输入、标签页恢复、退出，不拥有业务事实        |

UI 页面／hook／shell 经本模块 canonical `contract.ts` 选择性消费服务类型和纯派生，不复制第二套 DTO，不从 server 导入类型。server 不依赖 UI。`index.ts` 是 UI 应用入口，不反向承担领域 contract。架构登记及允许依赖以现行 architecture-policy 为准。

`createMockServices` 创建一个 MockAIReqService，将其 remote 注册为 IAIReqService，把同一业务实例传入 MockZCodeAgentService。HTTP 将固定身份 facade 和逐连接 scope 作为 overrides，再按 publicMembers 暴露。业务私有方法不因实例注册而公开。

## 3. 应用与原生会话

AIReqApplication 的 Provider 链为 AppErrorBoundary → Intl → Lucide → Tooltip → Service → Platform → Store → TabStore → AIReqDataSource → AIReqProvider → AIReqShell；通用 ConfirmDialogHost/AlertDialogHost 保留。ServiceProvider 的 composer namespace 包含 clientId/employeeId。

`registerBaseWorkspaceServices` 连接现有 workspace 适配，逻辑 workspace 来自服务端返回的 path/identity，不新开业务 socket。StoreProvider 随当前 broadcastService 重新绑定广播，保持原 store 身份；入站偏好不回发。主题是浏览器偏好，不是 workflow revision。

`createRemoteAIReqDataSource` 经 aiReqService 订阅并读取；bootstrap 提供元数据，readWorkflow 同时提供 view/session/workspace。AIReqContext 只持导航与选择，不持第二份已接纳业务库。并行详情 Tab 使用显式目标读取，不抢占主选择；迟到结果按代际丢弃。

会话路径由 `AIReqSessionPane` 复用当前 v4 Provider、SessionPane、ConversationComposer。AIReq 只登记会话引用和业务材料，rows／queue／附件／水位仍归原生 owner。正文、附件、临时模型由原 composer 冻结和 claim；accepted 后 adopt 与草稿结算仍由该 owner 处理，拒绝／上传失败保留草稿，未知决定不自动重发。

提案先独立保存短需求；打开讨论不是自动发送，也不以首发 ACK 创建提案。明确发送才沿原生 admission/completion 回调写业务材料。Sketch 真正生成完整 PNG 并添加附件，不自动发送；不存在语音识别执行入口。隐藏 Skill 复用私有会话、预览与唯一未保存门禁，不恢复主导航、设置或搜索入口。

当前右侧为[统一多 Tab 面板](unified-side-pane.md)，承载对象详情、报告、材料与只读历史；不是单对象覆盖面板。Tab 打开／激活／关闭、范围和读取 owner 沿现有实现，布局操作不重建主 composer 或扩大对象权限。

## 4. 二进制与协议接线

当前 `/ws` 是 SocketProtocol，不是 JSON WebSocket、REST、SSE 或 PersistentProtocol 透明续传。后端应直接复用 `@zcode/rpc`；其他语言也须实现相同字节格式：

- 帧头固定 13 字节：type:u8、id:u32BE、ack:u32BE、payloadLength:u32BE，普通消息 type=1；跨 message 半帧与粘包按 `rpc/src/protocol.ts`，不增加透明重放。
- payload 的 header/body 序列化、类型标签、VQL 长度、UTF-8 与二进制 marker 按 `serialization.ts`，不能替换成自定义 JSON。
- ChannelServer 发 Initialize 后客户端才调用；当前 Web 直接装配 ChannelServer，不添加 IPCServer 的首条 ctx 消息。
- 请求 ID 对应当前连接，Promise success/error、取消、事件 listen/fire/dispose 按 channels.shared/channelClient/channelServer。
- ProxyChannel 方法实参为数组；onXxx 为 Event，onDynamicXxx(arg) 为参数化 Event，释放监听即退订，不作为普通 Promise 方法。

v4 hello/initialize 后订阅 conversation，ACK 与 owned notification 分离；首帧经现有 response 后通知路径发送。wire complete/fragment 使用 shared wire-codec/wire-reassembly 的尺寸、校验与 typed fault，客户端重组后才应用逻辑帧，不能直接把 snapshot 当二进制候选传递。wire=3、snapshot=1 与 AIReq contract=4 独立。

## 5. 资源、附件与失败

附件通过 begin/chunk/commit/abort/read，不经宿主路径转移。begin 绑定 actor、session、workspace、文件名、MIME、总字节／块数及 SHA-256；当前上限 20 MiB、4096 块，每块不超过 512 KiB。块按序提交，相同已接纳块可复用但不可改写；commit 校验完整大小与 `sha256:<hex>` 后返回 ref。

发送采用同一真实字节。abort 不删除已被行、队列或提升项采用的字节；读取核实 workspace／会话／采用行和可见性。其他操作者只可读取已发布共享会话真实采用的附件，不可读取私人暂存。read 的 offset 非负、limit 为 1—512 KiB，返回 dataBase64/mediaType/totalBytes/nextOffset；会话已删除不能因读取重建。

File 与媒体由正式只读 RPC 返回字节或浏览器可达资源，缺失和错类型明确失败；没有宿主业务写入。材料摘要和 size 来自真实正文 UTF-8，不以路径或样例标签代替摘要。

首次读取有加载、空、失败区别；同目标后台重读保留已读内容和草稿。尚未生成、生成中、缺失、读取失败和版本过期不能互相伪装。异步确认等真实提交完成才结算，失败不关闭表单、不吞错、不替换其他对象数据。设置、导航、history 和返回共用原未保存门禁，业务 mutation 不由挂载或重连自动触发。

## 6. 原型后端业务初始数据

默认项目 Aurora 协作控制台（`demo-aurora`）的 `release-2026-11`（2026.11 · 体验优化）包含 7 条正式 IR、21 条正式 SR。其中新增团队成员管理、消息偏好设置、附件管理、工作台快捷入口 4 条 IR、12 条 SR；各 IR 保留完整材料、冻结快照、文档合入和独立开发分支，联系人与开发／测试分工可用于查看待办。

开发任务必须覆盖待开发（含未分析与已分析 0%）、开发中、待合入、待验收、已完成。状态由既有公共进度函数从报告、代码合入与同版人工验收派生，不直接写展示状态；待合入必须有明确分析结论且尚未合入，待验收为合入 99%，已完成必须有匹配代码版本的人工通过记录及验收历史。

新增 SR 中保留六条 2026-11-16 至 2026-11-17 的既存历史变化，分别覆盖回到待开发、进入开发中、待合入、待验收和已完成；历史 `to` 必须与当前有效状态一致。它们是服务端预置的历史业务数据，加载不触发状态变化事务；不得按启动／读取时间补造或刷新，其他没有历史的 SR 继续缺失 `statusChange`。随后真实提交仍由 workflow 事务比较有效状态并更新记录。

这批静态 SR 的 `automaticCodeMerge:false` 只保存在 workflow 内部类型，公共投影递归剥离（包括嵌套回执）。后台模拟代码合入跳过它们，避免启动数秒后五种状态全部被推进为待验收；公开分析、分工和人工验收仍沿正常业务门禁，新创建需求的模拟推进保持原规则。

验收：同一 Release 的正式 IR／SR 计数为 7／21，五种状态均非空；最近动态按固定历史时间排序展示五个不同 SR，重复读取时间不变。检查所有新增 SR 的材料归属、分支基点、验收代码版本，以及后台轮询后仍保留五种状态；公共返回不得包含内部控制字段，其他项目／Release 的数据不变。

## 7. 事实来源

`packages/web/src/main.tsx`；`packages/client/src/{websocket,remoteServiceAccess}.ts`；`packages/rpc/src/{protocol,serialization,proxy-channel,channelClient,channelServer}.ts`；`packages/server/src/{http,mock/index,aireq/service}.ts`；`packages/ui/src/aireq/shell/AIReqApplication.tsx`、`shell/remote-data-source.ts`；`packages/ui/src/aireq/conversation/AIReqSessionPane.tsx`。领域页面规则由本目录各领域规格维护，不以帮助文案代替导航与数据代码事实。
