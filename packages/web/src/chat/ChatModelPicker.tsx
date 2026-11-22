import { useMemo } from "react";
import type { ModelSelectionView } from "@zcode/client/agent";
import type { ModelSelection } from "@zcode/shared/model-selection";
import {
  buildRegistryModelSelectGroups,
  decodeCustomModelValue,
  encodeCustomModelValue,
  getThoughtLevelLabel,
  ModelConfigSelect,
  resolveModelThoughtOption,
  useZCodeIntl,
} from "@zcode/ui/web-chat-view";

const isItemLocked = () => false;

export function ChatModelPicker({
  catalog,
  selection,
  pending,
  disabled,
  onSelect,
}: {
  catalog: ModelSelectionView;
  selection: ModelSelection | null;
  pending: boolean;
  disabled: boolean;
  onSelect: (selection: ModelSelection) => void;
}) {
  const { intl } = useZCodeIntl();
  const groups = useMemo(() => buildRegistryModelSelectGroups("glm", catalog), [catalog]);
  const thought =
    selection &&
    resolveModelThoughtOption({
      modelSelectionView: catalog,
      providerId: selection.providerId,
      modelId: selection.modelId,
      currentValue: selection.options?.reasoningLevel,
    });
  const defaultLabel = intl.formatMessage({ id: "chat.toolbar.model.label" });

  return (
    <ModelConfigSelect
      modelGroups={groups}
      normalizedValue={
        selection ? encodeCustomModelValue(selection.providerId, selection.modelId) : ""
      }
      triggerLabel={selection?.modelId ?? defaultLabel}
      tooltipTitle={defaultLabel}
      showManageModelsAction={false}
      disabled={disabled || pending}
      pending={pending}
      isItemLocked={isItemLocked}
      lockReasonMessage="当前回合结束后可切换模型。"
      labelVisibilityClassName="inline-flex"
      contentAlign="end"
      focusSelectorOnClose='[data-testid="web-chat-input"]'
      composerOptions={{
        providerLabel: intl.formatMessage({ id: "chat.toolbar.combined.provider" }),
        modelsLabel: intl.formatMessage({ id: "chat.toolbar.combined.models" }),
        effortLabel: intl.formatMessage({ id: "chat.toolbar.combined.effort" }),
        selectModelLabel: defaultLabel,
        levels:
          thought?.options?.map((entry) => ({
            value: entry.value,
            label: getThoughtLevelLabel(intl, "glm", thought, entry),
          })) ?? [],
        value: String(thought?.currentValue ?? ""),
        onValueChange: (level) => {
          if (selection) onSelect({ ...selection, options: { reasoningLevel: level } });
        },
      }}
      onValueChange={(value) => {
        const model = decodeCustomModelValue(value);
        if (!model?.modelName) return;
        const option = resolveModelThoughtOption({
          modelSelectionView: catalog,
          providerId: model.providerId,
          modelId: model.modelName,
          currentValue: selection?.options?.reasoningLevel,
        });
        const level = String(option?.currentValue || option?.options?.at(-1)?.value || "");
        onSelect({
          providerId: model.providerId,
          modelId: model.modelName,
          ...(level ? { options: { reasoningLevel: level } } : {}),
        });
      }}
    />
  );
}
