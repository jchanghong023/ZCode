# 当前系统文档

## 系统范围

AIReq 是面向电脑浏览器的纯 Web 应用。用户在项目与 Release 下把想法推进为提案，经澄清、评审和人工确认后进入正式需求的开发、分析与验收。项目进度由正式 SR 汇总。Sketch 支持绘图和 PNG 附件；Skill 设计保留私有工作流，入口未公开。

当前服务在单进程内存中模拟业务和会话，重启会重新初始化。工号由用户自报；真实身份认证、模型执行、Git 托管、数据库持久化和宿主业务文件写入见[发布边界](specs/aireq-migration/contract-design.md#发布边界)。启动与部署见[快速开始](../README.md)。

## 产品与交互

- [项目与版本](specs/aireq-migration/project-space.md)、[导航／想法／待办](specs/aireq-migration/section-navigation-and-ideas.md)。
- [提案流程](specs/aireq-migration/proposals.md)、[正式需求与分析](specs/aireq-migration/tracking.md)、[原生会话](specs/aireq-migration/conversation.md)。
- [材料](specs/aireq-migration/document-surface.md)、[设置与保留工具](specs/aireq-migration/tools-settings.md)、[统一右侧工作区](specs/aireq-migration/unified-side-pane.md)、[动效主题](specs/aireq-migration/motion-theme.md)。

## 架构与工程维护

- [服务端与后端替换边界](architecture/mock-backend.md)。
- [公开接口](specs/aireq-migration/contract-design.md)、[身份与连接](specs/aireq-migration/connection-identity.md)、[前后端接线](specs/aireq-migration/integration.md)。
- [模块所有权](architecture/pure-web-module-ownership.md)、[构建与依赖](../README.md#依赖与清理)。
- [前端 UT 与后端 ST](testing/unit-test-quality.md)。
