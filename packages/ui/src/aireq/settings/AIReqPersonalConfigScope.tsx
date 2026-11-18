import type { ReactNode } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function AIReqPersonalConfigScope({ children }: { children?: ReactNode }) {
  const { locale } = useZCodeIntl();
  const zh = locale.startsWith("zh");
  return (
    <div
      className="space-y-2 text-ui-sm text-foreground-subtle"
      data-testid="aireq-personal-config-scope"
    >
      <p>
        {zh
          ? "所有项目和 Release 共享 · 保存后用于新建讨论会话及新接纳的评审、分析。"
          : "Shared by all projects and releases · Saved settings apply to new discussions and newly admitted reviews and analyses."}
      </p>
      <details>
        <summary className="w-fit cursor-pointer rounded-sm border border-transparent text-remote-foreground-muted hover:text-foreground focus-visible:border-remote-foreground-muted">
          {zh ? "配置说明" : "About these settings"}
        </summary>
        <div className="space-y-2 pt-3 leading-6">
          {children}
          <p>
            {zh
              ? "切换工号不会创建独立配置。已有讨论、已接纳的评审和分析及历史报告均保留原配置。"
              : "Switching employee IDs does not create separate settings. Existing discussions, admitted reviews and analyses, and historical reports retain their original settings."}
          </p>
          <p>{zh ? "外观设置仅保存在当前浏览器。" : "Appearance is saved only in this browser."}</p>
        </div>
      </details>
    </div>
  );
}
