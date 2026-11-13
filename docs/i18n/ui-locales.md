# 界面语言（UI Locales）

## 当前规则：UI 单语中文

应用界面只有中文一种语言，固定 `zh-CN`：

- 唯一文案表：`packages/ui/src/i18n/locales/zh-CN.ts`，由 `packages/ui/src/i18n/localeMessages.ts` 的 `UI_MESSAGES` 导出。
- `ZCodeIntlProvider` 不再接收语言相关 props（`initialLocale` / `preferSettingServiceLocale` / `resolveSystemLocale`），也不再读 `setting.json`、`localStorage`、`navigator.language`。
- 已删除：语言切换入口（设置页语言下拉、侧栏个人菜单「界面语言」、`LocaleSwitcher`）、跟随系统语言、跨窗口语言广播、`store.locale` 与 `setLocale`。
- 已删除文案表：`en-US.ts`、`ja-JP.ts`、`ru-RU.ts`、`ko-KR.ts`（合计约 2.5 MB 源文件，原先随首屏下载）。

## 保留但不再用于 UI 的部分

`packages/shared` 的 `Locale` / `SUPPORTED_LOCALES` / `resolveLocaleFromLanguageTag` / `toZhOrEnLocale`
仍然存在，因为这些是**数据契约**而不是 UI 资源：

| 消费方 | 用途 |
| ------ | ---- |
| 插件 manifest / 插件安装（`zcode-protocol-v4/pluginInstall.ts`） | 按 locale 取插件显示名回退链 |
| 服务端分享页、机器人消息、营销投放（`packages/services`） | 服务端内容仍是多语言字段 |
| Desktop Main 原生菜单、插件沙箱（`packages/desktop/src/main`） | 主进程侧语言解析，不在本次前端删除范围 |
| CLI（`apps/zcode-cli`） | 独立 i18n 体系 |
| `setting.json` 读写（`packages/shared/src/locale.ts`） | 旧值兼容，避免旧版本读到未知值重置全部设置 |

## 请求语言（X-Client-Language）

`X-Client-Language` 链路不变，仍然由 renderer 把当前界面语言同步给 Main/Host。由于界面语言固定，
桌面端挂载后推送的值恒为 `zh-CN`，`setting.json` 里残留的其它语言值不再影响该请求头。
详细链路见 [ZCode Endpoint Client Language Header](../zcode-endpoint-client-language-header.md)。

## 兼容性

- `setting.json` 中 `locale` / `uiLocale` 等字段可能仍是旧语言值：前端不再读取，下一次写入由
  `settingService` 按既有规则落盘，不会因为未知值导致整份设置被重置（相关 schema 未改动）。
- 升级前选择过非中文语言的用户，升级后界面显示中文，不需要迁移操作。
- `localStorage` 的 `zcode-locale` / `zcode-locale-preference` 不再被读取，残留值无副作用。

## 变更约定

- 新增或修改文案只改 `zh-CN.ts`，不再新增语言文件；文案 key 缺失时回退显示 key 本身。
- 不要再引入按语言取表的映射、语言选择控件或系统语言探测：这些能力已随单语化删除。
- `setting.json` 的 locale 字段属于兼容层，除非同时处理旧版本降级，否则不要修改其读写规则。
