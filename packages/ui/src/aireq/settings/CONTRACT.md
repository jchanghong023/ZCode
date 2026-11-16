# AIReq 设置

当前产品规则以根 `.todo.md` 第 1–172 行已确认要求为准；其旧 Skill 设置接线与验收记录仅描述当时版本。

仅本模块拥有未保存模型与逐 Agent 追加指令草稿；共享业务由 AIReqDataSource/mock 拥有。外观复用当前浏览器偏好。所有合法工号均可修改项目、Release、模型与指令，不投影 owner 写权限。Skill 设计暂从主导航隐藏，不在设置导航或搜索中，旧 `skill` 设置偏好回到项目设置；保留现有实现，不恢复 Skill 目录管理页；模拟路径不触发文件或 Git 操作。

AIReqSettingsPage({onClose, section, onSectionChange, onNavigationGuardChange?, skillActions}) 提供外观、项目／Release、模型、个性化四分区。guard 为 (navigate:()=>void)=>void；壳导航、历史、项目切换、退出与快捷键必须经过 guard。模型、指令与 Skill 脏草稿使用最新动作引用执行保存并离开、丢弃或取消；保存失败留页。Ctrl/Cmd+S 与按钮共用草稿、保存忙态和 UTF-8 字节门禁，不按工号禁用。

模型保存显式提交进入编辑时的 models.revision()；追加指令保存提交 prompts.read().revision。脏草稿不因其他客户端事件推进基线，冲突保留输入。项目编辑捕获 project.revision，新建期望版本为 0；同一输入重试沿用 operationId，改动输入才生成新逻辑动作 ID。
