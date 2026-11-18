# AIReq 设置

`AIReqSettingsPage` 由 shell 受控传入 active、section、返回动作与定位请求。侧栏仅外观、项目配置、AI 配置；AI 配置页签为模型、Agent 指令和分析设置。section 为 appearance/projects/models/personalization/analysis，不另建页面选择 owner。

本模块拥有未保存模型、逐 Agent 指令与项目／Release 编辑草稿；共享业务归 AIReq 数据源。外观使用浏览器偏好。设置搜索仅注入当前可达字段，命中先消费导航门禁，再对挂载行滚动、聚焦和高亮，不恢复其他产品分区。

唯一 guard 管理保存并离开、丢弃或取消；壳导航、返回、历史、项目切换、退出、页签与快捷键共用它。Ctrl/Cmd+S 与按钮共享当前草稿、忙态和 UTF-8 字节门禁。保存失败留页保留输入，后台重读不推进脏草稿基线。

模型和指令提交 bootstrap 捕获的 expectedRevision；项目编辑使用打开时 project.revision，新建为 0，同输入重试沿用 operationId。全部合法工号可保存，负责人或后端 owner 不构成写权限。

项目弹窗草稿归 `AIReqProjectSettings`，以 `onDraftActionsChange` 接入同一 guard；关闭、Esc、遮罩、取消和快捷键使用最新动作，保存中不能退出或重复提交。仓库为可选择只读文本，不展示后端配置目录。

Skill 无设置／搜索入口，但保留草稿动作接入门禁；保存提示只依据正式收据。正文复用原生 SettingsFrame 内容列，补充说明与明细通过原生 details 收拢，控件与提交规则不受影响。

完整规则见 `docs/specs/aireq-migration/tools-settings.md`；公开契约及发布边界见 `contract-design.md`。
