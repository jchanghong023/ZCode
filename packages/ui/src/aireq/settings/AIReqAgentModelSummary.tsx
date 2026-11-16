import { useSyncExternalStore } from "react";
import type { AIReqAgentModelBinding } from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
const emptyRevision = () => 0;
const emptySubscribe = () => () => {};
export function AIReqAgentModelSummary({ binding }: { binding?: AIReqAgentModelBinding }) {
  const source = useAIReqDataSource();
  useSyncExternalStore(
    source.models?.subscribe ?? emptySubscribe,
    source.models?.revision ?? emptyRevision,
    source.models?.revision ?? emptyRevision,
  );
  if (!binding) return null;
  const reasoning =
    ({ default: "模型默认", low: "低", medium: "中", high: "高" } as Record<string, string>)[
      binding.reasoning
    ] ?? binding.reasoning;
  return (
    <div
      className="space-y-1 text-ui-sm text-foreground-subtle"
      data-testid="agent-session-model"
      data-agent-role={binding.role}
      data-model-key={binding.modelKey}
      data-reasoning={binding.reasoning}
    >
      <p>
        {binding.roleName} · {binding.modelName} · {binding.providerId} · 思考：{reasoning}
        {binding.inherited ? " · 跟随默认（创建时）" : ""}
      </p>
      {source.models?.bindingChanged(binding) && (
        <p>平台设置已更新；此会话保留创建时模型快照，仅新建会话使用新配置。</p>
      )}
    </div>
  );
}
