# document-highlighting

需求文档语法与主题的唯一资源范围：Markdown、JSON、YAML 和 GitHub Light / Dark。纯文本不请求语法；未保留语言仍原样展示。

`index.ts` 提供语言与旧设置归一化，`bundle.ts` 通过 Shiki 官方 `createBundledHighlighter` 创建受限 bundle。Vite 将第三方库的 Shiki 根入口也解析到该 bundle，主线程、开发依赖预构建和 diff worker 使用同一注册表；`shiki/core`、单个语法和主题保持官方入口。

Web 将 `shiki/wasm` 解析为按需加载的同源 Oniguruma 二进制资产，不将字节内联为 JavaScript；主线程与 diff worker 使用同一加载约定。保留现行渲染缓存及 worker owner。旧主题在既有设置读写入口归一化；文件／patch 明确指定受支持语言或 text，不让库按扩展名请求未保留的语法。
[构建与部署](../../../../README.md#构建与部署)说明如何核验发布产物。
