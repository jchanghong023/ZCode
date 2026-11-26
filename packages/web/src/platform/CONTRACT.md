# Web 平台适配

`createWebPlatform` 是纯浏览器前端的 `IPlatformService` 实现，承载浏览器本机能力与同源遥测接收端口：

- 下载保存：`saveFile` 接收原始 ArrayBuffer 或 URL 读取结果，最多 50 MiB；URL 只接受
  HTTP、HTTPS、data、blob；异常停止读取。`success` 只表示交给浏览器下载器，不代表已落盘。
- 外链入口：`openExternal` 只允许 HTTP、HTTPS，在新标签页打开。
- 文本复制：`writeClipboardText(text)` 只在实际复制成功后 resolve；HTTP IP 缺少 Clipboard API 时，
  在用户操作内使用临时文本框执行复制，始终移除临时节点并恢复原焦点／选择。复制被拒绝则 reject，
  不覆盖全局 navigator，不缓存剪贴板内容，不把失败显示为成功。
- 遥测：两种 report 端口校验正式严格请求并清洗副本，POST 同源 `/api/v1/telemetry/events`，
  credentials=same-origin，等待 HTTP 202 接纳；非 202／网络错误 reject。服务端再次校验／脱敏，
  交实际服务诊断后返回 202，仅表示接收，不承诺第三方上传／持久化；无本地 CustomEvent、重试或队列。
  两种 kind 分别对应 RendererTelemetryEventPayload／ArmsCustomEventPayload，信封、payload 与 context
  拒绝未知字段；声明的 detail／properties 字典保留扩展值但按既有规则脱敏，调用方原对象不变。
  部署 token 复用 `/api/` 访问控制；工号不是认证。业务调用方保留遥测失败隔离，不掩盖主业务结果。
- 界面缩放：`changeInterfaceZoom` 同步更新根元素 CSS zoom（50%–200%，每步 10%，reset 为
  100%），唯一状态为根元素样式；不改字号、不保存后端设置，刷新恢复默认。页面级快捷键与
  footer 走同一端口，监听由 Web 入口持有，不在平台实例或组件挂载时重复注册。

业务连接的身份由连接层管理，不由 `IPlatformService` 发放。

浏览器与后端边界见 `docs/architecture/mock-backend.md`；本机能力受浏览器权限约束，不等于宿主能力。
