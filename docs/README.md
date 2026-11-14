# 文档索引

本目录保存产品、协议、UI 与工程约定文档。当前仓库是**纯 Web 应用**（浏览器前端 + 内存模拟后端），
只有本页「现行文档」列出的入口描述当前形态；其余文件按各自状态标记或本页分类视为规格、实施轨迹或
历史记录。

**平台范围以 [project-goal.md](project-goal.md) 为准：仅电脑浏览器，不适配或测试手机屏幕。** 各目录历史规格中的手机、移动端和手机远控条款不再构成当前需求或验收范围；其中仍适用的电脑界面、协议字段与存量通用控件约定保留，不据此恢复移动端工作。

## 现行文档（按此阅读）

| 文档                                                                                   | 作用                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [../AGENTS.md](../AGENTS.md)                                                           | 仓库规则、命令与模块边界（开工先读）                         |
| [../README.md](../README.md)                                                           | 快速开始、运行命令、仓库结构与常用命令                       |
| [project-goal.md](project-goal.md)                                                     | 项目目标、当前 Web 拓扑、运行入口、后端替换面、UI 保真与门禁 |
| [architecture/pure-web-module-ownership.md](architecture/pure-web-module-ownership.md) | 模块所有权与新增源码登记流程                                 |
| [architecture/mock-backend.md](architecture/mock-backend.md)                           | 模拟后端能力状态、状态所有者、ACK 与 topic 顺序规范          |
| [architecture/internal-source-packages.md](architecture/internal-source-packages.md)   | workspace 包入口形态（源码 / 资源 / 构建产物）               |
| [architecture/web-build-workflow.md](architecture/web-build-workflow.md)               | 工具链、首装链、构建产物与清理语义                           |
| [testing/unit-test-quality.md](testing/unit-test-quality.md)                           | 测试证据体系：工程 Vitest 清单、门禁测试、浏览器验收         |
| [testing/dependency-governance.md](testing/dependency-governance.md)                   | `knip` 依赖与导出扫描的定位、命令与报告解读                  |
| [testing/react-hooks-lint.md](testing/react-hooks-lint.md)                             | React Hooks 依赖与调用位置检查                               |
| [../DESIGN.md](../DESIGN.md)                                                           | UI 设计规范（改 UI 前读）                                    |
| [../CONTEXT.md](../CONTEXT.md)                                                         | 插件商店领域词汇                                             |

`docs/testing/pre-push-hook.md` 解释已删除的 `.husky/pre-push` 机制；推送检查现状以
[testing/unit-test-quality.md](testing/unit-test-quality.md) 和 [../AGENTS.md](../AGENTS.md) 为准。

## 目录分类

| 目录 / 文件                                                                      | 状态           | 说明                                                                                                                                                         |
| -------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`architecture/`](architecture/)                                                 | 现行           | 纯 Web 形态的模块所有权、模拟后端、包入口与构建清理约定。                                                                                                    |
| [`v4-refactor/`](v4-refactor/README.md)                                          | 混合，逐篇分类 | V4 协议/投影/订阅契约与实施轨迹；[其 README](v4-refactor/README.md) 给出当前拓扑和逐篇状态。                                                                 |
| [`testing/`](testing/)                                                           | 混合           | 现行测试规格见上表；其余多为桌面 E2E、WDIO、覆盖矩阵、决策板与运行记录，属裁撤前历史证据，当前不可执行。                                                     |
| [`git/`](git/)                                                                   | 混合           | Git 面板的架构、需求、服务与 UI 规格多数仍描述保留功能；`release-*.md` 属已退役的桌面发布链路，`worktree.md` 保留产品语义但其中的桌面/CLI 验收命令不可执行。 |
| [`ui/`](ui/)、[`chat/`](chat/)、[`task/`](task/)、[`plugins/`](plugins/)         | 按文件         | 保留 UI 的功能规格与交互细节；文件未标注历史者按当前实现阅读，已裁撤功能的页面级规格不构成交付要求。                                                         |
| [`i18n/`](i18n/)、[`dynamic-workflow/`](dynamic-workflow/)、[`design/`](design/) | 按文件         | 界面文案、动态工作流与设计细节；`design/r3-remote-ui-redesign.md` 属已裁撤远程功能的记录，其指向的 remote 规格文件不存在，不作为当前入口。                   |
| [`images/`](images/)                                                             | 资源           | 文档引用的截图与示意图，不是规格。                                                                                                                           |
| `docs/*.md`（根级）                                                              | 按文件         | 单个功能的规格、计划或 bug 记录；标题/状态行说明适用范围，计划类文档不能当作验证证据。                                                                       |

## 历史材料的读法

- 历史文档保留当时的拓扑、路径、命令、用例数与验收结论，**不因模块删除而改写正文**；协议字段、
  reason code 与产品语义仍有效的部分继续作为规格。
- 历史文档中的命令、脚本、工件目录与 E2E 回放**不代表当前可执行**；先在本页「现行文档」和
  `package.json` 中确认入口存在。
- 已退役的 App 单测、桌面 E2E 与覆盖矩阵路径不构成当前覆盖证据；退役标记规则见
  [testing/unit-test-quality.md](testing/unit-test-quality.md)。
- 规划（plan/roadmap）文档只描述预期工作，不能作为已实现或已验证的证据。

## 维护规则

- 新增或修改行为先更新对应 spec；spec 放在对应领域目录，并在标题下写明状态与适用范围。
- 只链接当前仓库存在的文件。需要引用尚未落地的文档时，先写目录与约定，再补链接。
- 新增顶层目录或改变文档状态时同步更新本页；不要让现行入口指向历史记录。
- 顶层的 [../README.md](../README.md) 面向首次运行，本页面向文档导航，两者不互相复制命令清单。
