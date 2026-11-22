# 当前系统文档

## 系统范围

AIReq 是面向电脑浏览器的纯 Web 应用。用户在项目与 Release 下把想法推进为提案，经澄清、评审和人工确认后交付正式文档。文档 PR 合入核验后可查阅正式材料及讨论评审历史。Sketch 支持绘图和 PNG 附件。

用户填写工号即可进入，工号用来记录消息发送人和实际操作者。业务会话已发送的正文和附件全员可见。详见[连接身份](specs/aireq/connection-identity.md#1-身份来源)。

`/chat` 是免登录的 [Web Agent 聊天入口](specs/web-agent-chat.md)，使用独立的内存会话空间和原型 Agent。

当前阶段在单进程内存原型上开发和验证业务，重启会重新初始化。正式产品的聊天使用 OMP 原生 Agent，见[会话产品要求与原型范围](specs/aireq/conversation.md#会话产品要求与原型范围)。模型执行、Git 托管、数据库持久化和宿主业务文件写入见[发布边界](specs/aireq/contract-design.md#发布边界)。启动与部署见[快速开始](../README.md)。

## 产品与交互

- [从一句业务诉求到正式文档](briefings/requirements-collaboration.md)。梳理提案八阶段的人机分工、FDTH 案例和首次试用。
- [项目／版本／导航／想法／待办](specs/aireq/section-navigation-and-ideas.md)。
- [提案流程](specs/aireq/proposals.md)、[正式文档与版本待办](specs/aireq/tracking.md)、[原生会话](specs/aireq/conversation.md)。
- [AI 配置与 Agent 角色](specs/aireq/tools-settings.md#agent-角色)、[文档格式](specs/aireq/tools-settings.md#文档格式)、[右侧工作区与材料](specs/aireq/unified-side-pane.md)、[动效主题](../DESIGN.md#默认动效主题)。

## 架构与工程维护

- [服务端与后端替换边界](architecture/mock-backend.md)。
- [公开接口](specs/aireq/contract-design.md)、[连接身份与二进制协议](specs/aireq/connection-identity.md)。
- [模块所有权](architecture/pure-web-module-ownership.md)、[构建与依赖](../README.md#依赖与清理)。
- [前端 UT 与后端 ST](testing/unit-test-quality.md)。
