import { useSyncExternalStore } from "react";
import { useAIReqDataSource } from "../data-source.js";
import type { AIReqAgentModelBinding } from "../contract.js";

const emptySubscribe = () => () => {};

export function AIReqAgentModelSummary({ binding }: { binding?: AIReqAgentModelBinding }) {
  const source = useAIReqDataSource();
  const bindingChanged = () =>
    binding !== undefined && source.models?.bindingChanged(binding) === true;
  const changed = useSyncExternalStore(
    source.models?.subscribe ?? emptySubscribe,
    bindingChanged,
    bindingChanged,
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
        {binding.roleName} · {binding.modelName} · 思考：{reasoning}
        {binding.inherited ? " · 跟随默认（创建时）" : ""}
      </p>
      <details>
        <summary className="w-fit cursor-pointer">追加指令快照</summary>
        <p className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words" tabIndex={0}>
          {binding.promptSnapshot || "仅使用内建指令。"}
        </p>
      </details>
      {changed && (
        <p data-testid="agent-session-model-pending">设置已更新；本会话或评审仍保留原配置。</p>
      )}
    </div>
  );
}
