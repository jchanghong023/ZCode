import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useAIReqDataSource } from "../data-source.js";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  AIReqAgentModelSettings as ModelConfiguration,
  AIReqSettingsDraftActions,
} from "../contract.js";
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

type ModelEditing = {
  baseline: ModelConfiguration;
  revision: number;
  draft: ModelConfiguration;
  recovered?: boolean;
  needsRead?: boolean;
};

function mergeModelEdits(
  { baseline, draft }: ModelEditing,
  latest: ModelConfiguration,
): ModelConfiguration {
  // 新基线保留其他人的改动，只带入本页真正编辑过的模型和思考强度字段。
  return {
    defaultModel:
      draft.defaultModel === baseline.defaultModel ? latest.defaultModel : draft.defaultModel,
    agents: latest.agents.map((agent) => {
      const previous = baseline.agents.find(({ id }) => id === agent.id);
      const edited = draft.agents.find(({ id }) => id === agent.id);
      if (!previous || !edited) return agent;
      return {
        ...agent,
        model: edited.model === previous.model ? agent.model : edited.model,
        reasoning: edited.reasoning === previous.reasoning ? agent.reasoning : edited.reasoning,
      };
    }),
  };
}

export function AIReqAgentModelSettings({
  onDraftActionsChange,
}: {
  onDraftActionsChange?: (actions: AIReqSettingsDraftActions | null) => void;
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
  onDraftActionsChange?: (actions: AIReqSettingsDraftActions | null) => void;
}) {
  const source = useAIReqDataSource();
  const models = source.models!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const latestRevision = useSyncExternalStore(models.subscribe, models.revision);
  const latest = models.read();
  const [editing, setEditing] = useState<ModelEditing>();
  const [pending, setPending] = useState<"save" | "read">();
  const pendingRef = useRef(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const baseline = editing?.baseline ?? latest;
  const draft = editing?.draft ?? latest;
  const dirty = editing !== undefined;
  const conflicted = editing && (editing.needsRead || editing.revision !== latestRevision);
  const conflictMessage = zh
    ? "请重新读取模型配置，再核对并保存。草稿会保留。"
    : "Reload model settings, then review and save. Your edits will be preserved.";
  const defaultChanged = draft.defaultModel !== baseline.defaultModel;
  const changedAgentCount = draft.agents.filter((agent) => {
    const original = baseline.agents.find((item) => item.id === agent.id);
    return agent.model !== original?.model || agent.reasoning !== original?.reasoning;
  }).length;
  const changeSummary = [
    defaultChanged ? (zh ? "默认模型" : "default model") : "",
    changedAgentCount ? (zh ? `${changedAgentCount} 个 Agent` : `${changedAgentCount} Agents`) : "",
  ]
    .filter(Boolean)
    .join(zh ? "、" : ", ");
  const currentActions = useRef<AIReqSettingsDraftActions | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const comparisonRef = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const save = async () => {
    if (pendingRef.current || !editing || conflicted || editing.revision !== models.revision())
      return false;
    pendingRef.current = true;
    setPending("save");
    setMessage(null);
    try {
      await models.save(draft, editing.revision);
      setEditing(undefined);
      setMessage({ kind: "success", text: zh ? "模型配置已保存" : "Model configuration saved" });
      return true;
    } catch (cause) {
      setEditing({ ...editing, needsRead: true });
      setMessage({
        kind: "error",
        text: formatUserFacingError(
          cause,
          zh ? "模型配置保存失败，请重试。" : "Could not save model settings. Please retry.",
        ),
      });
      return false;
    } finally {
      pendingRef.current = false;
      setPending(undefined);
    }
  };
  const reload = async () => {
    if (pendingRef.current || !editing) return;
    pendingRef.current = true;
    setPending("read");
    setMessage(null);
    try {
      if (!source.refreshIdentity) throw new Error("Model configuration refresh is unavailable");
      await source.refreshIdentity();
      const next = models.read();
      const merged = mergeModelEdits(editing, next);
      const hasEdits = JSON.stringify(merged) !== JSON.stringify(next);
      setEditing(
        hasEdits
          ? { baseline: next, revision: models.revision(), draft: merged, recovered: true }
          : undefined,
      );
      if (!hasEdits)
        setMessage({
          kind: "success",
          text: zh
            ? "已读取最新配置，无需再次保存。"
            : "Latest settings loaded. There are no edits left to save.",
        });
      restoreFocus.current = true;
    } catch (cause) {
      setMessage({
        kind: "error",
        text: formatUserFacingError(
          cause,
          zh
            ? "无法读取最新模型配置，请重试。"
            : "Could not load the latest model settings. Try again.",
        ),
      });
    } finally {
      pendingRef.current = false;
      setPending(undefined);
    }
  };
  useLayoutEffect(() => {
    if (pending || !restoreFocus.current) return;
    restoreFocus.current = false;
    const target = comparisonRef.current ?? statusRef.current;
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  }, [pending]);
  const discard = () => {
    if (pendingRef.current) return;
    setEditing(undefined);
    setMessage(null);
  };
  // 离开确认与快捷键始终调用最新草稿，避免 Dialog 打开后保存旧闭包。
  currentActions.current = { save, discard };
  useLayoutEffect(() => {
    onDraftActionsChange?.(
      // 请求尚未结算时不能丢弃并卸载表单，否则后台写入仍会在离开后生效。
      dirty || pending
        ? {
            canSave: !pending && !conflicted,
            canDiscard: !pending,
            saveBlockedReason: conflicted ? conflictMessage : undefined,
            save: () => currentActions.current?.save() ?? false,
            discard: () => currentActions.current?.discard(),
          }
        : null,
    );
    return () => onDraftActionsChange?.(null);
  }, [dirty, pending, conflicted, conflictMessage, onDraftActionsChange]);
  const modelName = (id: string) => models.choices.find((model) => model.id === id)?.name ?? id;
  const updateDraft = (update: (current: ModelConfiguration) => ModelConfiguration) => {
    if (pendingRef.current) return;
    setEditing((current) => {
      const original = current?.baseline ?? latest;
      const edited = update(current?.draft ?? latest);
      if (JSON.stringify(edited) === JSON.stringify(original)) return undefined;
      return {
        ...current,
        baseline: original,
        revision: current?.revision ?? latestRevision,
        draft: edited,
      };
    });
    setMessage(null);
  };
  const updateAgent = (id: string, patch: { model?: string; reasoning?: string }) => {
    updateDraft((current) => ({
      ...current,
      agents: current.agents.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)),
    }));
  };
  const modelOptions = models.choices.map((model) => (
    <SelectItem key={model.id} value={model.id}>
      {model.name} · {model.provider}
    </SelectItem>
  ));
  const reasoningLabel = {
    default: zh ? "模型默认" : "Model default",
    low: zh ? "低" : "Low",
    medium: zh ? "中" : "Medium",
    high: zh ? "高" : "High",
  };
  const modelLabel = (model: string) =>
    model === "inherit" ? (zh ? "跟随默认" : "Follow default") : modelName(model);
  const describeFollowers = (settings: ModelConfiguration) => {
    const names = settings.agents
      .filter((agent) => agent.model === "inherit")
      .map((agent) => (zh ? agent.name : agent.nameEn));
    const count = zh
      ? `${names.length} 个 Agent`
      : `${names.length} ${names.length === 1 ? "Agent" : "Agents"}`;
    return names.length ? `${count}（${names.join(zh ? "、" : ", ")}）` : count;
  };
  const currentFollowers = describeFollowers(latest);
  const draftFollowers = editing
    ? describeFollowers(mergeModelEdits(editing, latest))
    : currentFollowers;
  const differences: { label: string; saved: string; draft: string }[] = [];
  if (editing?.recovered && !conflicted) {
    if (defaultChanged)
      differences.push({
        label: zh ? "工作流默认模型" : "Workflow default model",
        saved: modelName(baseline.defaultModel),
        draft: modelName(draft.defaultModel),
      });
    for (const agent of draft.agents) {
      const original = baseline.agents.find((item) => item.id === agent.id);
      if (!original) continue;
      const name = zh ? agent.name : agent.nameEn;
      if (original.model !== agent.model)
        differences.push({
          label: zh ? `${name} 的模型` : `${name} model`,
          saved: modelLabel(original.model),
          draft: modelLabel(agent.model),
        });
      if (original.reasoning !== agent.reasoning)
        differences.push({
          label: zh ? `${name} 的思考强度` : `${name} reasoning`,
          saved:
            reasoningLabel[original.reasoning as keyof typeof reasoningLabel] ?? original.reasoning,
          draft: reasoningLabel[agent.reasoning as keyof typeof reasoningLabel] ?? agent.reasoning,
        });
    }
  }
  return (
    <div className="space-y-8" data-testid="agent-model-settings">
      <AIReqPersonalConfigScope>
        <p>
          {zh
            ? "为各 Agent 设置模型与思考强度，选择“跟随默认”时使用默认模型。"
            : "Set a model and reasoning level for each Agent. Choose “Follow default” to use the default model."}
        </p>
        <p>
          {zh
            ? "较高思考强度用于更深入的推理，可能增加耗时；“模型默认”沿用模型预设。"
            : "Higher reasoning levels allow deeper reasoning and may take longer. “Model default” uses the model preset."}
        </p>
        <dl className="space-y-3">
          {draft.agents.map((agent) => (
            <div key={agent.id}>
              <dt className="font-medium text-foreground">{zh ? agent.name : agent.nameEn}</dt>
              <dd>{zh ? agent.description : agent.descriptionEn}</dd>
            </div>
          ))}
        </dl>
      </AIReqPersonalConfigScope>
      <section className="space-y-3" aria-labelledby="agent-default-model-title">
        <h3 id="agent-default-model-title" className="text-ui-base font-medium">
          {zh ? "默认模型" : "Default model"}
        </h3>
        <SettingsGroupCard>
          <SettingsRow
            searchId="aireq.model.default"
            label={zh ? "工作流默认模型" : "Workflow default model"}
            description={
              <div id="agent-default-model-scope" className="space-y-1">
                <div role="status" className="font-medium text-foreground">
                  <p>
                    {zh
                      ? `当前跟随默认：${currentFollowers}`
                      : `Currently following the default: ${currentFollowers}`}
                  </p>
                  {draftFollowers !== currentFollowers && (
                    <p>
                      {zh
                        ? `按草稿保存后：${draftFollowers}`
                        : `After saving these edits: ${draftFollowers}`}
                    </p>
                  )}
                </div>
                <p>
                  {zh
                    ? "跟随默认的 Agent 在新建讨论或接纳新评审时使用此模型。已有讨论和已接纳评审保留原配置。"
                    : "Applies when these Agents start a discussion or accept a review. Existing discussions and accepted reviews keep their settings."}
                </p>
              </div>
            }
            controlLayout="wide"
            control={
              <Select
                value={draft.defaultModel}
                disabled={Boolean(pending)}
                onValueChange={(defaultModel) =>
                  updateDraft((current) => ({ ...current, defaultModel }))
                }
              >
                <SelectTrigger
                  size="lg"
                  className="w-full min-w-0"
                  aria-label={zh ? "工作流默认模型" : "Workflow default model"}
                  aria-describedby="agent-default-model-scope"
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
          <SettingsGroupCard>
            {draft.agents.map((agent) => {
              const name = zh ? agent.name : agent.nameEn;
              return (
                <SettingsRow
                  key={agent.id}
                  label={name}
                  controlLayout="wide"
                  control={
                    <div className="w-full min-w-0 space-y-2">
                      <Select
                        value={agent.model}
                        disabled={Boolean(pending)}
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
                          disabled={Boolean(pending)}
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
                            {Object.entries(reasoningLabel).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
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
      {differences.length > 0 && (
        <section className="space-y-3" aria-labelledby="agent-model-comparison-title">
          <h3
            ref={comparisonRef}
            tabIndex={-1}
            id="agent-model-comparison-title"
            className="text-ui-base font-medium"
          >
            {zh ? "核对剩余修改" : "Review your remaining edits"}
          </h3>
          <p className="text-ui-sm text-foreground-subtle">
            {zh
              ? "已读取最新配置。请核对本页草稿，再选择保存。"
              : "The latest settings are loaded. Review your edits before saving."}
          </p>
          <SettingsGroupCard>
            <table
              aria-labelledby="agent-model-comparison-title"
              className="w-full table-fixed text-left text-ui-base"
            >
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {zh ? "设置" : "Setting"}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {zh ? "最新已保存" : "Latest saved"}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {zh ? "本页草稿" : "Your edit"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {differences.map(({ label, saved, draft: edited }) => (
                  <tr key={label}>
                    <th scope="row" className="break-words px-4 py-2 font-medium">
                      {label}
                    </th>
                    <td className="break-words px-4 py-2 text-foreground-subtle">{saved}</td>
                    <td className="break-words px-4 py-2">{edited}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SettingsGroupCard>
        </section>
      )}
      {/* 提交区放在字段之后，草稿与反馈贴住可视区底部，避免编辑长表时滚回页头。 */}
      <div
        className={`space-y-2 border-t border-border bg-background py-3 ${dirty || message ? "sticky bottom-0 z-10" : ""}`}
      >
        <SettingsFormActions
          leadingAction={
            <div className="space-y-1 text-ui-sm text-foreground-subtle">
              <p role="status">
                {dirty ? (zh ? `未保存：${changeSummary}` : `Unsaved: ${changeSummary}`) : ""}
              </p>
            </div>
          }
        >
          <Button
            size="lg"
            disabled={!dirty || Boolean(pending) || conflicted}
            onClick={() => void save()}
          >
            {pending === "save"
              ? zh
                ? "保存中…"
                : "Saving…"
              : zh
                ? "保存配置"
                : "Save configuration"}
          </Button>
          <Button variant="ghost" size="lg" disabled={!dirty || Boolean(pending)} onClick={discard}>
            {zh ? "取消" : "Cancel"}
          </Button>
        </SettingsFormActions>
        {conflicted && pending !== "save" && (
          <div className="flex flex-wrap items-center gap-2">
            <p role="status" className="text-ui-sm text-foreground-subtle">
              {conflictMessage}
            </p>
            <Button
              variant="outline"
              aria-disabled={pending === "read"}
              onClick={() => void reload()}
            >
              {pending === "read"
                ? zh
                  ? "正在读取…"
                  : "Loading…"
                : zh
                  ? "重新读取模型配置"
                  : "Reload model settings"}
            </Button>
          </div>
        )}
        {message && (
          <p
            ref={statusRef}
            tabIndex={-1}
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-ui-sm ${message.kind === "error" ? "text-destructive" : "text-foreground-subtle"}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
