# Web 平台适配

`createWebPlatform` 是纯浏览器前端的 `IPlatformService` 实现，只承载浏览器本机能力：

- 下载保存：`saveFile` 接收原始 ArrayBuffer 或 URL 读取结果，最多 50 MiB；URL 只接受
  HTTP、HTTPS、data、blob；异常停止读取。`success` 只表示交给浏览器下载器，不代表已落盘。
- 外链入口：`openExternal` 只允许 http/https；反馈与社群地址由同源客户端配置解析。
- 浏览器通知：任务通知与扩展通知使用 Notification API；点击回调由平台实例唯一持有，
  扩展通知按每插件 60 秒 1 条、每日 20 条限流。
- 遥测：mock 后端没有接收端，平台只派发本地 `zcode:telemetry` 事件，不伪装成服务端上报。
- 设备标识：浏览器物理属性指纹。

`IPlatformService` 不再保留本机路径选择、本机应用、文件管理器、编辑器枚举、MCP 用户目录、
宿主临时文件、产物物化或媒体 URL 等仅用于返回空/不支持的宿主端口；对应 UI 入口已删除，
调用方改用后端 workspace 服务或浏览器原生能力。内嵌浏览器、原生窗口、桌面命令、
应用内购买、deep link OAuth、日志导出等 Desktop 能力已从契约移除。

浏览器本机能力与服务端工作区能力的边界见 `docs/ui/browser-capabilities.md`。
