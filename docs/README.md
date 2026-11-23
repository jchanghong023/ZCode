# 当前系统文档

## 系统范围

AIReq 是面向电脑浏览器的纯 Web 应用。需求共创以两个 Agent 讨论需求和方案，在平台内查阅、评审和确认文档版本。Sketch 仍用于草稿附件。

用户填写工号即可进入，工号用来记录消息发送人和实际操作者。需求会话对全员开放，方案会话对所属项目的开发和测试开放。详见[连接身份](specs/aireq/connection-identity.md#1-身份来源)。

`/chat` 是免登录的 [Web Agent 聊天入口](specs/web-agent-chat.md)，使用独立的内存会话空间和原型 Agent。

当前阶段在单进程内存原型上开发和验证业务，重启会重新初始化。正式产品的聊天使用 OMP 原生 Agent，见[会话产品要求与原型范围](specs/aireq/conversation.md#会话产品要求与原型范围)。模型执行、Git 托管、数据库持久化和宿主业务文件写入见[发布边界](specs/aireq/contract-design.md#发布边界)。启动与部署见[快速开始](../README.md)。

## 产品与交互

- [从一句业务诉求到确认版本](briefings/requirements-collaboration.md)介绍两个 Agent、按需评审和版本确认。
- [项目／版本／导航／想法](specs/aireq/section-navigation-and-ideas.md)。
- [需求共创](specs/aireq/proposals.md)、[原生会话](specs/aireq/conversation.md)。
- [AI 配置与 Agent 角色](specs/aireq/tools-settings.md#agent-角色)、[文档格式](specs/aireq/tools-settings.md#文档格式)、[右侧工作区与材料](specs/aireq/unified-side-pane.md)、[动效主题](../DESIGN.md#默认动效主题)。

## 架构与工程维护

- [服务端与后端替换边界](architecture/mock-backend.md)。
- [公开接口](specs/aireq/contract-design.md)、[连接身份与二进制协议](specs/aireq/connection-identity.md)。
- [模块所有权](architecture/pure-web-module-ownership.md)、[构建与依赖](../README.md#依赖与清理)。
- [前端 UT 与后端 ST](testing/unit-test-quality.md)。
