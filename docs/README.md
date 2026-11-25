# 当前系统文档

## 系统范围

AIReq 面向芯片团队，使用电脑浏览器。业务在黄区澄清 IR，开发和测试在红区结合代码做方案。两区的需求、交接和定版规则统一见[需求共创](specs/aireq/proposals.md)。

`/chat` 是独立的个人入口，方便用户用手机或电脑浏览器远程与自己电脑上的 Agent 做基本聊天。当前原型支持的操作见[Web Agent 聊天](specs/web-agent-chat.md)。

原型服务与正式黄区、正式红区可在同一开发机独立启动。正式服务通过 OMP SDK 执行模型，业务数据各自保存在 SQLite。运行方式见[开发与产品入口](../README.md#开发与产品入口)，服务契约见[发布边界](specs/aireq/contract-design.md#发布边界)。

## 产品与交互

- [业务背景与 FDTH 案例](briefings/business-context-and-usage.md)。
- [项目／版本／导航](specs/aireq/section-navigation.md)。
- [原生会话](specs/aireq/conversation.md)。
- [AI 配置与 Agent 角色](specs/aireq/tools-settings.md#agent-角色)、[文档格式](specs/aireq/tools-settings.md#文档格式)、[右侧工作区与材料](specs/aireq/unified-side-pane.md)、[主题与动效](../DESIGN.md#主题与动效)。

## 架构与工程维护

- [服务端与后端替换边界](architecture/mock-backend.md)。
- [云龙 CLI 实现参考](architecture/clouddragon-cli.md)包含命令用法、返回示例、字段类型和门户字段目录。
- [公开接口](specs/aireq/contract-design.md)、[连接身份与二进制协议](specs/aireq/connection-identity.md)。
- [模块所有权](architecture/pure-web-module-ownership.md)、[构建与依赖](../README.md#依赖与清理)。
- [前端 UT 与后端 ST](testing/unit-test-quality.md)。
