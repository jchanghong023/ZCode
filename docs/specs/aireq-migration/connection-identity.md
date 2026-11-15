# AIReq 连接身份与订阅收敛

## 身份与所有权

- Web entry 是当前连接的唯一 owner。首次渲染前初始化 stream client ID，再读取 `getStreamClientId()` 的规范值并固定；每次 `/ws` 连接传 `employeeId`、同一 `clientId`，以及当前页面 URL 的可选 `demo`。
- AIReqApplication 对同一登录生命周期固定业务 identity：工号来自 entry，clientId 来自同一 stream singleton，demo 来自当前页面 URL。原生与业务调用必须具有完全相同的 employee/client/demo scope。私有 Skill 不能退化为仅按工号授权。
- accessor 换代仅更换 attachment 和订阅；不得以连接代次作为 React key。退避、旧 attempt 失效和明确退出行为保持不变，正文、附件、当前选择及草稿 owner 不重挂。连接成功状态只需布尔值，不维护无用途的累计代次。

## 时间与失效边界

1. 创建 remote data source 时先安装 `onDidChange`，然后才读取 bootstrap。
2. 初始化期间每个变更推进本地失效代次；读取捕获其起始代次，期间发生变更则丢弃该次 bootstrap 并补读，直到一次读取完整覆盖已观察的失效。现有 bootstrap 不暴露全局 epoch/revision 水位，不能把事件可选 revision 伪装成快照水位或持久重放能力。
3. 初始化失败立即释放订阅，不返回半初始化 source。事件错误保留为可见错误；后续读取可以修复，不重放写请求。
4. 后续 metadata 读取共用单一 flight；读取期间收到 metadata 失效则补读收敛。dispose 使迟到结果失效。配置读取不修改本地 selection；dirty prompt 不被异步配置刷新覆盖，保存完成也不能清掉保存期间的新编辑。
5. 事件只负责失效；新 attachment 重新读取当前选择和服务端状态。重连不执行 create/send/save/confirm 等写请求，不另建全量业务缓存或通用重试框架。

## 回归证据要求

- 比较同一页面的业务 identity 与 native `/ws` query，包含规范化 clientId 和 `?demo=analysis-scale`，私有 Skill 会话仅对应精确 scope 可读写。
- 在首个 bootstrap pending 及 resolve 周期触发变更，必须补读，不得遗漏；初始化 reject 后订阅已释放。
- 并发配置失效和本地 prompt 编辑不丢新输入；切换项目与重连不恢复旧 selection，不卸载正文和附件。验证由集成 owner 统一执行。

主集成已核对bootstrap、actor与client/demo精确scope样例，并实测首发使用同owner/workspace的原生预热session：完整PNG及两次独立原生首发均自动打开canonical accepted会话。visitor会话读取失败后点击“重新连接”，通过重连前作用域化回调恢复同一会话编辑器，console零错误；刷新/关闭后服务任务状态延续及mock重启恢复初始样例也有观察。模型设置往返时工作页保持隐藏且inert，返回完整canonical未发送正文、PNG及临时GPT/medium均保留且不自动发送；Skill的完整PNG、四字段、手工追加与预览Tabs/折叠往返亦已实测。上述是具体场景证据，不等于每个bootstrap竞态、迟到响应或真实WS关闭场景均独立通过。

临时模型/模式属于每次Submission，不是Session持久默认；发送后工具栏恢复Session默认不构成执行丢失证据，不引入promotion快照或永久override。mock沿userInput/queue/runTurn传递受支持Submission字段，并在await前捕获回复模型；该实现的运行核验及最终真实WS重连、工程门禁结果统一引用根 `todo.md` 主集成最终记录，不在本文维护中间待验清单。

## 入口高度边界

登录成功后的 entry 容器必须继续作为纵向 flex 容器传递确定的视口高度，工作页只在内部表格／正文区域滚动。真实 1440×1000 浏览器曾观察到中间 block 容器使工作页膨胀至 1360px、侧栏项目和退出入口落到视口外；验收要求工作页高度不超过 1000px，页脚始终可达，不以隐藏正文或禁用滚动掩盖问题。

主集成在 Chrome（精确终验版本见根 `todo.md`） 的 1440×1000 与 1122×763 视口完成全部8工作页及5设置页渲染与截图；entry flex 和分支状态修正后，1440×1000 的 viewport／document／main 高度均为 1000px，页脚可达，正常页面console零warning/error。深色与visitor独立浅色已测，不以Chrome代称Firefox；最终系统主题与全页证据、精确命令和结果只以根 `todo.md` 主集成最终记录为准。本文同步不执行浏览器或工程检查。
