# 前端 UT 与后端 ST

| 自动化测试 | 范围 | 运行 | 检查用例类型 |
| --- | --- | --- | --- |
| 前端 UT | `test/ut/`，独立验证 Web 前端函数与状态逻辑 | `bun run test:ut` | `bun run test:ut:typecheck` |
| 后端 ST | `test/st/`，通过 HTTP、WebSocket 和 Channel RPC 验证已启动的后端服务 | `bun run test:st` | `bun run test:st:typecheck` |

新增前端 UT 时更新[用例清单](../../scripts/engineering-test-files.json)。命令定义见[根工程配置](../../package.json)。

UT 从消费者可观察的行为编写断言，通过可控 Promise 和公开事件安排时序。每例恢复替换的存储、计时器和监听。

## React Hooks 检查

`bun run lint` 使用 Oxlint 检查 Hook 调用顺序和闭包依赖。修改根配置忽略的 `components/ui`、`components/ai-elements` 时，用临时配置显式检查目标文件的 `react/rules-of-hooks` 和 `react/exhaustive-deps`。调整依赖后复核订阅的创建、清理及重读时机。规则见[根配置](../../.oxlintrc.json)。

## HTTP／WebSocket ST

启动服务后执行 `bun run test:st`，默认连接 `http://localhost:5174`。测试走正式 HTTP 和二进制 Channel RPC，以业务规格及公开服务契约为断言依据。单 worker 串行执行业务断言，独立的服务端前置等待可重叠；全局配置测试独占。准备失败计入对应 case，失败写入不自动重试。

| 需要调整的项目 | 配置 |
| --- | --- |
| 服务与身份 | `ST_BASE_URL`、`ST_EMPLOYEE_ID`、`ST_OTHER_EMPLOYEE_ID`、可选 `ST_TOKEN` |
| 专用仓库与分支 | `ST_REPOSITORY_URL`、`ST_REPOSITORY_BRANCH` |
| 等待与准备 | `ST_TIMEOUT_MS` 默认 120000；`ST_PREPARE_CONCURRENCY` 取 1 或 2，默认 2 |
| 文件与前置数据 | `ST_FILE_JSON`、`ST_FIXTURES_FILE`、`ST_ALLOCATION_LOG` |

配置格式与默认值见[测试配置](../../test/st/config.ts)，前置对象的领取及耗尽处理见[前置数据实现](../../test/st/fixtures.ts)。未指定前置数据时，测试通过公开操作创建。明确指定的前置对象失效或耗尽时报告阻塞；消费型用例独占各自的 IR。

删除需求、清理分支仅限本轮通过公开流程创建并登记的 IR。保留环境原有数据；全局配置仅在版本与内容仍属于本轮修改时恢复。超时关闭连接，日志脱敏。运行报告注明失败、阻塞及保留的新增资源；手动分析通过不能代替自动调度或迟到结果场景的验证。
