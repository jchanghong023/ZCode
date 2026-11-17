# AIReq UI

公开入口为 `AIReqApplication` 与 `AIReqApplicationProps`。前端只消费 `@zcode/services/aireq` 的正式数据源与现有原生 v4 会话，不保存第二份业务事实。

## 导航与范围

`AIReqContext` 唯一持有项目、具体 Release、对象选择、页面与浏览器历史。侧栏选择项目及 Release，无全部版本选项。全局页面为项目总览与想法池；项目内页面为当前项目、需求共创、我的待办、开发任务和进度分析。没有显式目标时进入项目总览。

待办先按当前项目和具体 Release 过滤，再统计和筛选我的／待认领／全部；概览统计同范围全体人员。待办的需求名、SR 名和职责来自服务端同源投影，分配使用实际 assignmentPerspective，不从文案猜测，不提供勾选完成状态。

导航、历史、项目／版本切换、设置往返和退出均消费唯一未保存门禁。Context 不建立项目读取缓存或平行范围。读取以代际拒绝迟到结果；业务事件只使投影重读，重连不自动重放写入。

当前项目的上下文返回来源仅由 Context 导航状态持有，并随同身份、会话的浏览器历史恢复；仅显式从概览打开目标时产生。侧栏直达、切项目／Release 清除来源，返回复用 select 与既有门禁。Shell 保留同范围概览挂载以保存筛选和滚动，不保存第二份业务投影；返回带使用既有顶部空间，和正文列对齐。具体规则及验收见分区导航规格。

## 工作区

想法池导入／导出单列原始需求 CSV；正式导入只发 `importIdeas`。转入选定版本经正式命令原子创建提案。需求共创的新增与批量导入立即创建提案，不自动运行 AI、拆 SR 或批准；业务 Markdown 只对应新 IR 的 requirements.md。

讨论复用原生会话。单业务评审、完整材料审查、人工放行与三视角确认分别展示服务端阶段；历史、旧版本及 PR 冻结版只读。正式需求与分析读取同一报告，AI 分与有效进度分开：合入为 99，匹配代码版本的人工通过才为 100。分支清理使用正式预览和确认命令。

右侧统一多 Tab 由 `side-pane/AIReqSidePaneContext.tsx` 管理，报告、材料、历史与分析共享打开、激活、关闭、恢复、排序和完整视图控制；每个 Tab 保留自己的对象和 Release。Tab 注册离开门禁，不建立第二份业务 owner。具体契约见 `docs/specs/aireq-migration/unified-side-pane.md`。

## 身份与展示

`zai-motion` 默认动效主题与既有主题共用 store／广播路径；暂时注释主题本地记忆的读取与写入，每次启动使用动效主题，当前会话仍可切换，既有存储值不删除。`AIReqMotion` 仅持有有界装饰节点与一次性动画，不保存坐标或导航事实；原主题、减少动态效果与性能模式无新增指针监听。视觉与性能边界见 `docs/specs/aireq-migration/motion-theme.md`。

Web 连接、AIReq identity、v4 握手和命令信封使用同一 clientId。全部合法工号可执行满足对象、版本、幂等及阶段门禁的操作；负责人不是权限。私有草稿仍按员工与客户端隔离。

设置为外观、项目配置和 AI 配置；AI 配置含模型、Agent 指令及分析设置。共享模型／指令使用编辑基线和草稿门禁。Skill 实现、私有会话、附件、预览及保存链保留，但不提供主导航、设置或搜索入口。Sketch 保留真实画布及 PNG 附件。

Footer 业务桥复用通用 footer 的展示端口，仅提供当前工号、切换、帮助和主题等辅助工具；不挂载旧账户交易菜单，不消费后端来源元数据。页面共用居中内容列与主题 token。工具错误展示安全正文，不把错误码当用户文案；MR 平台核验只读取正式布尔事实，不由状态或链接推断。

业务规格见 `docs/specs/aireq-migration/section-navigation-and-ideas.md`、`project-space.md`、`proposals.md`、`tracking.md` 与 `tools-settings.md`。公开服务边界见 `contract-design.md`；部署限制集中于 `release-surface.md` 与 `docs/architecture/mock-backend.md`。
