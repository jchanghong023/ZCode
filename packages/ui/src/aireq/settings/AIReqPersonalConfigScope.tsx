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
      {/* 共享配置与模拟路径只摘要一次，次级信息按需展开。 */}
      <p>
        {zh
          ? "所有合法工号共享并可修改同一份模拟配置。"
          : "All valid employee IDs share and can edit the same mock settings."}
      </p>
      <details>
        <summary className="cursor-pointer">
          {zh ? "共享范围与模拟目录" : "Shared scope and mock directories"}
        </summary>
        <div className="mt-2 space-y-1">
          <p>
            {zh
              ? "切换工号不会创建个人配置；所有工号仍共享项目、模型和指令。"
              : "Switching employee IDs does not create personal settings. All employee IDs still share projects, models and instructions."}
          </p>
          <p className="break-all">
            {zh ? "模拟配置路径：" : "Mock configuration path: "}
            {source.backend?.configDirectory}
          </p>
          <p className="break-all">
            {zh ? "共享技能目录：" : "Shared skills directory: "}
            {source.backend?.userSkillsDirectory}
          </p>
          <p>
            {zh
              ? "以上目录仅用于模拟展示，不访问本机文件或外部服务。外观仅保存在当前浏览器。"
              : "These directories are display-only mock locations; no local files or external services are accessed. Appearance is saved only in this browser."}
          </p>
        </div>
      </details>
    </div>
  );
}
