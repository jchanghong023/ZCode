# Design runtime 资产

保留页面元素检查、页面信号、样式预览消息和 HTML 源码定位的独立函数。当前产品没有嵌入浏览器宿主或 guest preload；这些函数不构成公开页面控制服务。

页面侧函数 `createElementInspector`、`installDesignRuntime`、`readDesignPageSignals` 可被序列化执行，函数体只使用参数与页面全局。跨页面消息视为不可信输入，解析器以 DESIGN_PAGE_LIMITS 限制字符串和数组；页面投影不能授予文件权限。

`sourceEdit.ts` 通过标签路径、索引、兄弟数量、id 和 class 定位 HTML 元素，只返回目标 style、文本或根 CSS 变量的源码替换结果；匹配失败返回 null。模块不写文件，实际持有文件的调用方负责授权及预期内容校验，不把算法结果当作已写入收据。
