# 插件宿主只读查询

`contract.ts` 定义 `plugins/readUserOptions` 和 `plugins/mentionItems` 的请求、结果、限额及错误码。模块仅校验线格式，查询错误只携带稳定错误码。
