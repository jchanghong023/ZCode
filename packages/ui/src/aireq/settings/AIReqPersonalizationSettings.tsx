import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useAIReqDataSource } from "../data-source.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { AIReqDiscardDraftButton } from "./AIReqDiscardDraftButton.js";
import { AIReqPersonalConfigScope } from "./AIReqPersonalConfigScope.js";
import { AIReqSettingsTarget } from "./AIReqSettingsTarget.js";
import type { AIReqSettingsDraftActions } from "../contract.js";

export function AIReqPersonalizationSettings({
  onDraftActionsChange,
}: {
  onDraftActionsChange?: (actions: AIReqSettingsDraftActions | null) => void;
}) {
  const source = useAIReqDataSource();
  if (!source.prompts || !source.models)
    return (
      <p role="alert" className="text-ui-sm text-destructive">
        Agent 指令服务不可用，请检查连接后重新进入设置。
      </p>
    );
  return <PersonalizationContent onDraftActionsChange={onDraftActionsChange} />;
}

function PersonalizationContent({
  onDraftActionsChange,
}: {
  onDraftActionsChange?: (actions: AIReqSettingsDraftActions | null) => void;
}) {
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [agents] = useState(() => source.models!.read().agents);
  const [saved, setSaved] = useState(() => source.prompts!.read().saved);
  const [draft, setDraft] = useState(() => ({ ...source.prompts!.read().saved }));
  const [savedRevision, setSavedRevision] = useState(() => source.prompts!.read().revision);
  const [selected, setSelected] = useState<string>(() => agents[0]?.id ?? "");
  const agentSelectRef = useRef<HTMLButtonElement>(null);
  const selectedAgent = agents.find((agent) => agent.id === selected);
  // 成功与失败共用一个带类型的反馈，避免异常被渲染成普通成功状态。
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const dirtyAgents = agents.filter((agent) => draft[agent.id] !== saved[agent.id]);
  const dirtyCount = dirtyAgents.length;
  const encoder = new TextEncoder();
  const instructionSizes = agents.map((agent) => ({
    agent,
    bytes: encoder.encode(draft[agent.id] ?? "").length,
  }));
  const oversized = instructionSizes.filter(({ bytes }) => bytes > USER_INSTRUCTIONS_MAX_BYTES);
  const currentBytes = instructionSizes.find(({ agent }) => agent.id === selected)?.bytes ?? 0;
  const currentOverage = currentBytes - USER_INSTRUCTIONS_MAX_BYTES;
  const formatNumber = new Intl.NumberFormat(locale);
  const formatOverage = (bytes: number) => {
    const amount = formatNumber.format(bytes);
    if (zh) return `超出 ${amount} 字节`;
    return `${amount} ${bytes === 1 ? "byte" : "bytes"} over the limit`;
  };
  const oversizedSummary = oversized
    .map(({ agent, bytes }) => {
      const name = zh ? agent.name : agent.nameEn;
      return `${name}${zh ? "（" : " ("}${formatOverage(bytes - USER_INSTRUCTIONS_MAX_BYTES)}${zh ? "）" : ")"}`;
    })
    .join(zh ? "、" : ", ");
  const saveBlockedReason = oversizedSummary
    ? zh
      ? `请缩短指令后再保存：${oversizedSummary}。`
      : `Shorten these instructions before saving: ${oversizedSummary}.`
    : undefined;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const focusEditorAfterSwitch = useRef(false);
  useLayoutEffect(() => {
    if (!focusEditorAfterSwitch.current) return;
    focusEditorAfterSwitch.current = false;
    textarea.current?.scrollIntoView({ block: "center" });
    textarea.current?.focus({ preventScroll: true });
  }, [selected]);
  const firstOversizedAgent = oversized[0]?.agent.id;
  const editOversizedInstructions = () => {
    if (!firstOversizedAgent) return;
    if (firstOversizedAgent === selected) {
      textarea.current?.scrollIntoView({ block: "center" });
      textarea.current?.focus({ preventScroll: true });
    } else {
      // 等待切换后的值和错误描述就位，再把焦点移到正确的编辑器。
      focusEditorAfterSwitch.current = true;
      setSelected(firstOversizedAgent);
    }
  };
  const canSave = dirtyCount > 0 && oversized.length === 0;
  const dirty = dirtyCount > 0;
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const draftActions = useRef<AIReqSettingsDraftActions | null>(null);
  const save = async () => {
    if (!canSave || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setMessage(null);
    try {
      await source.prompts!.save(draft, savedRevision);
      setSaved({ ...source.prompts!.read().saved });
      setSavedRevision(source.prompts!.read().revision);
      setMessage({
        kind: "success",
        text: zh ? "追加指令已保存。" : "Appended instructions saved.",
      });
      return true;
    } catch (cause) {
      setMessage({
        kind: "error",
        text: formatUserFacingError(
          cause,
          zh ? "指令保存失败，请重试。" : "Could not save instructions. Please retry.",
        ),
      });
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  draftActions.current = {
    canSave: canSave && !saving,
    canDiscard: !saving,
    save,
    discard: () => {
      setDraft({ ...saved });
      setMessage(null);
    },
  };
  useEffect(() => {
    onDraftActionsChange?.(
      // 保存中的旧快照不能与继续编辑、丢弃离开并发，否则会丢失未接纳输入。
      dirty || saving
        ? {
            canSave: canSave && !saving,
            canDiscard: !saving,
            saveBlockedReason,
            save: () => draftActions.current?.save() ?? false,
            discard: () => draftActions.current?.discard(),
          }
        : null,
    );
  }, [dirty, canSave, saving, saveBlockedReason, onDraftActionsChange]);
  useEffect(() => () => onDraftActionsChange?.(null), [onDraftActionsChange]);
  if (!agents.length)
    return (
      <div className="space-y-8" data-testid="aireq-personalization-settings">
        <p role="status" className="text-ui-sm text-foreground-subtle">
          {zh ? "暂无可配置的 Agent。" : "No Agents are available."}
        </p>
      </div>
    );
  return (
    <div className="space-y-8" data-testid="aireq-personalization-settings">
      <AIReqPersonalConfigScope>
        <p>
          {zh
            ? "为各 Agent 追加团队共享的指令和工作约定，不替换内置指令。"
            : "Add shared team instructions and working conventions for each Agent without replacing built-in instructions."}
        </p>
      </AIReqPersonalConfigScope>
      <AIReqSettingsTarget id="aireq.instructions.agent" className="space-y-2">
        <Label htmlFor="personalization-agent">{zh ? "选择 Agent" : "Select Agent"}</Label>
        <Select
          value={selected}
          disabled={saving}
          onValueChange={(value) => {
            setSelected(value);
            setMessage(null);
          }}
        >
          <SelectTrigger
            ref={agentSelectRef}
            id="personalization-agent"
            size="lg"
            className="w-full sm:w-72"
            aria-describedby="personalization-agent-description"
          >
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
        <p
          id="personalization-agent-description"
          className="text-ui-sm leading-6 text-foreground-subtle"
        >
          {zh ? selectedAgent?.description : selectedAgent?.descriptionEn}
        </p>
      </AIReqSettingsTarget>
      <AIReqSettingsTarget id="aireq.instructions.prompt" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Label htmlFor="agent-system-prompt-append">
            {zh ? "追加指令" : "Additional instructions"}
          </Label>
          <span id="agent-prompt-size" className="text-ui-sm text-foreground-subtle">
            {currentBytes < 1024 || currentOverage > 0
              ? `${formatNumber.format(currentBytes)} B`
              : `${(currentBytes / 1024).toFixed(1)} KB`}{" "}
            / {USER_INSTRUCTIONS_MAX_BYTES / 1024} KB
          </span>
        </div>
        <SettingsFormTextarea
          ref={textarea}
          id="agent-system-prompt-append"
          className="h-48 field-sizing-fixed overflow-y-auto [@media(min-height:800px)]:h-64"
          spellCheck={false}
          value={draft[selected] ?? ""}
          readOnly={saving}
          placeholder={
            zh
              ? "输入你希望追加给该 Agent 的指令。留空则仅使用原有指令。"
              : "Enter instructions you want to append for this Agent. Leave empty to use existing instructions only."
          }
          aria-describedby={
            currentOverage > 0
              ? "agent-prompt-help agent-prompt-size agent-prompt-error"
              : "agent-prompt-help agent-prompt-size"
          }
          aria-invalid={currentOverage > 0}
          onChange={(event) => {
            const value = event.target.value;
            setDraft((current) => ({ ...current, [selected]: value }));
            setMessage(null);
          }}
        />
        <p id="agent-prompt-help" className="text-ui-sm text-foreground-subtle">
          {zh ? "留空则不追加指令。" : "Leave empty to add no instructions."}
        </p>
        {currentOverage > 0 && (
          <p id="agent-prompt-error" className="text-ui-sm text-destructive">
            {formatOverage(currentOverage)}
          </p>
        )}
      </AIReqSettingsTarget>
      <div
        className={`space-y-2 border-t border-border bg-background py-3 ${dirty || message ? "sticky bottom-0 z-10" : ""}`}
      >
        {saveBlockedReason && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p role="alert" className="text-ui-sm leading-5 text-destructive">
              {saveBlockedReason}
            </p>
            <Button variant="link" onClick={editOversizedInstructions}>
              {zh ? "编辑超限指令" : "Edit over-limit instructions"}
            </Button>
          </div>
        )}
        <SettingsFormActions
          leadingAction={
            dirty ? (
              <p role="status" className="text-ui-sm leading-5 text-foreground-subtle">
                {zh ? "未保存：" : "Unsaved: "}
                {dirtyAgents
                  .map((agent) => (zh ? agent.name : agent.nameEn))
                  .join(zh ? "、" : ", ")}
                {zh ? "。保存适用于全部草稿。" : ". Saving applies to all drafts."}
              </p>
            ) : null
          }
        >
          <Button size="lg" disabled={!canSave || saving} onClick={save}>
            {saving ? (zh ? "保存中…" : "Saving…") : zh ? "保存" : "Save"}
          </Button>
          <AIReqDiscardDraftButton
            size="lg"
            disabled={!dirtyCount || saving}
            description={
              zh
                ? "当前修改过的所有 Agent 指令都会恢复为已保存内容。"
                : "All edited Agent instructions will revert to their saved values."
            }
            onDiscard={() => draftActions.current?.discard()}
            focusAfterDiscard={agentSelectRef}
          />
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
    </div>
  );
}
