# AIReq 设置

仅本模块拥有未保存模型与逐 Agent 追加指令草稿；共享业务由 AIReqDataSource/mock 拥有。外观复用当前浏览器偏好。项目、Release、模型、指令只允许 j00808874 写；技能目录所有人只读。模拟路径不触发文件或 Git 操作。

AIReqSettingsPage({onClose, initialSection?, onNavigationGuardChange?}) 提供五分区。guard 为 (navigate:()=>void)=>void；壳导航、历史、项目切换、退出与快捷键必须经过 guard。模型/指令脏草稿使用最新动作引用执行保存并离开、丢弃或取消；保存失败留页。Ctrl/Cmd+S 与按钮共用权限和 UTF-8 字节门禁。

模型保存显式提交进入编辑时的 models.revision()；追加指令保存提交 prompts.read().revision。脏草稿不因其他客户端事件推进基线，冲突保留输入。项目编辑捕获 project.revision，新建期望版本为 0；同一输入重试沿用 operationId，改动输入才生成新逻辑动作 ID。
