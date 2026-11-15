import { useAIReqDataSource } from "../data-source.js";
export function AIReqPersonalConfigScope({ scopeLabel }: { scopeLabel?: string } = {}) {
  const source = useAIReqDataSource();
  return (
    <div
      className="space-y-1 text-ui-sm text-foreground-subtle"
      data-testid="aireq-personal-config-scope"
    >
      <p>{scopeLabel ?? "所有设置全员可查看，平台配置仅所有者可写；技能目录所有人只读。"}</p>
      <p>
        共享模拟配置所有者：{source.backend?.owner ?? "j00808874"}
        。切换工号不切换后端账号、凭据、配置根或项目。
      </p>
      <p className="break-all">
        模拟配置路径：{source.backend?.configDirectory} · 共享 profile 技能：
        {source.backend?.userSkillsDirectory}
      </p>
      <p>上述路径仅为模拟归属标签，不访问本机或 OMP。外观仅保存在当前浏览器。</p>
    </div>
  );
}
