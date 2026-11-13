import zhCN from "./locales/zh-CN.js";

/**
 * 应用 UI 单语中文：`zh-CN.ts` 是唯一文案表。
 *
 * 协议层 `Locale` / `SUPPORTED_LOCALES`（`@zcode/shared`）仍然保留：插件 manifest、
 * 服务端分享页、机器人模板等数据仍以多语言字段承载，不在 UI 侧做翻译。
 * 界面语言固定为中文，因此这里不再提供按语言取表的映射。
 */
export const UI_MESSAGES: Record<string, string> = zhCN;
