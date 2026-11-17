# 分析执行报告接入统一右侧 Tab

2026-11-17 用户授权统一 Side Pane。本文补充 unified-side-pane.md 的 analysis 内容端，不新增服务、状态 owner 或主区选择。

- 分析任务最近报告、失败原因及执行历史报告入口统一发出 `open({kind:'analysis', selection:{projectId,irId,srId}, releaseId, title, runId})`。目标来自当前实际行；不由当前主区选择猜测，不再由分析列表 Dialog 保存执行报告。
- analysis Tab 自己读取指定 runId 的 `readRun`，并验证 projectId／IR／SR／Release 与 Tab 身份相同，再按同一精确对象 `queryTasks` 及 `read` 得到当前重试资格。局部保存的是读取投影；scheduler 是业务唯一 owner。
- 查询沿用 useSchedulerQuery 的 load 函数身份和 effect 清理代际：目标改变时立即舍弃旧目标结果，迟到返回不写入新 Tab；同目标后台失效刷新保留已读内容，显示更新失败及重试。Tab 非激活时保持内容和滚动，不启动新的查询／订阅；再次激活失效重读。
- 报告正文抽为可嵌入内容，完整执行信息、模型绑定、分支复制、代码依据、已实现／待完成／风险／活动、失败原因与下一步均保留。Dialog 兼容包装只消费相同正文，不存在第二份报告实现。
- 单 SR 重试先重新读取本 Tab 的 run、精确 task 及项目配置；检查当前失败是否可重试、项目开启、SR 非完成且未运行，再 `runNow({projectId,releaseId,irId,srId})`。不使用主区当前范围或其他 Tab 结果，不在打开报告时自动执行分析。同一次点击运行中不重复接纳，关闭Tab不撤销已接纳业务。
- 报告和列表内“打开需求”打开同对象 report Tab，主区列表、筛选、当前选择不改变。复制及加载／失败／提交反馈属于当前 Tab，不污染其他 Tab。

验收：同时打开不同 runId 的 Tab，切换后各自显示对应执行；同 runId 重复打开复用；主导航切换不清报告；失败／不存在／错归属明确反馈且可重试；刷新与迟到读取不串对象；精确 SR 重试不派发其他任务；复制、打开需求和滚动保留。电脑浏览器深浅主题检查，不做手机适配。
