import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function AIReqPersonalConfigScope() {
  const { locale } = useZCodeIntl();
  const zh = locale.startsWith("zh");
  return (
    <div
      className="space-y-1 text-ui-sm text-foreground-subtle"
      data-testid="aireq-personal-config-scope"
    >
      <p>
        {zh
          ? "模型与 Agent 指令为团队共享配置，修改后用于新建的评审和分析。"
          : "Model and Agent instructions are shared by the team and apply to new reviews and analyses."}
      </p>
      <p>
        {zh
          ? "切换工号不会创建独立配置；外观设置仅保存在当前浏览器。"
          : "Switching employee IDs does not create separate settings. Appearance is saved only in this browser."}
      </p>
    </div>
  );
}
