# Gen UI

当前 AIReq Web 产品不提供 `pluginSandbox`。assistant 正文直接使用原 `MessageResponse`，不解析为交互卡片，不创建页面、登记动作或声明沙箱执行成功。

本模块仅保留 reference/source-file 的纯投影资产：Unicode JSON marker、`::visualize{path="..." title="..." mode="wide"}` 与 JSON directive 使用原 schema、Markdown 代码排除及完成态判定。`collectGenUiSourcePaths` 和 `matchesGenUiSourcePath` 仍供现有文件摘要与预览投影使用，不授权读取文件，不改变消息或 v4 wire。

