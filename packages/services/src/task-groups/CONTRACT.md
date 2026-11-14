# 任务分组

当前治理范围（纯 Web）：跨 workspace 分组组织态契约 `contract.ts`（`ITaskGroupService`，通道
`task-groups`）。tasks-index 写入实现已随桌面裁撤移除；mock 后端
（`packages/server/src/mock/domains/projects.ts`）与 `packages/ui/src/project-sidebar/useTaskGroups.ts`
按同一契约注册与调用。

- 控制端 Host 独占写入；CLI 和远端项目服务不接收 Group。结构读取无副作用，任务内容来自现有 Host 树。
- move 是单节点相对位置命令：来源与目标锚点在事务中复检，不以可见快照覆盖全库。所有引用按 canonical
  workspace identity 与 taskId 隔离，服务校验 Host 身份和任务事实。
- 远端离线不删成员，不通过分组服务建立连接；取消组保留全部任务及成员顺序。
- admit 只登记首次出现或首次系统类型标记；独立加法表记录是否已被用户整理与创建 receipt，防止重复刷新
  覆盖手动移出或迟到创建回包覆盖后续整理。登记状态不复制会话事实。
- 所有写入提交后广播 `state:task-groups`；失败不广播，客户端沿用已接受结构并刷新。
- 桌面 continuous 与手机 replayable 复用同一组织 owner。
