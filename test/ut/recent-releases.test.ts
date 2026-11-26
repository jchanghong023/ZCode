import { expect, it } from "vitest";
import { recentReleases } from "../../packages/ui/src/aireq/projects/recentReleases.js";
import {
  openReleaseStays,
  releaseIRTitle,
} from "../../packages/ui/src/aireq/projects/releaseOverviewData.js";

const release = (id: string, projectId = "lander") => ({
  id,
  projectId,
  title: id,
  createdAt: "2020-01-01",
  requirementCount: 2,
  completedRequirementCount: 1,
  confirmedRequirementCount: 0,
});
const ir = (releaseId: string, createdAt: string, projectId = "lander") => ({
  releaseId,
  createdAt,
  projectId,
  id: createdAt,
  title: "导出记录",
  originalText: "",
  submittedBy: "",
  documentPath: "",
  revision: 0,
  srIds: [],
  sessions: [],
  documentHistory: [],
  documentReviews: [],
});

it("orders by the latest IR created in each release and retains its complete counts", () => {
  const now = Date.parse("2026-11-26T09:00:00+08:00");
  const all = ["2025release4", "current", "dated", "empty", "future"].map((id) => release(id));
  const result = recentReleases(
    [...all, release("current", "sailor")],
    [
      ir("2025release4", "2026/7/3 10:50:56"),
      ir("2025release4", "2024-01-01"),
      ir("current", "2025-11-26 00:00:00"),
      ir("current", "invalid"),
      ir("dated", "2025-11-25 23:59:59"),
      ir("future", "2026-11-27"),
      ir("dated", "2026-11-20", "sailor"),
      ir("", "2026-11-25"),
    ],
    "lander",
    now,
  );
  expect(result).toEqual([
    { ...all[0], updatedAt: Date.parse("2026-07-03T10:50:56+08:00") },
    { ...all[1], updatedAt: Date.parse("2025-11-26T00:00:00+08:00") },
  ]);
});

it("includes February 28 on a leap-day anniversary in the Beijing calendar", () => {
  const releases = [release("included"), release("before")];
  const result = recentReleases(
    releases,
    [ir("included", "2023-02-27T16:00:00Z"), ir("before", "2023-02-27T15:59:59Z")],
    "lander",
    Date.parse("2024-02-28T16:01:00Z"),
  );
  expect(result.map(({ id }) => id)).toEqual(["included"]);
});

it("bands open IRs by the whole days shown, sorting missing stage starts last", () => {
  const now = Date.parse("2026-11-26T00:00:00Z");
  const day = 86_400_000;
  const open = (age: number) => ({
    ...ir("v1", new Date(now - age).toISOString()),
    id: String(age),
    process: "初始",
  });
  const ages = [30 * day, 91 * day, 90 * day, 91 * day - 1, 30 * day - 1];
  const stays = openReleaseStays(
    [
      ...ages.map(open),
      { ...open(150 * day), process: "完成" },
      { ...open(120 * day), process: "测试" },
    ],
    now,
  );
  expect(stays.map(({ elapsed, band }) => [elapsed, band])).toEqual([
    [91 * day, "over-90"],
    [91 * day - 1, "30-90"],
    [90 * day, "30-90"],
    [30 * day, "30-90"],
    [30 * day - 1, undefined],
    [undefined, undefined],
  ]);
});

it("removes only the selected release prefix at the start of an overview title", () => {
  const name = "2026release4";
  expect(releaseIRTitle(name + " · 归档", name)).toBe("归档");
  for (const title of [
    "2026release40 · 归档",
    "2026release3 · 归档",
    "检查 " + name + " · 归档",
    name + "：归档",
  ]) {
    expect(releaseIRTitle(title, name)).toBe(title);
  }
});
