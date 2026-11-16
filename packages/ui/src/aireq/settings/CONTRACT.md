# AIReq 设置

AI 配置的共享范围、职责与生效说明、模型滚动提交区及间隔预设／自定义展示以 `docs/specs/aireq-migration/ai-configuration-usability.md` 为准；草稿与提交所有者及接口保持以下契约。

当前导航和页面组织以 `docs/specs/aireq-migration/project-space.md` 为准，其余产品规则见根 `.todo.md`；旧 Skill 设置接线与验收记录仅描述当时版本。

当前产品设置搜索、项目／分析 Agent 定位及固定侧栏可见标签以 `docs/specs/aireq-migration/navigation-usability.md` 为准。搜索仅注入 AIReq 可达字段，不恢复已裁撤设置；目标选择先经现有未保存门禁，定位意图不持有第二份项目或配置事实。

仅本模块拥有未保存模型与逐 Agent 追加指令草稿；共享业务由 AIReqDataSource/mock 拥有。外观复用当前浏览器偏好。所有合法工号均可修改项目、Release、模型与指令，不投影 owner 写权限。Skill 设计暂从主导航隐藏，不在设置导航或搜索中，旧 `skill` 设置偏好回到项目设置；保留现有实现，不恢复 Skill 目录管理页；模拟路径不触发文件或 Git 操作。

AIReqSettingsPage({onClose, section, onSectionChange, onNavigationGuardChange?, skillActions}) 的 68px 图标栏只提供外观、项目配置、AI 配置三类；AI 配置以受控文字页签组织模型、Agent 指令、分析设置。`section` 保留 appearance/projects/models/personalization 并增加 analysis，唯一选择仍由 shell 传入，不增加平行分类或页签状态。模型与 Agent 指令沿用原设置搜索 ID，分析设置使用 agentBehavior ID，搜索和模型直达均落到同一 AI 配置页签。共享 Agent 指令不表示个人偏好。

底部齿轮与工作台设置入口同位置、同尺寸，以选中样式和 `aria-current="page"` 表示当前设置，不持有新状态或绑定导航动作；重复点击保持分区、滚动和草稿。顶部返回仍走既有 guard。共用 frame 的 footer 在较窄电脑窗口同样可见。

guard 为 (navigate:()=>void)=>void；壳导航、历史、项目切换、退出、AI 页签与快捷键必须经过 guard。模型、指令、分析间隔与 Skill 脏草稿使用最新动作引用执行保存并离开、丢弃或取消；保存失败留页。Ctrl/Cmd+S 与按钮共用草稿、保存忙态和 UTF-8 字节门禁，不按工号禁用。AI 页签栏保持挂载与键盘焦点，获准切换 section 后重置正文滚动；设置行搜索仍在挂载后定位目标。

模型保存显式提交进入编辑时的 models.revision()；追加指令保存提交 prompts.read().revision。脏草稿不因其他客户端事件推进基线，冲突保留输入。项目编辑捕获 project.revision，新建期望版本为 0；同一输入重试沿用 operationId，改动输入才生成新逻辑动作 ID。

项目／Release 弹窗草稿唯一归 `AIReqProjectSettings`，通过 `onDraftActionsChange` 接入设置页同一个 guard；关闭、Esc、遮罩、取消、导航和保存快捷键共享最新保存／丢弃动作。字段基线在打开时捕获，后台投影不推进脏草稿基线；保存中禁止退出与重复提交，失败保留输入。项目卡以可选择的只读文本呈现仓库，公共共享／模拟说明集中一次，Release 统计展开 IR／SR 含义；具体布局及验收见导航可达性规格。
