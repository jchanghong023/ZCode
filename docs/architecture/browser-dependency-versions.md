# 浏览器依赖与补丁

直接版本来自 [`packages/ui/package.json`](../../packages/ui/package.json)、[`packages/web/package.json`](../../packages/web/package.json)，最终解析来自 [`pnpm-lock.yaml`](../../pnpm-lock.yaml)。本文不保存升级前后对照或历史体积数据。

## 版本与消费边界

| 依赖                  | 当前声明或锁定解析                       | 用途                                        |
| --------------------- | ---------------------------------------- | ------------------------------------------- |
| `shiki`               | UI 精确声明 `3.23.0`                     | 文档代码高亮与 diff 高亮                    |
| `marked`              | UI 精确声明 `17.0.6`                     | Markdown 解析；Streamdown 同样解析到 17.0.6 |
| `streamdown`          | UI 声明 `^2.5.0`，锁定 2.5.0             | 流式 Markdown 展示                          |
| `mermaid`             | 锁定 11.14.0                             | 图表渲染，依赖 `marked@16.4.2`              |
| `react` / `react-dom` | 根 override 固定 `19.2.7`                | 统一 React 运行时                           |
| `vite`                | Web 声明 `^8.0.2`，锁定 8.0.8 并应用补丁 | 开发与生产打包                              |

`marked` 的 16.x 与 17.x 是不同消费者的依赖要求，不用跨主版本 override 强行合并。动画、公式、Markdown、diff 和通用控件库按各自职责保留，不能仅凭版本重复或当前页面无引用删除。

浏览器构建将 `shiki` 根导入（包括第三方消费者）统一到 `packages/ui/src/document-highlighting/bundle.ts`，具体配置见 [`vite.config.ts`](../../packages/web/vite.config.ts)。锁图中的包版本与浏览器实际分发的语法集合不是同一概念。

## 当前补丁

根 [`package.json`](../../package.json) 的 `pnpm.patchedDependencies` 登记以下精确版本：

| 目标                                 | 补丁作用                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `@radix-ui/react-collapsible@1.1.12` | 隐藏节点跳过无意义几何测量，仍推进 presence 状态；可见动画保留原测量              |
| `@radix-ui/react-menu@2.1.16`        | 键盘事件重新挂 once pointer 监听前移除旧监听，避免累积                            |
| `@uiw/react-markdown-preview@5.2.1`  | 为 `nohighlight` 入口提供 ESM `.d.mts` 类型并优先匹配 `types`                     |
| `vite@8.0.8`                         | 开发客户端既无连接也无在途连接时停止远端 console 转发，保留本地输出和正常建连等待 |
| `vitest@4.1.7`                       | 用 `setImmediate` 回调兑现 Promise，保持 Bun 下的异步等待语义                     |

补丁正文位于 [`patches`](../../patches)。Vitest 是工程工具，不进入浏览器产品运行时。bootstrap 会在安装前刷新对应 hoisted 包目录，见 [构建工作流](web-build-workflow.md)。

依赖维护使用固定 pnpm，例如：

```sh
bun x --bun --package pnpm@10.33.2 pnpm why shiki -r
bun x --bun --package pnpm@10.33.2 pnpm why marked -r
```

升级涉及补丁目标时同时核对上游实现、补丁适用性和源码 API 消费面；manifest、锁文件与补丁登记应保持一致。扫描报告的解释见 [依赖治理](../testing/dependency-governance.md)。
