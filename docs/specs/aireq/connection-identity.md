# 连接身份、版本与顺序

服务清单见[契约设计](contract-design.md)，部署访问控制与内存限制见[后端拓扑](../../architecture/mock-backend.md)。

## 1. 身份来源

应用入口只填写工号。校验格式通过即可进入，工号用来标记消息发送人和实际操作者，应用登录无需本人认证。用户可查看所有项目和 Release 的共享内容，可修改共享配置并执行满足工作流条件的操作。

Web entry 是连接生命周期 owner，首次连接读取持久 `getV4ClientId()` 并固定；工号来自 `EmployeeEntry`。AIReq identity、WebSocket、v4 握手与命令共用同一 clientId，设备 stream 指纹不代替业务身份。

`AIReqIdentity` 仅含 employeeId/clientId：

- employeeId 匹配 `/^[a-z][0-9]{8}$/`。
- clientId 为非空白字符串，长度不超过 200；不额外假定必须为 UUID。
- 额外身份字段拒绝。`/ws` 查询仅接受各出现一次的 employeeId/clientId/可选部署 token，场景参数拒绝。

服务端在升级前验证自报身份；`getConnectionServices` 冻结连接身份，后续 bootstrap/call 的 employee/client 精确匹配，原生命令 envelope.clientId 也匹配。项目树与目录解析通过同一身份读取。请求局部上下文使用 `AsyncLocalStorage`，不用全局可变工号。

项目、Release、IR、SR、会话、阶段与版本校验用于定位正确对象并接纳工作流操作。联系人和负责人用于分工和待办派发，实际操作按执行时的工号记录。业务、开发、测试三个确认角色可由任一工号分别完成，规则见[三方确认](proposals.md#方案完整审查与三方确认)。部署 token 的作用域是整站访问。现有 Skill 私有会话按 employeeId 和 clientId 隔离。

## 2. 工作区与会话

opaque backend.id/workspaceIdentity 用于隔离，不用于来源展示或产品模式分支。`MockRuntime.workspaceKeyOf` 优先使用非空 workspaceIdentity，否则由主机及规范工作路径生成稳定身份；wire 完整 workspace 引用同时含 workspacePath/workspaceKey。调用方不得另造与实际请求不一致的 key。

命令入口核对外层请求与 envelope 工作区；分页、会话、附件及订阅继续检查业务绑定与 workspace。Project 树仅投影当前业务及该身份可访问的会话，includeDeleted 不扩大权限，不枚举宿主目录或他人私有草稿。

原生会话绑定与项目目录从 workflow owner 的即时只读查询取得最小事实；绑定查询不派生待办／进度或逐项目重读完整 workflow，目录一次取得项目工作区及 canonical 会话映射。查询只复制所需结果，不缓存另一份目录、不改变 revision、状态或事件。公开资格仍由当前项目及 IR 的 canonical 引用裁决，故障会话过滤、私有草稿 actor 与 Skill 私有归属、workspace 精确匹配继续在原边界执行；轻投影不能替代这些校验。

`origin:"realUser"` 行使用接纳时已校验的 clientId。现行原型的排队、提升及续跑保存原 QueueItem.clientId，后续请求不能覆盖。实时帧、快照与分页读取同一行事实。正式聊天的发送行为见[会话产品要求](conversation.md#会话产品要求与原型范围)。

已发送的讨论、评审消息和随消息发送的附件对所有进入系统的工号共享可见。项目和 Release 选择用于筛选及定位内容。未发送正文、附件与输入历史由 composer 按工号、浏览器客户端、工作区和具体会话独立保存。切换工号从该工号自己的草稿恢复。同一工号在不同客户端各自保留草稿，已发送内容通过会话共同读取。临时模型和模式属于单次 Submission。当前草稿实现见[原型差异](conversation.md#当前原型差异)。

验收使用两个工号和两个浏览器会话，核对已发送内容的共享读取、发送人显示、切工号后的草稿隔离及同工号在不同浏览器中的草稿隔离。

## 3. 相互独立的版本

| 版本                                    | 含义                                          |
| --------------------------------------- | --------------------------------------------- |
| `AIREQ_CONTRACT_VERSION=4`              | bootstrap 契约兼容性，客户端不匹配则拒绝装配  |
| Protocol v4 wire `3`                    | hello/clientHello 与二进制 wire 版本          |
| snapshot `protocolVersion=1`            | 会话投影格式，不是 wire 版本                  |
| workflow revision、材料／候选／代码版本 | 对应业务 CAS、批准、分析及验收绑定            |
| 模型配置、提示词、目录 revision         | 分别属于各 owner，不互相替代                  |
| session revision                        | 原生命令 CAS                                  |
| topic logEpoch/seq                      | 投影日志代际与顺序，不是 AIReq bootstrap 水位 |

AIReq 事件的 backendEpoch/revision/对象/operationId 字段可选，bootstrap 没有全局事件水位，不承诺持久重放或跨重启 exactly-once。

## 4. CAS 与幂等

- `command` 按 employee/client/operationId 保存回执，摘要包含目标与业务参数，不包含首次 expectedRevision／外层 revision。同 ID 同内容重读后显式重试返回原回执，同 ID 改内容拒绝；新请求校验首次版本及阶段。
- 项目保存、排期、测试验收、清理与 Skill 预览保存沿各自输入类型的版本／operationId，并非统一全局事务号。
- `models.save`、`prompts.save` 只有 expectedRevision，没有 operationId。
- `skillDesign.saveDraft` 和 scheduler 的 setProjectEnabled/configure/runNow 没有请求 CAS／operationId，按当前覆盖保存／调度规则执行。

原生命令先解析 envelope、核对身份和请求工作区，再按 actor/session/commandId 查决定。相同完整请求返回原 ACK，不因首次成功后的 revision 变化重复执行；同 ID 不同输入拒绝。新命令才校验 `COMMANDS_REQUIRING_BASE_REVISION`；行命令还比较 baseLogEpoch、rowId/entityId。陈旧请求不改变事实、队列或水位。query 返回已知决定与当前 turn 事实。

accepted 表示接纳真实转换，不等于后台执行完成；无需变化为 noop，未实现为 rejected 与明确 reasonCode。所有幂等记录仅在当前进程有效。

## 5. 失效通知与重连

`createRemoteAIReqDataSource` 先订阅 onDidChange，再读 bootstrap 和项目 workspace。读取捕获失效代次，期间有事件则丢弃并补读；初始化失败释放订阅。后续 metadata 刷新单 flight，读取期间再失效则继续补读。

事件只失效投影；错误可见，后续读取可修复。刷新不抢占导航、不覆盖 dirty prompt，保存不能清掉保存期间的新编辑。dispose 与读取代次使迟到响应失效。

连接关闭或出错终结旧 pending 请求。重连替换 accessor、attachment 和订阅，保留同一工号生命周期中的组件挂载、store、正文与附件草稿，重新绑定广播且入站偏好只应用一次。有限退避后可显式重连，退出工号终止旧连接尝试。重连只订阅与重读，不自动重放 create/send/save/confirm/分析 mutation。

## 6. 原生 topic

- conversation 的 seq/logEpoch 属于 MockSession。
- 快照 fromSeq=0、toSeq=当前水位，不推进；增量 `(fromSeq,toSeq]` 每条发布推进一次，同 topic 订阅者使用相同区间。
- conversation 随投影推进，即使暂无订阅者。
- 每次订阅生成新 subscriptionId；`createZCodeAgentConnectionScope` 只路由本连接所属帧。重连重新订阅，不复用旧 ID。
- 跨连接 resync 为 `fault.subscription.notOwned`，未知订阅为 `fault.subscription.unknownSubscription`；非本连接 unsubscribe 幂等忽略，不删除他人订阅。
- conversation 按会话及 workspace 隔离。会话删除后迟到 turn 不重新创建会话或启动下一队列项。

## 7. 浏览器 ID 与附件摘要

局域网非 loopback HTTP 不能依赖 crypto.randomUUID/subtle。普通浏览器 UUID 使用 shared createUuid 的 getRandomValues 路径，不改写全局 crypto，不改变命令／操作 ID 分配和显式重试时点。附件仍提交完整字节 `sha256:<hex>`：安全上下文用 WebCrypto，其他支持环境用浏览器 SHA-256 实现，不放宽服务端校验。

## 8. 二进制与协议接线

同源 `/ws` 使用 `@zcode/rpc` 的 SocketProtocol。`connectViaWebSocket` 用 ArrayBuffer 包装 ISocket，收到 Channel Initialize 后返回 RemoteServiceAccess。替换后端须实现相同字节格式：

- 帧头固定 13 字节：type:u8、id:u32BE、ack:u32BE、payloadLength:u32BE，普通消息 type=1；跨 message 半帧与粘包按 `packages/rpc/src/protocol.ts`，不增加透明重放。
- payload 的 header/body 序列化、类型标签、VQL 长度、UTF-8 与二进制 marker 按 `serialization.ts`，不能替换成自定义 JSON。
- 服务端为每条连接装配 ChannelServer，客户端在收到 Initialize 后发起调用。
- 请求 ID 对应当前连接，Promise success/error、取消、事件 listen/fire/dispose 按 channels.shared/channelClient/channelServer。
- ProxyChannel 方法实参为数组；onXxx 为 Event，onDynamicXxx(arg) 为参数化 Event，释放监听即退订，不作为普通 Promise 方法。

v4 hello/initialize 后订阅 conversation，ACK 与 owned notification 分离；首帧经现有 response 后通知路径发送。wire complete/fragment 使用 shared wire-codec/wire-reassembly 的尺寸、校验与 typed fault，客户端重组后才应用逻辑帧。

## 9. 附件传输

附件通过 begin/chunk/commit/abort/read，不经宿主路径转移。begin 绑定 actor、session、workspace、文件名、MIME、总字节／块数及 SHA-256；当前上限 20 MiB、4096 块，每块不超过 512 KiB。块按序提交，相同已接纳块可复用但不可改写；commit 校验完整大小与 `sha256:<hex>` 后返回 ref。

发送采用同一真实字节。abort 不删除已被行、队列或提升项采用的字节；读取核实 workspace／会话／采用行和可见性。其他操作者只可读取已发布共享会话真实采用的附件，不可读取私人暂存。read 的 offset 非负、limit 为 1—512 KiB，返回 dataBase64/mediaType/totalBytes/nextOffset；会话已删除不能因读取重建。

## 10. 源码依据

`packages/server/src/aireq/identity.ts` 的 validateAIReqIdentity/withAIReqIdentity；`service.ts` 的 getConnectionServices 与回执分派；`packages/web/src/main.tsx` 的连接 owner；`packages/client/src/websocket.ts` 的连接装配；`packages/rpc/src/{protocol,serialization,proxy-channel,channelClient,channelServer}.ts` 的传输；`packages/ui/src/aireq/shell/remote-data-source.ts` 的失效代次；`packages/server/src/mock/{runtime,zcodeAgent}.ts` 的 CAS／topic；`packages/shared/src/zcode-protocol-v4/{core,snapshot,sessions-index}.ts` 的版本。
