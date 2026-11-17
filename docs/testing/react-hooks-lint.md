# React Hooks 静态检查

根 [`.oxlintrc.json`](../../.oxlintrc.json) 在 JS/TS 文件 override 中启用 React 插件，同时保留 unicorn、typescript、oxc 插件：

| 规则                    | 级别    | 作用                                       |
| ----------------------- | ------- | ------------------------------------------ |
| `react/rules-of-hooks`  | `error` | 检查 Hook 调用位置与顺序                   |
| `react/exhaustive-deps` | `warn`  | 检查闭包依赖遗漏、多余依赖及部分不稳定引用 |

`bun run lint` 通过 Oxlint 执行这些规则，不另设 Hooks linter。根 `lint:fix` 还启用 fix suggestions，不应把自动修改依赖数组当作行为正确的证明。

## 覆盖边界

根配置忽略 `packages/ui/src/components/ui`、`packages/ui/src/components/ai-elements`、`.agents/skills` 及匹配的临时 Vite 缓存。包内命令、嵌套配置和调用范围也会影响扫描；根 lint 的结果不等于全部 React 源码都被检查。

需要单独分析被忽略的源码时，使用只启用上述规则的临时配置，明确列出目标路径。不能假定 `--no-ignore` 会清除配置中的 `ignorePatterns`；也不能把临时配置中关闭的其他规则说成已检查。

## 诊断解释

- 先核对闭包真正读取的值、调用接收者与状态所有者，再决定依赖，不机械替换为整个对象。
- 加入依赖可能重建订阅，删除依赖可能移除刷新代际、资源版本或相对时间更新等失效信号。
- effect 清理应区分本次订阅资源与必须读取最新值的引用，不能混用快照语义。
- 条件分支或提前返回不得改变同一组件实例的 Hook 调用顺序；需要独立生命周期的模式可由独立组件承载。
- 诊断数不是 bug 数，零诊断也不是渲染性能或运行时正确性的证明。

不为清除告警扩大忽略范围或增加无依据的 disable。当前自动化测试用例为空，没有保留 Hooks 专项回归用例；配置与静态分析器仍在，见 [测试状态](unit-test-quality.md)。没有 pre-push 接线或手动替代门禁要求。
