# 配置目标目录投影

`readConfigCatalog` 复用 services 的 `readProjectCatalog`，后者只读当前项目服务投影。目录不拥有项目、roots、任务、tab 或连接事实，不创建项目或启动 Agent。

`projectConfigTargets(snapshot, existing)` 过滤软删除项目，按 rootPath 去重，将已存在目标的连接展示信息合入输出；标签从路径末段派生。输出仅为配置目标投影，不改变 workspace 身份或执行目录。

`useConfigWorkspaceTargets` 返回 targets 与当前 services 对应的 loaded；读取完成前不能把空 targets 当成删除。`useConfigWorkspaceServicesResolution` 仅复用当前 workspace 的服务解析，不创建跨设备 Source settings attachment，不回落到另一 Host。

保留配置目标 hooks 不表示当前产品开放旧桌面配置目录管理入口。
