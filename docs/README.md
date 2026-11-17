# 当前系统文档

文档只描述当前检出的系统、现有源码、运行入口和实际能力。删除历史计划、迁移轨迹、补丁流水、旧测试目录、过期验收记录和旧产物指纹；不把它们改名为现行规格，也不追加“后续覆盖旧章节”的说明。

## 入口

- [快速开始](../README.md)：工具链、启动、构建与部署。
- [系统范围](project-goal.md)：当前产品、状态所有者与支持边界。
- [仓库规则](../AGENTS.md)、[界面规范](../DESIGN.md)、[领域词汇](../CONTEXT.md)。

## 架构与公开契约

- [服务端与后端替换边界](architecture/mock-backend.md)。
- [公开接口](specs/aireq-migration/contract-design.md)、[身份与连接](specs/aireq-migration/connection-identity.md)、[前后端接线](specs/aireq-migration/integration.md)、[发布边界](specs/aireq-migration/release-surface.md)。
- [模块所有权](architecture/pure-web-module-ownership.md)、[包入口](architecture/internal-source-packages.md)、[构建与清理](architecture/web-build-workflow.md)、[浏览器依赖](architecture/browser-dependency-versions.md)。

## 产品与交互

- [项目与版本](specs/aireq-migration/project-space.md)、[导航／想法／待办](specs/aireq-migration/section-navigation-and-ideas.md)。
- [提案流程](specs/aireq-migration/proposals.md)、[正式需求与分析](specs/aireq-migration/tracking.md)、[原生会话](specs/aireq-migration/conversation.md)。
- [材料](specs/aireq-migration/document-surface.md)、[设置与保留工具](specs/aireq-migration/tools-settings.md)、[统一右侧工作区](specs/aireq-migration/unified-side-pane.md)、[动效主题](specs/aireq-migration/motion-theme.md)。

## 工程维护

- [当前测试状态](testing/unit-test-quality.md)、[依赖治理](testing/dependency-governance.md)、[React Hooks 检查](testing/react-hooks-lint.md)。

## 维护约束

行为修改前先更新对应现行规格，直接改写相关规则，不保留相互覆盖的历史版本。能力和命令须对应当前源码；当前限制明确写明，不把规划或旧验收当作实现依据。链接只指向现存文档或源码。模块旁的 `CONTRACT.md` 描述该模块当前契约，保留的共享类型或控件不自动构成产品入口或公开服务。
