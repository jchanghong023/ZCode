/**
 * slashCommandHelpers — 纯函数辅助工具，供 SlashCommandPlugin.tsx 使用
 */
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import type { ConversationCommandCatalogEntry } from "@zcode/shared/zcode-protocol-v4";
import type { PromptInputSuggestionItem } from "./lib/promptInputTriggers.js";

export function buildConversationCommandSuggestions(
  commands: readonly ConversationCommandCatalogEntry[],
  source: ConversationCommandCatalogEntry["source"],
): PromptInputSuggestionItem[] {
  return commands
    .filter((command) => command.source === source)
    .map((command) => ({
      id: `conversation-command:${command.name}`,
      trigger: "/",
      value: command.name,
      label: `/${command.name}`,
      description: command.description,
    }));
}

export function getTextAroundCursor() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchor = selection.anchor;
  if (anchor.type !== "text") {
    return {
      textAfterCursor: "",
      textBeforeCursor: $getRoot().getTextContent(),
    };
  }

  const node = anchor.getNode();
  if (!$isTextNode(node)) {
    return null;
  }

  const textContent = node.getTextContent();
  return {
    textAfterCursor: textContent.slice(anchor.offset),
    textBeforeCursor: textContent.slice(0, anchor.offset),
  };
}
