import type { ReactNode } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function AIReqPersonalConfigScope({
  children,
  scope,
}: {
  children?: ReactNode;
  scope?: string;
}) {
  const { locale } = useZCodeIntl();
  const zh = locale.startsWith("zh");
  return (
    <div
      className="space-y-2 text-ui-sm text-foreground-subtle"
      data-testid="aireq-personal-config-scope"
    >
      <p>
        {scope ??
          (zh
            ? "团队共享配置 · 保存后用于新建会话。"
            : "Shared team settings · Used by new sessions after saving.")}
      </p>
      <details>
        <summary className="w-fit cursor-pointer rounded-sm border border-transparent text-remote-foreground-muted hover:text-foreground focus-visible:border-remote-foreground-muted">
          {zh ? "配置说明" : "About these settings"}
        </summary>
        <div className="space-y-2 pt-3 leading-6">
          {children}
          <p>
            {zh
              ? "切换工号不会创建独立配置；已有会话保留原配置。"
              : "Switching employee IDs does not create separate settings. Existing sessions retain their original configuration."}
          </p>
          <p>{zh ? "外观设置仅保存在当前浏览器。" : "Appearance is saved only in this browser."}</p>
        </div>
      </details>
    </div>
  );
}
