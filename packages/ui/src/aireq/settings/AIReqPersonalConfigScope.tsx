import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReqDataSource } from "../data-source.js";
export function AIReqPersonalConfigScope() {
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const zh = locale.startsWith("zh");
  return (
    <div
      className="space-y-1 text-ui-sm text-foreground-subtle"
      data-testid="aireq-personal-config-scope"
    >
      {/* 所有者与权限只摘要一次，模拟路径等次级信息按需展开。 */}
      <p>
        {zh
          ? `共享模拟配置由 ${source.backend?.owner ?? "j00808874"} 管理，其他工号只读；技能目录所有人只读。`
          : `Shared mock settings are managed by ${source.backend?.owner ?? "j00808874"}. Others have read-only access; the skills directory is read-only for everyone.`}
      </p>
      <details>
        <summary className="cursor-pointer">
          {zh ? "模拟配置与生效范围" : "Mock configuration and scope"}
        </summary>
        <div className="mt-2 space-y-1">
          <p>
            {zh
              ? "切换工号不切换后端账号、凭据、配置根或项目。"
              : "Switching employee IDs does not change the backend account, credentials, configuration root, or project."}
          </p>
          <p className="break-all">
            {zh ? "模拟配置路径：" : "Mock configuration path: "}
            {source.backend?.configDirectory}
          </p>
          <p className="break-all">
            {zh ? "共享 profile 技能：" : "Shared profile skills: "}
            {source.backend?.userSkillsDirectory}
          </p>
          <p>
            {zh
              ? "上述路径仅为模拟归属标签，不访问本机或 OMP。外观仅保存在当前浏览器。"
              : "These paths are mock ownership labels only; they do not access the local machine or OMP. Appearance is saved only in this browser."}
          </p>
        </div>
      </details>
    </div>
  );
}
