---
name: session-management
description: 修改 ZCode 会话、sessions-index、项目与 workspace 身份或相关迁移契约前使用，明确当前浏览器与内存后端的事实所有权。
---

# 会话与项目所有权

## 当前范围

当前产品为电脑浏览器与内存后端，没有桌面 Host、远控 Source Server 或仓库内 CLI 会话数据库实现。不能依据保留 DTO、迁移算法或控件恢复这些产品入口。

先读 `docs/README.md` 与 `docs/architecture/pure-web-module-ownership.md`，按对象阅读：

- 身份与连接：`docs/specs/aireq-migration/connection-identity.md`。
- 原生讨论：`docs/specs/aireq-migration/conversation.md`。
- 项目导航：`docs/specs/aireq-migration/project-space.md`、`docs/specs/aireq-migration/section-navigation-and-ideas.md`。
- 后端状态与替换：`docs/architecture/mock-backend.md`。
- 项目读取：`packages/services/src/project/CONTRACT.md`。
- 保留的组织态类型与迁移算法：`packages/services/src/project-storage/CONTRACT.md`、`packages/shared/src/sqlite-migrations/CONTRACT.md`。

## 唯一事实源

- AIReq workflow owner 持有项目、Release、需求、材料与业务会话引用；UI Context 仅持有项目／具体 Release、对象及历史。
- `MockRuntime` 与原生 agent owner 持有会话、消息、附件、队列、订阅和水位。不从任务镜像恢复不存在的会话，不在 UI 复制 accepted queue。
- `projectService.readTree` 与 `resolveSessionDirectories` 只读同源事实，逐连接绑定合法员工与 clientId；不另建项目 map、目录扫描或会话准备写入。
- 已发布业务会话按正式引用共享；未发布草稿严格按员工与客户端归属。读取失败不得回落到其他人的会话或样例。
- 原生命令保留首次接纳的 clientId；查询、恢复、重试和另一客户端提升不能改写输入来源。
- sessions-index 与 conversation 的订阅分别由原生 owner 管理；取消或断开一条连接不影响另一条。

## 身份、时序与写入

1. identity 与路径分别表达身份和位置；不能用相同路径判定同一 workspace，不能把 identity 写入 cwd。
2. 目录解析核对任务、业务 workspace、稳定身份与草稿归属，不创建目录、不启动 Agent、不更改 cwd。
3. 写入只走现有命令，版本、幂等和阶段门禁按实际签名，不承诺统一 CAS 或跨重启 exactly-once。
4. 先提交事实，再发布失效事件；客户端重读并拒绝迟到结果，重连不自动重放 mutation。
5. 读取、初始化、快照缺席和展示筛选不能制造删除、完成或活动时间。
6. 退出工号或切换页面不能清除服务器共享项目、会话事实与报告。

## 保留基础设施

项目存储接口和 SQLite 迁移模块不表示当前后端已持久化。涉及它们时保持 checksum、显式 touchedTables、事务和备份恢复边界，不虚构 tasks-index.sqlite 或 CLI 实现。

验证按根规则及任务要求执行，不引用旧截图或测试历史作为现状证据。现行政策见 `docs/testing/unit-test-quality.md`。
