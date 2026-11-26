import { describe, expect, it } from "vitest";
import type { ConversationCommandCatalogEntry } from "@zcode/shared/zcode-protocol-v4";
import { buildConversationCommandSuggestions } from "../../packages/ui/src/slashCommandHelpers.js";
import { composerInteractionState } from "../../packages/ui/src/v4/composer/followupModeSettings.js";

const available = { readOnly: false, offline: false, waiting: false, blocked: false };
describe("composer interaction availability", () => {
  it.each([
    ["startNow", "ready"],
    ["enqueue", "queued"],
    ["guide", "guide"],
    ["choice", "choice"],
    ["reject", "blocked"],
  ] as const)("projects %s without inferring permission from completion", (mode, expected) => {
    expect(composerInteractionState({ ...available, mode })).toBe(expected);
  });
  it("keeps read-only above running or queued capability", () => {
    expect(composerInteractionState({ ...available, readOnly: true, mode: "enqueue" })).toBe(
      "readOnly",
    );
  });
  it("does not advertise enqueue when offline or rebuilding", () => {
    expect(composerInteractionState({ ...available, offline: true, mode: "enqueue" })).toBe(
      "offline",
    );
    expect(composerInteractionState({ ...available, blocked: true, mode: "guide" })).toBe(
      "blocked",
    );
    expect(composerInteractionState({ ...available, waiting: true, mode: "startNow" })).toBe(
      "waiting",
    );
  });
});

describe("conversation command catalog completion", () => {
  it("has no client suggestions when the catalog is empty", () => {
    expect(buildConversationCommandSuggestions([], "builtin")).toEqual([]);
    expect(buildConversationCommandSuggestions([], "skill")).toEqual([]);
  });

  it("keeps catalog commands and skills separate and uses the server command spelling", () => {
    const catalog = [
      { source: "builtin", name: "model", description: "Select model" },
      { source: "skill", name: "skill:review", description: "Review changes" },
    ] satisfies ConversationCommandCatalogEntry[];

    expect(buildConversationCommandSuggestions(catalog, "builtin")).toMatchObject([
      { label: "/model", value: "model" },
    ]);
    expect(buildConversationCommandSuggestions(catalog, "skill")).toMatchObject([
      { label: "/skill:review", value: "skill:review" },
    ]);
  });
});
