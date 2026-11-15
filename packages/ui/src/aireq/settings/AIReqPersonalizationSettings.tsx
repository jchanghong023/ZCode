import { getEmployeeId } from "../identity.js";
import { useAIReqDataSource } from "../data-source.js";
import { useEffect, useRef, useState } from "react";
import { USER_INSTRUCTIONS_MAX_BYTES } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Label } from "@/components/ui/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { SettingsFormActions } from "@/settings/SettingsFormActions.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { AIReqPersonalConfigScope } from "./AIReqPersonalConfigScope.js";
import type { AIReqModelDraftActions } from "./AIReqAgentModelSettings.js";

export function AIReqPersonalizationSettings({
  onDraftActionsChange,
}: {
  onDraftActionsChange?: (actions: AIReqModelDraftActions | null) => void;
}) {
  const source = useAIReqDataSource();
  if (!source.prompts || !source.models)
    return (
      <p role="alert" className="text-ui-sm text-destructive">
        个性化配置服务不可用，请检查连接后重新进入设置。
      </p>
    );
  return <PersonalizationContent onDraftActionsChange={onDraftActionsChange} />;
}

function PersonalizationContent({
  onDraftActionsChange,
}: {
  onDraftActionsChange?: (actions: AIReqModelDraftActions | null) => void;
}) {
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [agents] = useState(() => source.models!.read().agents);
  const [saved, setSaved] = useState(() => source.prompts!.read().saved);
  const [draft, setDraft] = useState(() => ({ ...source.prompts!.read().saved }));
  const [savedRevision, setSavedRevision] = useState(() => source.prompts!.read().revision);
  const [selected, setSelected] = useState("requirements");
  // 成功与失败共用一个带类型的反馈，避免异常被渲染成普通成功状态。
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const dirtyAgents = agents.filter((agent) => draft[agent.id] !== saved[agent.id]);
  const dirtyCount = dirtyAgents.length;
  const encoder = new TextEncoder();
  const oversized = agents.filter(
    (agent) => encoder.encode(draft[agent.id] ?? "").length > USER_INSTRUCTIONS_MAX_BYTES,
  );
  const currentBytes = encoder.encode(draft[selected] ?? "").length;
  const canManage = source.capabilities.settingsWrite === true && getEmployeeId() === "j00808874";
  const canSave = canManage && dirtyCount > 0 && oversized.length === 0;
  const dirty = dirtyCount > 0;
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const draftActions = useRef<AIReqModelDraftActions | null>(null);
  const save = async () => {
    if (!canSave || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setMessage(null);
    try {
      await source.prompts!.save(draft, savedRevision);
      setSaved({ ...source.prompts!.read().saved });
      setSavedRevision(source.prompts!.read().revision);
      setMessage({ kind: "success", text: zh ? "追加提示词已保存。" : "Appended instructions saved." });
      return true;
    } catch (cause) {
      setMessage({ kind: "error", text: cause instanceof Error ? cause.message : String(cause) });
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  draftActions.current = {
    canSave: canSave && !saving,
    save,
    discard: () => {
      setDraft({ ...saved });
      setMessage(null);
    },
  };
  useEffect(() => {
    onDraftActionsChange?.(
      dirty
        ? {
            canSave: canSave && !saving,
            save: () => draftActions.current?.save() ?? false,
            discard: () => draftActions.current?.discard(),
          }
        : null,
    );
  }, [dirty, canManage, canSave, saving, onDraftActionsChange]);
  useEffect(() => () => onDraftActionsChange?.(null), [onDraftActionsChange]);
  return (
    <div className="space-y-5" data-testid="aireq-personalization-settings">
      <p className="text-ui-base leading-6 text-foreground-subtle">
        {zh
          ? "为各 Agent 追加表达偏好和工作约定，不替换内置指令。"
          : "Add preferences and working conventions for each Agent without replacing built-in instructions."}
      </p>
      <AIReqPersonalConfigScope />
      <div className="space-y-2">
        <Label htmlFor="personalization-agent">{zh ? "选择 Agent" : "Select Agent"}</Label>
        <Select
          value={selected}
          onValueChange={(value) => {
            setSelected(value);
            setMessage(null);
          }}
        >
          <SelectTrigger id="personalization-agent" size="lg" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {zh ? agent.name : agent.nameEn}
                {draft[agent.id] !== saved[agent.id] && (zh ? " · 未保存" : " · Unsaved")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* 草稿属于全部 Agent，切换当前编辑项不能隐藏其他 Agent 的未保存状态。 */}
        {dirty && (
          <p role="status" className="text-ui-base leading-6 text-foreground-subtle">
            {zh ? "未保存：" : "Unsaved: "}
            {dirtyAgents.map((agent) => (zh ? agent.name : agent.nameEn)).join(zh ? "、" : ", ")}
            {zh
              ? "。保存或取消将应用于全部草稿。"
              : ". Save or cancel applies to all drafts."}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="agent-system-prompt-append">
          {zh ? "追加系统提示词" : "Append system instructions"}
        </Label>
        <SettingsFormTextarea
          id="agent-system-prompt-append"
          readOnly={!canManage}
          className="min-h-64 w-full text-ui-base"
          spellCheck={false}
          value={draft[selected] ?? ""}
          placeholder={
            zh
              ? "输入你希望追加给该 Agent 的指令。留空则仅使用原有指令。"
              : "Enter instructions you want to append for this Agent. Leave empty to use existing instructions only."
          }
          aria-describedby="agent-prompt-help agent-prompt-size"
          aria-invalid={currentBytes > USER_INSTRUCTIONS_MAX_BYTES}
          onChange={(event) => {
            if (!canManage) return;
            const value = event.target.value;
            setDraft((current) => ({ ...current, [selected]: value }));
            setMessage(null);
          }}
        />
        <div className="flex flex-wrap items-start justify-between gap-2 text-ui-sm text-foreground-subtle">
          <p id="agent-prompt-help">
            {zh ? "留空则不追加指令。" : "Leave empty to add no instructions."}
          </p>
          <span id="agent-prompt-size">
            {(currentBytes / 1024).toFixed(1)} / {USER_INSTRUCTIONS_MAX_BYTES / 1024} KB
          </span>
        </div>
      </div>
      {oversized.length > 0 && (
        <p role="alert" className="text-ui-base text-destructive">
          {zh
            ? "以下 Agent 的追加提示词超过大小限制，请缩短后保存："
            : "Shorten these Agents' appended instructions before saving: "}
          {oversized.map((agent) => (zh ? agent.name : agent.nameEn)).join("、")}
        </p>
      )}
      <SettingsFormActions>
        <Button size="lg" disabled={!canSave || saving} onClick={save}>
          {zh ? "保存" : "Save"}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          disabled={!dirtyCount || !canManage || saving}
          onClick={() => {
            setDraft({ ...saved });
            setMessage(null);
          }}
        >
          {zh ? "取消" : "Cancel"}
        </Button>
      </SettingsFormActions>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-ui-base ${message.kind === "error" ? "text-destructive" : "text-foreground-subtle"}`}
        >
          {message.kind === "error" && (zh ? "保存失败：" : "Save failed: ")}
          {message.text}
        </p>
      )}
    </div>
  );
}
