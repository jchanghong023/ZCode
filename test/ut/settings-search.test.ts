import { describe, expect, it } from "vitest";
import {
  matchesSettingsNavigation,
  settingsNavigationSearchKeys,
} from "../../packages/ui/src/settings-search/settingsNavigationSearch.js";

describe("settings navigation search", () => {
  const labels = ["项目配置", "AI 模型"];

  it.each(["项目", "xiangmupeizhi", "xmpz", "项配", "ＡＩ　模 型"])(
    "finds current settings by Chinese, pinyin, initials or normalized text: %s",
    (query) => {
      expect(matchesSettingsNavigation(query, settingsNavigationSearchKeys(labels))).toBe(true);
    },
  );

  it("keeps alternative labels independently searchable without mutating them", () => {
    const input = ["外观", "Appearance"];
    const keys = settingsNavigationSearchKeys(input);
    expect(matchesSettingsNavigation("APP EAR", keys)).toBe(true);
    expect(matchesSettingsNavigation("wg", keys)).toBe(true);
    expect(input).toEqual(["外观", "Appearance"]);
  });

  it("requires query characters to appear in order and with enough occurrences", () => {
    const keys = settingsNavigationSearchKeys(["Project"]);
    expect(matchesSettingsNavigation("pjt", keys)).toBe(true);
    expect(matchesSettingsNavigation("tjp", keys)).toBe(false);
    expect(matchesSettingsNavigation("pp", keys)).toBe(false);
  });

  it("does not combine different labels into one synthetic match", () => {
    expect(matchesSettingsNavigation("模型项目", settingsNavigationSearchKeys(labels))).toBe(false);
  });

  it("shows all settings for an empty query but cannot match text against an empty index", () => {
    expect(matchesSettingsNavigation(" \t\n", [])).toBe(true);
    expect(matchesSettingsNavigation("项目", [])).toBe(false);
  });
});
