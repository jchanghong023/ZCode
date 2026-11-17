import { useState } from "react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Label } from "@/components/ui/label.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import type { AIReqSkillDesignDraft } from "../contract.js";
import { SKILL_DESIGN_FIELDS } from "./skill-design-fields.js";

const coreFields = SKILL_DESIGN_FIELDS.filter((field) => field.required);
const optionalFields = SKILL_DESIGN_FIELDS.filter((field) => !field.required);

/** Brief presentation owns only field expansion; draft persistence and composer ACK stay in the editor. */
export function AIReqSkillBriefForm({
  draft,
  briefOpen,
  temporaryDirectory,
  fillError,
  insertPending,
  notice,
  filling,
  updateDraft,
  fillComposer,
}: {
  draft: AIReqSkillDesignDraft;
  briefOpen: boolean;
  temporaryDirectory: string;
  fillError: string;
  insertPending: boolean;
  notice: string;
  filling: boolean;
  updateDraft: (next: AIReqSkillDesignDraft) => void;
  fillComposer: () => void;
}) {
  const [optionalOpen, setOptionalOpen] = useState(false);
  const completed = SKILL_DESIGN_FIELDS.filter((field) => draft[field.id].trim()).length;
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border"
      id="skill-design-brief"
      aria-labelledby="skill-design-brief-title"
      aria-hidden={!briefOpen}
      inert={!briefOpen}
    >
      <div className="shrink-0 space-y-2 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 id="skill-design-brief-title" className="text-ui-base font-medium">
            技能说明
          </h3>
          <span className="text-ui-sm text-foreground-subtle">已填写 {completed} 项</span>
        </div>
        <p className="text-ui-sm text-foreground-subtle">
          填写任务目标后，填入右侧输入框，核对后再发送。技能标识由模型推荐。
        </p>
      </div>
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
        data-testid="skill-design-fields"
      >
        {coreFields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`skill-design-${field.id}`}>{field.label}</Label>
              {Boolean(draft[field.id].trim()) && (
                <Check className="size-3.5 text-foreground-subtle" aria-label="已填写" />
              )}
            </div>
            <SettingsFormTextarea
              id={`skill-design-${field.id}`}
              rows={2}
              aria-describedby={`skill-design-${field.id}-hint`}
              className="min-h-16 w-full resize-y"
              value={draft[field.id]}
              placeholder={field.placeholder}
              onChange={(event) => updateDraft({ ...draft, [field.id]: event.target.value })}
            />
            <p id={`skill-design-${field.id}-hint`} className="text-ui-sm text-foreground-subtle">
              {field.hint}
            </p>
          </div>
        ))}
        <Collapsible open={optionalOpen} onOpenChange={setOptionalOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="px-0">
              <ChevronDown
                className={`size-3 transition-transform ${optionalOpen ? "" : "-rotate-90"}`}
              />
              补充字段（选填）
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4 pt-3">
              {optionalFields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <Label htmlFor={`skill-design-${field.id}`}>{field.label}</Label>
                  <SettingsFormTextarea
                    id={`skill-design-${field.id}`}
                    rows={3}
                    aria-describedby={`skill-design-${field.id}-hint`}
                    className="w-full"
                    value={draft[field.id]}
                    placeholder={field.placeholder}
                    onChange={(event) => updateDraft({ ...draft, [field.id]: event.target.value })}
                  />
                  <p
                    id={`skill-design-${field.id}-hint`}
                    className="text-ui-sm text-foreground-subtle"
                  >
                    {field.hint}
                  </p>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
        {draft.notes.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                对话补充记录（{draft.notes.length}）
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="list-inside list-disc space-y-2 break-words text-ui-sm text-foreground-subtle">
                {draft.notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
      <div className="shrink-0 space-y-2 border-t border-border p-3">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="px-0 text-foreground-subtle">
              <ChevronDown className="size-3" />
              临时生成路径
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="break-all font-mono text-ui-sm text-foreground-subtle">
              {temporaryDirectory}
            </p>
          </CollapsibleContent>
        </Collapsible>
        {fillError && (
          <p role="alert" className="text-ui-sm text-destructive">
            {fillError}
          </p>
        )}
        {insertPending && (
          <p role="status" className="text-ui-sm text-foreground-subtle">
            正在填入聊天输入框…
          </p>
        )}
        {notice && (
          <p role="status" className="text-ui-sm text-foreground-subtle">
            {notice}
          </p>
        )}
        <Button className="w-full" disabled={insertPending || filling} onClick={fillComposer}>
          <ArrowRight className="size-3.5" />
          填入聊天输入框
        </Button>
      </div>
    </section>
  );
}
