import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useAIReqDataSource } from "../data-source.js";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";
import { SettingsFormActions } from "@/settings/SettingsFormActions.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { AIReqPersonalConfigScope } from "./AIReqPersonalConfigScope.js";
import { AIReqSettingsTarget } from "./AIReqSettingsTarget.js";

export interface AIReqModelDraftActions {
  save(): boolean | Promise<boolean>;
  discard(): void;
  canSave?: boolean;
  canDiscard?: boolean;
}

export function AIReqAgentModelSettings({
  onDraftActionsChange,
}: {
  onDraftActionsChange?: (actions: AIReqModelDraftActions | null) => void;
}) {
  const source = useAIReqDataSource();
  if (!source.models)
    return (
      <p role="alert" className="text-ui-sm text-destructive">
        模型配置服务不可用，请检查连接后重新进入设置。
      </p>
    );
  return <ModelSettingsContent onDraftActionsChange={onDraftActionsChange} />;
}

function ModelSettingsContent({
  onDraftActionsChange,
}: {
  onDraftActionsChange?: (actions: AIReqModelDraftActions | null) => void;
}) {
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [saved, setSaved] = useState(source.models!.read);
  const [draft, setDraft] = useState(source.models!.read);
  const [savedRevision, setSavedRevision] = useState(() => source.models!.revision());
  // 成功与失败共用一个带类型的反馈，避免异常被渲染成普通成功状态。
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const defaultChanged = draft.defaultModel !== saved.defaultModel;
  const changedAgentCount = draft.agents.filter((agent) => {
    const original = saved.agents.find((item) => item.id === agent.id);
    return agent.model !== original?.model || agent.reasoning !== original?.reasoning;
  }).length;
  const changeSummary = [
    defaultChanged ? (zh ? "默认模型" : "default model") : "",
    changedAgentCount ? (zh ? `${changedAgentCount} 个 Agent` : `${changedAgentCount} Agents`) : "",
  ]
    .filter(Boolean)
    .join(zh ? "、" : ", ");
  const [saving, setSaving] = useState(false);
  const currentActions = useRef<AIReqModelDraftActions | null>(null);
  const savingRef = useRef(false);
  const save = async () => {
    if (savingRef.current || !dirty) return false;
    savingRef.current = true;
    setSaving(true);
    setMessage(null);
    try {
      await source.models!.save(draft, savedRevision);
      setSaved(structuredClone(source.models!.read()));
      setSavedRevision(source.models!.revision());
      setMessage({ kind: "success", text: zh ? "模型配置已保存" : "Model configuration saved" });
      return true;
    } catch (cause) {
      setMessage({
        kind: "error",
        text: formatUserFacingError(
          cause,
          zh ? "模型配置保存失败，请重试。" : "Could not save model settings. Please retry.",
        ),
      });
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  // 离开确认与快捷键始终调用最新草稿，避免 Dialog 打开后保存旧闭包。
  currentActions.current = {
    canSave: dirty && !saving,
    canDiscard: !saving,
    save,
    discard: () => {
      setDraft(structuredClone(saved));
      setMessage(null);
    },
  };
  useEffect(() => {
    onDraftActionsChange?.(
      // 请求尚未结算时不能丢弃并卸载表单，否则后台写入仍会在离开后生效。
      dirty || saving
        ? {
            canSave: !saving,
            canDiscard: !saving,
            save: () => currentActions.current?.save() ?? false,
            discard: () => currentActions.current?.discard(),
          }
        : null,
    );
  }, [dirty, saving, onDraftActionsChange]);
  useEffect(() => () => onDraftActionsChange?.(null), [onDraftActionsChange]);
  const modelName = (id: string) =>
    source.models!.choices.find((model) => model.id === id)?.name ?? id;
  const updateAgent = (id: string, patch: { model?: string; reasoning?: string }) => {
    setDraft((current) => ({
      ...current,
      agents: current.agents.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)),
    }));
    setMessage(null);
  };
  const modelOptions = source.models!.choices.map((model) => (
    <SelectItem key={model.id} value={model.id}>
      {model.name} · {model.provider}
    </SelectItem>
  ));
  return (
    <div className="space-y-6" data-testid="agent-model-settings">
      <p className="text-ui-base leading-6 text-foreground-subtle">
        {zh
          ? "为各 Agent 设置模型与思考强度，选择“跟随默认”时使用默认模型。"
          : "Set a model and reasoning level for each Agent. Choose “Follow default” to use the default model."}
      </p>
      <AIReqPersonalConfigScope />
      <p
        className="text-ui-sm leading-6 text-foreground-subtle"
        data-testid="agent-model-effective-scope"
      >
        {zh
          ? "保存后对新建会话生效，已有会话保留原配置。"
          : "Saved settings apply to new sessions. Existing sessions keep their original configuration."}
      </p>
      {/* 长表的提交区随正文滚动吸顶，摘要只从现有草稿派生，避免另存修改状态。 */}
      <div className="sticky top-0 z-10 space-y-2 border-b border-border bg-background py-3">
        <SettingsFormActions
          leadingAction={
            <div className="space-y-1 text-ui-sm text-foreground-subtle">
              <p role="status">
                {dirty
                  ? zh
                    ? `未保存：${changeSummary}`
                    : `Unsaved: ${changeSummary}`
                  : zh
                    ? "暂无未保存更改"
                    : "No unsaved changes"}
              </p>
              <p>{zh ? "Ctrl / Cmd + S 保存" : "Ctrl / Cmd + S to save"}</p>
            </div>
          }
        >
          <Button size="lg" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? (zh ? "保存中…" : "Saving…") : zh ? "保存配置" : "Save configuration"}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(structuredClone(saved));
              setMessage(null);
            }}
          >
            {zh ? "取消" : "Cancel"}
          </Button>
        </SettingsFormActions>
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-ui-sm ${message.kind === "error" ? "text-destructive" : "text-foreground-subtle"}`}
          >
            {message.kind === "error" && (zh ? "保存失败：" : "Save failed: ")}
            {message.text}
          </p>
        )}
      </div>
      <section className="space-y-3" aria-labelledby="agent-default-model-title">
        <h3 id="agent-default-model-title" className="text-ui-base font-medium">
          {zh ? "默认模型" : "Default model"}
        </h3>
        <SettingsGroupCard>
          <SettingsRow
            searchId="aireq.model.default"
            label={zh ? "工作流默认模型" : "Workflow default model"}
            description={
              zh
                ? "下方选择“跟随默认”的 AIReq Agent 使用此模型。"
                : "Used by the AIReq Agents below that are set to follow the default."
            }
            controlLayout="wide"
            control={
              <Select
                value={draft.defaultModel}
                disabled={saving}
                onValueChange={(defaultModel) => {
                  setDraft((current) => ({ ...current, defaultModel }));
                  setMessage(null);
                }}
              >
                <SelectTrigger
                  size="lg"
                  className="w-full min-w-0"
                  aria-label={zh ? "默认模型" : "Default model"}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>{modelOptions}</SelectContent>
              </Select>
            }
          />
        </SettingsGroupCard>
      </section>
      <section aria-labelledby="agent-model-overrides-title">
        <AIReqSettingsTarget id="aireq.model.agents" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="agent-model-overrides-title" className="text-ui-base font-medium">
              {zh ? "Agent 模型配置" : "Agent models"}
            </h3>
            <span className="text-ui-sm text-foreground-subtle">
              {zh ? `${draft.agents.length} 个 Agent` : `${draft.agents.length} Agents`}
            </span>
          </div>
          <p className="text-ui-sm leading-6 text-foreground-subtle">
            {zh
              ? "较高思考强度用于更深入的推理，可能增加耗时；“模型默认”沿用模型预设。"
              : "Higher reasoning levels allow deeper reasoning and may take longer. “Model default” uses the model preset."}
          </p>
          <SettingsGroupCard>
            {draft.agents.map((agent) => {
              const name = zh ? agent.name : agent.nameEn;
              return (
                <SettingsRow
                  key={agent.id}
                  searchId={
                    agent.id === "progress-analysis" ? "aireq.model.progressAnalysis" : undefined
                  }
                  label={name}
                  description={zh ? agent.description : agent.descriptionEn}
                  controlLayout="wide"
                  control={
                    <div className="w-full min-w-0 space-y-2">
                      <Select
                        value={agent.model}
                        disabled={saving}
                        onValueChange={(model) => updateAgent(agent.id, { model })}
                      >
                        <SelectTrigger
                          size="lg"
                          className="w-full min-w-0"
                          aria-label={`${name} ${zh ? "模型" : "model"}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit">
                            {zh ? "跟随默认" : "Follow default"} · {modelName(draft.defaultModel)}
                          </SelectItem>
                          {modelOptions}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center justify-between gap-2">
                        <span className="shrink-0 text-ui-sm text-foreground-subtle">
                          {zh ? "思考强度" : "Reasoning"}
                        </span>
                        <Select
                          value={agent.reasoning}
                          disabled={saving}
                          onValueChange={(reasoning) => updateAgent(agent.id, { reasoning })}
                        >
                          <SelectTrigger
                            size="sm"
                            variant="ghost"
                            aria-label={`${name} ${zh ? "思考强度" : "reasoning"}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">
                              {zh ? "模型默认" : "Model default"}
                            </SelectItem>
                            <SelectItem value="low">{zh ? "低" : "Low"}</SelectItem>
                            <SelectItem value="medium">{zh ? "中" : "Medium"}</SelectItem>
                            <SelectItem value="high">{zh ? "高" : "High"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  }
                />
              );
            })}
          </SettingsGroupCard>
        </AIReqSettingsTarget>
      </section>
    </div>
  );
}
