# settings-scope

旧本机／远端设置页服务 scope owner `app/useSettingsScope.ts` 随旧 SettingsPage 和 Source Server 管理接口退出，不再解析或建立 settings attachment。

保留纯 `domain/scope.ts` 选择／分组函数、表单归属 `app/useSettingsScopeForm.ts` 与 `ui/` 的设备上下文及阻断提示，供通用 scope 菜单与表单展示显式传入的数据；不创建服务、不回退到本机。
