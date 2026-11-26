import { useMemo } from "react";
import type { IntlInstance } from "@/i18n/IntlProvider.js";
import type { PromptInputSuggestionItem } from "@/lib/promptInputTriggers.js";
import {
  type MentionPanelOption,
  type MentionPanelSection,
} from "@/mentions/components/MentionPanel.js";

export function useSlashCommandMentionPanelSections(
  intl: IntlInstance,
  commandsLength: number,
  filteredCommandSuggestions: PromptInputSuggestionItem[],
  filteredSkillSuggestions: PromptInputSuggestionItem[],
): MentionPanelSection[] {
  return useMemo(() => {
    const toOption = (suggestion: PromptInputSuggestionItem): MentionPanelOption => ({
      id: suggestion.id,
      label: suggestion.label,
      description: suggestion.description,
      content: (
        <span className="min-w-0 flex-1 flex items-center gap-2">
          <span className="truncate text-ui-base font-medium text-foreground max-w-[40%]">
            {suggestion.label}
          </span>
          <span className="truncate text-ui-base flex-1 text-foreground">
            {suggestion.description}
          </span>
        </span>
      ),
    });
    return [
      {
        id: "commands",
        title: intl.formatMessage({ id: "chat.slash.commands.title" }),
        options: filteredCommandSuggestions.map(toOption),
        loading: false,
        emptyText:
          commandsLength === 0
            ? intl.formatMessage({ id: "chat.slash.emptyUnavailable" })
            : intl.formatMessage({ id: "chat.slash.emptyResults" }),
      },
      {
        id: "skills",
        title: intl.formatMessage({ id: "chat.slash.skills.title" }),
        options: filteredSkillSuggestions.map(toOption),
        loading: false,
        emptyText: intl.formatMessage({ id: "chat.slash.skills.empty" }),
      },
    ];
  }, [commandsLength, filteredCommandSuggestions, filteredSkillSuggestions, intl]);
}
