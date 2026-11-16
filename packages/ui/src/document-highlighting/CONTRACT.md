# document-highlighting

需求文档语法与主题的唯一资源范围：Markdown、JSON、YAML 和 GitHub Light / Dark。纯文本不请求语法；未保留语言仍原样展示。

`index.ts` 提供语言与旧设置归一化，`bundle.ts` 通过 Shiki 官方 `createBundledHighlighter` 创建受限 bundle。Vite 将第三方库的 Shiki 根入口也解析到该 bundle，主线程、开发依赖预构建和 diff worker 使用同一注册表；`shiki/core`、单个语法／主题和 WASM 入口不受替换。

保留 Oniguruma WASM 及现行渲染缓存／worker 所有者，不引入另一套会话状态。旧主题在既有设置读写入口归一化；文件／patch 在既有展示入口明确指定受支持语言或 text，不让库按扩展名请求已退役语法。
