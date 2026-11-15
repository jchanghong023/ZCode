# AIReq UI

公开入口为 AIReqApplication 与 AIReqApplicationProps；替代旧聊天产品，不并行挂载 Root/App。

共享业务事实仅归 aireq-contract 所描述的服务端 owner。shell 仅持有可失效读取投影、导航和未发送草稿；每次调用显式 identity。元数据和选择读取用代际阻止晚响应覆盖，后台重读不卸载工作区。已有二进制连接按后端和工号建立，项目切换不创建连接；重连只重读，不重发操作。设置的未保存门禁先于导航和退出。基础控件、主题、Provider 和 v4 会话复用当前 UI。

Footer 业务桥仅为 `shell/AIReqWorkspaceFooter.tsx`，复用通用 `WorkspaceSidebarFooter` 的可选 presentation/menu ReactNode 端口；默认通用 footer 行为保持不变。自定义菜单隔离账户、用量及 entitlement 查询，不挂载旧 Coding／Office／登录菜单，也不伪造 UserInfo。业务桥只读既有 context 和 data-source 元数据（含 backend.owner／provenance），项目／Release 选择经 ai.navigate 进入唯一未保存门禁；不保存第二份选择。公开 props 为 onOpenSettings、onManageProjects、onLogout、onHelp 和可选 settingsButtonMode（settings／back）；管理明确打开项目设置，普通齿轮由 shell 恢复当前设置页，back 由 shell 执行受保护返回。主题复用当前 ZCode store 与原生主题菜单；设置 footer 仅保留身份、切换工号、帮助和主题，不导入设置页 section 类型。

onHelp 可接收当前 footer 的 HTMLButtonElement（或 null）；各实例自持触发 ref，不共享不稳定的工作区／设置 ref。`AIReqWorkflowHelp({open,onOpenChange,returnFocusRef?})` 仅呈现八步业务说明并在关闭时恢复触发焦点，不持有业务状态或导航；描述遵守共享 mock 项目／内存持久边界。
