import type { AIReqAgentModelBinding } from "../contract.js";

/** Display the binding admitted with this run, never read today's settings as historical facts. */
export function RunModelFacts({ binding }: { binding?: AIReqAgentModelBinding }) {
  return (
    <section
      className="space-y-2 border-t border-border pt-3 text-ui-sm"
      aria-label="执行时模型配置"
    >
      <h3 className="font-medium">执行时模型配置</h3>
      {binding ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 break-words">
          <dt>角色</dt>
          <dd>{binding.roleName}</dd>
          <dt>模型</dt>
          <dd>
            {binding.modelName} · {binding.providerId} / {binding.modelId}
          </dd>
          <dt>思考强度</dt>
          <dd>{binding.reasoning ?? "未指定"}</dd>
          <dt>继承</dt>
          <dd>{binding.inherited ? "继承默认配置" : "角色独立配置"}</dd>
          <dt>配置版本</dt>
          <dd>{binding.configurationRevision}</dd>
        </dl>
      ) : (
        <p className="text-foreground-subtle">此历史记录未提供模型配置事实。</p>
      )}
    </section>
  );
}
