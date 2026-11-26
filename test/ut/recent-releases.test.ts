import { expect, it } from "vitest";
import { recentReleases } from "../../packages/ui/src/aireq/projects/recentReleases.js";

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
