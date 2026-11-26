import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIReqRequirementGroup } from "../../packages/services/src/aireq/index.js";
import {
  compareProposalValues,
  defaultProposalPreferences,
  migrateCompactPreferences,
  proposalColumnValue,
  proposalFilterLabel,
  proposalFilterValues,
  readLegacyProposalPreferences,
  visibleProposalColumns,
  type ProposalColumn,
  type ProposalTablePreferences,
} from "../../packages/ui/src/aireq/proposals/proposalColumns.js";

const createdAt = "2026-11-12T00:00:00Z";
const now = Date.parse("2026-11-13T00:00:00Z");
const releaseTitles = new Map([["internal-pi-42", "研发迭代"]]);
const requirement: AIReqRequirementGroup = {
  id: "IR20261112000001",
  projectId: "project-a",
  releaseId: "",
  title: "导出记录",
  originalText: "导出完整记录。",
  submittedBy: "s00000001",
  documentPath: "docs/areq/IR20261112000001/requirements.md",
  createdAt,
  revision: 0,
  srIds: [],
  sessions: [],
  documentHistory: [],
  documentReviews: [],
};

const compactAtNarrowWidth: ProposalColumn[] = ["title", "id", "owner", "version"];
const previousAdaptiveColumns: ProposalColumn[] = [
  "title",
  "id",
  "owner",
  "developmentOwner",
  "testingOwner",
  "version",
];

const legacyKey = "aireq.proposal-columns:test";
function saveLegacyPreferences(preferences: ProposalTablePreferences) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => (key === legacyKey ? JSON.stringify(preferences) : null),
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("proposal table preferences", () => {
  it("migrates the original compact layout and preserves its sort", () => {
    const saved: ProposalTablePreferences = {
      columns: ["title", "id", "release", "owner", "version"],
      sort: { column: "id", direction: "ascending" },
    };
    const migrated = migrateCompactPreferences(saved);
    expect(migrated.sort).toEqual({ column: "id", direction: "ascending" });
    expect(visibleProposalColumns(migrated, 787, 152)).toEqual(compactAtNarrowWidth);

    const sortedByPi: ProposalTablePreferences = {
      ...saved,
      sort: { column: "release", direction: "descending" },
    };
    const retained = migrateCompactPreferences(sortedByPi);
    expect(retained.sort).toEqual({ column: "release", direction: "descending" });
    expect(visibleProposalColumns(retained, 787, 152)).toEqual([
      "title",
      "id",
      "release",
      "owner",
      "version",
    ]);
  });

  it("distinguishes stored adaptive layout from the same explicitly chosen columns", () => {
    const saved: ProposalTablePreferences = {
      autoFit: true,
      columns: previousAdaptiveColumns,
      sort: { column: "testingOwner", direction: "ascending" },
    };
    saveLegacyPreferences(saved);
    const legacy = readLegacyProposalPreferences(legacyKey);
    expect(legacy).toEqual(saved);
    const migrated = migrateCompactPreferences(legacy!);
    expect(migrated.sort).toEqual(saved.sort);
    expect(visibleProposalColumns(migrated, 1000, 152)).toEqual([
      "title",
      "id",
      "owner",
      "process",
      "dwellTime",
      "developmentOwner",
      "version",
    ]);

    saveLegacyPreferences({ ...saved, autoFit: false });
    const custom = readLegacyProposalPreferences(legacyKey);
    expect(custom?.autoFit).toBe(false);
    expect(visibleProposalColumns(migrateCompactPreferences(custom!), 700, 152)).toEqual(
      previousAdaptiveColumns,
    );
  });

  it("reserves the actions and base columns, then adds optional columns that fit by priority", () => {
    expect(visibleProposalColumns(defaultProposalPreferences, 787, 152)).toEqual(
      compactAtNarrowWidth,
    );
    expect(visibleProposalColumns(defaultProposalPreferences, 788, 152)).toEqual([
      "title",
      "id",
      "owner",
      "process",
      "version",
    ]);
    expect(visibleProposalColumns(defaultProposalPreferences, 1036, 152)).toEqual([
      "title",
      "id",
      "owner",
      "process",
      "dwellTime",
      "estimatedWorkloadManday",
      "version",
    ]);

    const reordered: ProposalTablePreferences = {
      ...defaultProposalPreferences,
      columns: ["version", "testingOwner", "title", "id", "dwellTime", "owner", "process"],
    };
    expect(visibleProposalColumns(reordered, 816, 152)).toEqual([
      "version",
      "title",
      "id",
      "owner",
      "process",
    ]);
    expect(visibleProposalColumns({ ...reordered, autoFit: false }, 816, 152)).toEqual(
      reordered.columns,
    );
  });
});

describe("proposal column filters", () => {
  it("keeps unassigned PI selectable without displaying internal IDs for unnamed PI", () => {
    expect(proposalFilterValues(requirement, "release")).toEqual([""]);
    expect(proposalFilterLabel("release", "", releaseTitles, true)).toBe("未分配");
    expect(proposalFilterLabel("release", "", releaseTitles, false)).toBe("Unassigned");
    expect(
      proposalFilterValues({ ...requirement, releaseId: "internal-pi-42" }, "release"),
    ).toEqual(["internal-pi-42"]);
    expect(proposalFilterLabel("release", "internal-pi-42", releaseTitles, true)).toBe("研发迭代");
    expect(proposalFilterLabel("release", "internal-pi-99", releaseTitles, true)).toBe(
      "未提供名称",
    );
    expect(
      proposalFilterLabel("release", "internal-pi-99", new Map([["internal-pi-99", ""]]), false),
    ).toBe("Name not provided");
  });

  it("separates missing documents from the unconfirmed and confirmed latest versions", () => {
    const draft = { ...requirement, documentVersion: { number: 2 } };
    const confirmed = {
      ...requirement,
      documentVersion: {
        number: 1,
        confirmation: { employeeId: "s00000001", confirmedAt: createdAt },
      },
    };
    const rows = [requirement, draft, confirmed];
    const options = rows.map((item) => proposalFilterValues(item, "version"));
    expect(options).toEqual([[""], ["unconfirmed"], ["confirmed"]]);
    expect(
      options.flat().map((value) => proposalFilterLabel("version", value, releaseTitles, true)),
    ).toEqual(["暂无文档", "草稿", "已定版"]);
  });

  it("matches individual labels, preserves false, and does not substitute a missing current owner", () => {
    const tagged = {
      ...requirement,
      owner: "s00000002",
      cloudFields: { labels: ["体验", "性能", " "], needDevelop: false },
    };
    expect(proposalFilterValues(tagged, "labels")).toEqual(["体验", "性能"]);
    expect(proposalFilterValues({ ...tagged, cloudFields: { labels: [""] } }, "labels")).toEqual([
      "",
    ]);
    expect(proposalFilterValues(requirement, "labels")).toEqual([""]);
    expect(proposalFilterLabel("labels", "", releaseTitles, true)).toBe("未设置");
    expect(proposalFilterValues(tagged, "needDevelop")).toEqual(["false"]);
    expect(proposalFilterLabel("needDevelop", "false", releaseTitles, true)).toBe("否");
    expect(proposalFilterValues(tagged, "owner")).toEqual([""]);
    expect(proposalFilterValues(tagged, "requester")).toEqual(["s00000002"]);
    expect(proposalFilterLabel("process", "完成", releaseTitles, false)).toBe("Complete");
  });

  it("sorts by a release name, always putting the unassigned IR after named releases", () => {
    const assigned = { ...requirement, releaseId: "internal-pi-42" };
    const collator = new Intl.Collator("zh-CN");
    const pi = (item: AIReqRequirementGroup) =>
      proposalColumnValue(item, "release", releaseTitles, now);
    expect(pi(assigned)).toBe("研发迭代");
    expect(pi(requirement)).toBeUndefined();
    for (const direction of ["ascending", "descending"] as const) {
      expect(
        [requirement, assigned].sort((a, b) =>
          compareProposalValues(pi(a), pi(b), direction, collator),
        ),
      ).toEqual([assigned, requirement]);
    }
  });
});
