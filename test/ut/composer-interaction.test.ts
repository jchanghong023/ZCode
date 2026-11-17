import { describe, expect, it } from "vitest";
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
