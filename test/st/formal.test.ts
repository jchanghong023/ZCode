import { describe, expect, it } from "vitest";
import type {
  AIReqSelection,
  AIReqSystemRequirement,
  AIReqWorkflowView,
} from "@zcode/services/aireq";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { config } from "./config.js";
import { claimFixture } from "./fixtures.js";
import { requireCreatedThisRun } from "./resources.js";
import { createFormalFixture } from "./formal-fixtures.js";

type FormalRef = {
  projectId: string;
  irId: string;
  srId?: string;
  releaseId?: string;
  [key: string]: unknown;
};

function selection(ref: FormalRef): AIReqSelection {
  return {
    projectId: ref.projectId,
    irId: ref.irId,
    ...(ref.srId ? { srId: ref.srId } : {}),
    formalView: "detail",
  };
}
function srIn(view: AIReqWorkflowView, ref: FormalRef): AIReqSystemRequirement {
  const sr = view.srs.find(
    (item) => item.projectId === ref.projectId && item.irId === ref.irId && item.id === ref.srId,
  );
  if (
    !sr ||
    !view.groups.some(
      (group) =>
        group.projectId === ref.projectId && group.id === ref.irId && group.srIds.includes(sr.id),
    )
  ) {
    throw new Error(
      `[ST_BLOCKED] fixture does not identify an existing formal SR (${ref.projectId}/${ref.irId}/${ref.srId ?? "missing-srId"})`,
    );
  }
  return sr;
}
async function formalCase(
  kind: string,
  run: (c: STClient, ref: FormalRef, view: AIReqWorkflowView) => Promise<void>,
) {
  const c = await connectST();
  try {
    // 各用例通过公开流程创建自身前置；显式配置的独立对象仍按原分配契约消费。
    const ref =
      config.fixtures[kind] === undefined
        ? await createFormalFixture(c, kind)
        : await claimFixture(c, kind);
    const { view } = await c.read(selection(ref));
    await run(c, ref, view);
  } finally {
    await c.close();
  }
}
function acceptancePrerequisite(sr: AIReqSystemRequirement) {
  if (
    !sr.codeMerge?.commit ||
    !sr.trackingBranch?.name ||
    ["failed", "deleted"].includes(sr.trackingBranch.status ?? "") ||
    (sr.testAcceptance?.outcome === "passed" &&
      sr.testAcceptance.codeVersion === sr.codeMerge.commit) ||
    sr.developmentIssues?.some((issue) => issue.status === "open")
  ) {
    throw new Error(
      "[ST_BLOCKED] acceptance requires an available registered branch, current merged code, no open issue and no completed acceptance for that version",
    );
  }
  return sr.codeMerge.commit;
}
function preservedFacts(sr: AIReqSystemRequirement) {
  return {
    acceptance: sr.testAcceptance,
    acceptanceHistory: sr.acceptanceHistory,
    issues: sr.developmentIssues,
    branch: sr.trackingBranch,
    plan: sr.planning,
    developer: sr.developerEmployeeId,
    tester: sr.testingEmployeeId,
  };
}

// tracking.md: planning is an atomic versioned edit; assignment is not exclusive authorization.
describe("formal SR contracts over the public backend", () => {
  it(
    "saves assignment and dates atomically, rejects stale edits, and honors explicit clearing",
    async () => {
      await formalCase("formalPlanning", async (c, ref, initial) => {
        const before = srIn(initial, ref);
        const start = "2030-05-06T09:00",
          end = "2030-05-07T18:00";
        const op = unique("planning");
        await c.call(
          "planning.updateSr",
          [
            ref.projectId,
            ref.irId,
            before.id,
            {
              operationId: op,
              expectedRevision: initial.revision,
              developerEmployeeId: c.identity.employeeId,
              testingEmployeeId: c.identity.employeeId,
              plannedStart: start,
              plannedEnd: end,
            },
          ],
          selection(ref),
        );
        const saved = (await c.read(selection(ref))).view;
        const sr = srIn(saved, ref);
        expect(sr).toMatchObject({
          developerEmployeeId: c.identity.employeeId,
          testingEmployeeId: c.identity.employeeId,
        });
        expect(sr.planning).toMatchObject({
          plannedStart: start,
          plannedEnd: end,
          source: "manual",
          updatedBy: c.identity.employeeId,
        });
        expect(Number.isFinite(Date.parse(sr.planning!.updatedAt!))).toBe(true);
        expect(sr.planning?.suggestion).toEqual(before.planning?.suggestion);
        expect(sr.planning?.assumptions).toBe(before.planning?.assumptions ?? "");
        await expect(
          c.call(
            "planning.updateSr",
            [
              ref.projectId,
              ref.irId,
              sr.id,
              {
                operationId: unique("stale-planning"),
                expectedRevision: initial.revision,
                developerEmployeeId: "",
                plannedStart: "2030-05-08T09:00",
                plannedEnd: "2030-05-09T18:00",
              },
            ],
            selection(ref),
          ),
        ).rejects.toThrow();
        expect(preservedFacts(srIn((await c.read(selection(ref))).view, ref))).toEqual(
          preservedFacts(sr),
        );
        const latest = (await c.read(selection(ref))).view;
        await c.call(
          "planning.updateSr",
          [
            ref.projectId,
            ref.irId,
            sr.id,
            {
              operationId: unique("clear-planning"),
              expectedRevision: latest.revision,
              developerEmployeeId: "",
              testingEmployeeId: "",
              plannedStart: "",
              plannedEnd: "",
            },
          ],
          selection(ref),
        );
        const cleared = srIn((await c.read(selection(ref))).view, ref);
        expect(cleared.developerEmployeeId ?? "").toBe("");
        expect(cleared.testingEmployeeId ?? "").toBe("");
        expect(cleared.planning?.plannedStart ?? "").toBe("");
        expect(cleared.planning?.plannedEnd ?? "").toBe("");
      });
    },
    config.timeoutMs,
  );

  it(
    "rejects invalid employee IDs, impossible dates and incomplete/reversed intervals without partial writes",
    async () => {
      await formalCase("formalPlanning", async (c, ref, initial) => {
        const before = srIn(initial, ref);
        const invalid = [
          {
            developerEmployeeId: "not-an-employee",
            plannedStart: "2030-05-06T09:00",
            plannedEnd: "2030-05-07T18:00",
          },
          { plannedStart: "2030-02-30T09:00", plannedEnd: "2030-03-03T18:00" },
          { plannedStart: "2030-05-06T09:00" },
          { plannedStart: "2030-05-06T09:00", plannedEnd: "2030-05-06T09:00" },
          { plannedStart: "2030-05-07T09:00", plannedEnd: "2030-05-06T18:00" },
        ];
        for (const patch of invalid) {
          const latest = (await c.read(selection(ref))).view;
          await expect(
            c.call(
              "planning.updateSr",
              [
                ref.projectId,
                ref.irId,
                before.id,
                {
                  operationId: unique("invalid-plan"),
                  expectedRevision: latest.revision,
                  ...patch,
                },
              ],
              selection(ref),
            ),
          ).rejects.toThrow();
          expect(preservedFacts(srIn((await c.read(selection(ref))).view, ref))).toEqual(
            preservedFacts(before),
          );
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "binds a passing acceptance to the current merged version and keeps its receipt idempotent",
    async () => {
      await formalCase("formalAcceptance", async (c, ref, initial) => {
        const before = srIn(initial, ref),
          version = acceptancePrerequisite(before);
        const operationId = unique("acceptance"),
          reason = "ST: acceptance evidence for the configured current code version";
        const input = {
          operationId,
          expectedRevision: initial.revision,
          expectedCodeVersion: version,
          outcome: "passed" as const,
          reason,
        };
        await c.call(
          "progress.recordTest",
          [ref.projectId, ref.irId, before.id, input],
          selection(ref),
        );
        const accepted = srIn((await c.read(selection(ref))).view, ref);
        expect(accepted.testAcceptance).toMatchObject({
          operationId,
          outcome: "passed",
          employeeId: c.identity.employeeId,
          codeVersion: version,
          reason,
        });
        expect(accepted.status).toBe("completed");
        // A prior AI report is not an acceptance precondition; optional report projections must agree when supplied.
        if (accepted.progress) expect(accepted.progress.percent).toBe(100);
        expect(accepted.acceptanceHistory).toHaveLength(
          (before.acceptanceHistory?.length ?? 0) + 1,
        );
        await c.call(
          "progress.recordTest",
          [ref.projectId, ref.irId, before.id, input],
          selection(ref),
        );
        expect(preservedFacts(srIn((await c.read(selection(ref))).view, ref))).toEqual(
          preservedFacts(accepted),
        );
      });
    },
    config.timeoutMs,
  );

  it(
    "rejects stale code versions and empty evidence without changing acceptance or issue history",
    async () => {
      await formalCase("formalAcceptance", async (c, ref, initial) => {
        const before = srIn(initial, ref),
          version = acceptancePrerequisite(before);
        for (const patch of [
          { expectedCodeVersion: unique("wrong-code"), reason: "ST valid evidence" },
          { expectedCodeVersion: version, reason: " \n " },
        ]) {
          const latest = (await c.read(selection(ref))).view;
          await expect(
            c.call(
              "progress.recordTest",
              [
                ref.projectId,
                ref.irId,
                before.id,
                {
                  operationId: unique("invalid-acceptance"),
                  expectedRevision: latest.revision,
                  outcome: "passed",
                  ...patch,
                },
              ],
              selection(ref),
            ),
          ).rejects.toThrow();
          expect(preservedFacts(srIn((await c.read(selection(ref))).view, ref))).toEqual(
            preservedFacts(before),
          );
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "a failed acceptance records a development issue and cannot be immediately changed to passed",
    async () => {
      await formalCase("formalAcceptanceFailure", async (c, ref, initial) => {
        const before = srIn(initial, ref),
          version = acceptancePrerequisite(before),
          reason = unique("ST-observed-failure");
        await c.call(
          "progress.recordTest",
          [
            ref.projectId,
            ref.irId,
            before.id,
            {
              operationId: unique("failed-acceptance"),
              expectedRevision: initial.revision,
              expectedCodeVersion: version,
              outcome: "failed",
              reason,
            },
          ],
          selection(ref),
        );
        const failedView = (await c.read(selection(ref))).view,
          failed = srIn(failedView, ref);
        if (failed.progress) expect(failed.progress.percent).toBe(99);
        expect(failed.testAcceptance).toMatchObject({
          outcome: "failed",
          codeVersion: version,
          reason,
          employeeId: c.identity.employeeId,
        });
        expect(failed.developmentIssues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              detail: reason,
              failedCodeVersion: version,
              status: "open",
              reportedBy: c.identity.employeeId,
            }),
          ]),
        );
        expect(failed.acceptanceHistory).toHaveLength((before.acceptanceHistory?.length ?? 0) + 1);
        await expect(
          c.call(
            "progress.recordTest",
            [
              ref.projectId,
              ref.irId,
              before.id,
              {
                operationId: unique("premature-pass"),
                expectedRevision: failedView.revision,
                expectedCodeVersion: version,
                outcome: "passed",
                reason: "Cannot bypass the missing repair merge",
              },
            ],
            selection(ref),
          ),
        ).rejects.toThrow();
        expect(preservedFacts(srIn((await c.read(selection(ref))).view, ref))).toEqual(
          preservedFacts(failed),
        );
      });
    },
    config.timeoutMs,
  );

  it(
    "accepting the configured repair version resolves awaiting-retest issues and retains history",
    async () => {
      await formalCase("formalRetest", async (c, ref, initial) => {
        const before = srIn(initial, ref),
          version = acceptancePrerequisite(before);
        const issues =
          before.developmentIssues?.filter((issue) => issue.status === "awaiting-retest") ?? [];
        if (
          !issues.length ||
          issues.some(
            (issue) => issue.fixCodeVersion !== version || issue.failedCodeVersion === version,
          )
        )
          throw new Error(
            "[ST_BLOCKED] formalRetest requires unresolved issues bound to a new merged repair version",
          );
        await c.call(
          "progress.recordTest",
          [
            ref.projectId,
            ref.irId,
            before.id,
            {
              operationId: unique("retest-pass"),
              expectedRevision: initial.revision,
              expectedCodeVersion: version,
              outcome: "passed",
              reason: "ST repair regression evidence",
            },
          ],
          selection(ref),
        );
        const accepted = srIn((await c.read(selection(ref))).view, ref);
        // A prior AI report is not an acceptance precondition; optional report projections must agree when supplied.
        if (accepted.progress) expect(accepted.progress.percent).toBe(100);
        for (const issue of issues)
          expect(accepted.developmentIssues).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: issue.id,
                status: "resolved",
                failedCodeVersion: issue.failedCodeVersion,
                fixCodeVersion: version,
              }),
            ]),
          );
        expect(accepted.acceptanceHistory).toEqual(
          expect.arrayContaining(before.acceptanceHistory ?? []),
        );
      });
    },
    config.timeoutMs,
  );

  it(
    "cleans only registered branches of a completed IR while preserving evidence and idempotent receipts",
    async () => {
      await formalCase("formalCleanup", async (c, ref, initial) => {
        requireCreatedThisRun(ref.projectId, ref.irId);
        const members = initial.srs.filter(
          (sr) => sr.projectId === ref.projectId && sr.irId === ref.irId,
        );
        if (
          !members.length ||
          members.some(
            (sr) =>
              !sr.codeMerge ||
              sr.testAcceptance?.outcome !== "passed" ||
              sr.testAcceptance.codeVersion !== sr.codeMerge.commit,
          )
        )
          throw new Error(
            "[ST_BLOCKED] formalCleanup requires every SR in the configured IR accepted on its current merged version",
          );
        const materialFacts = initial.materials.filter(
          (item) => item.projectId === ref.projectId && item.irId === ref.irId,
        );
        const evidence = members.map((sr) => ({
          id: sr.id,
          progress: sr.progress,
          acceptance: sr.testAcceptance,
          history: sr.acceptanceHistory,
        }));
        const preview = await c.call(
          "progress.cleanupPreview",
          [ref.projectId, ref.irId],
          selection(ref),
        );
        const project = initial.projects.find((item) => item.id === ref.projectId);
        expect(preview.map((item) => item.branch).sort()).toEqual(
          members.map((sr) => sr.trackingBranch!.name).sort(),
        );
        expect(preview.every((item) => item.branch !== project?.defaultBranch)).toBe(true);
        if (!preview.some((item) => item.status !== "deleted"))
          throw new Error("[ST_BLOCKED] formalCleanup resource has already been consumed");
        await expect(
          c.call(
            "progress.cleanupBranches",
            [
              ref.projectId,
              ref.irId,
              {
                operationId: unique("wrong-cleanup-set"),
                expectedRevision: initial.revision,
                branches: [...preview.map((item) => item.branch), unique("unregistered-branch")],
              },
            ],
            selection(ref),
          ),
        ).rejects.toThrow();
        expect(
          await c.call("progress.cleanupPreview", [ref.projectId, ref.irId], selection(ref)),
        ).toEqual(preview);
        const input = {
          operationId: unique("cleanup"),
          expectedRevision: initial.revision,
          branches: preview.map((item) => item.branch),
        };
        await c.call("progress.cleanupBranches", [ref.projectId, ref.irId, input], selection(ref));
        const after = (await c.read(selection(ref))).view;
        expect(
          after.srs
            .filter((sr) => sr.projectId === ref.projectId && sr.irId === ref.irId)
            .map((sr) => ({
              id: sr.id,
              progress: sr.progress,
              acceptance: sr.testAcceptance,
              history: sr.acceptanceHistory,
            })),
        ).toEqual(evidence);
        expect(
          after.materials.filter(
            (item) => item.projectId === ref.projectId && item.irId === ref.irId,
          ),
        ).toEqual(materialFacts);
        expect(
          (
            await c.call("progress.cleanupPreview", [ref.projectId, ref.irId], selection(ref))
          ).every((item) => item.status === "deleted"),
        ).toBe(true);
        await c.call("progress.cleanupBranches", [ref.projectId, ref.irId, input], selection(ref));
        expect(
          (
            await c.call("progress.cleanupPreview", [ref.projectId, ref.irId], selection(ref))
          ).every((item) => item.status === "deleted"),
        ).toBe(true);
      });
    },
    config.timeoutMs,
  );

  it(
    "rejects branch cleanup before every SR is accepted without removing registered branches",
    async () => {
      await formalCase("formalCleanupBlocked", async (c, ref, initial) => {
        requireCreatedThisRun(ref.projectId, ref.irId);
        const members = initial.srs.filter(
          (sr) => sr.projectId === ref.projectId && sr.irId === ref.irId,
        );
        const branches = members.flatMap((sr) =>
          sr.trackingBranch?.name ? [sr.trackingBranch.name] : [],
        );
        if (
          !branches.length ||
          members.every(
            (sr) =>
              sr.codeMerge &&
              sr.testAcceptance?.outcome === "passed" &&
              sr.testAcceptance.codeVersion === sr.codeMerge.commit,
          )
        )
          throw new Error(
            "[ST_BLOCKED] formalCleanupBlocked requires registered branches and at least one unfinished SR",
          );
        await expect(
          c.call(
            "progress.cleanupBranches",
            [
              ref.projectId,
              ref.irId,
              {
                operationId: unique("premature-cleanup"),
                expectedRevision: initial.revision,
                branches,
              },
            ],
            selection(ref),
          ),
        ).rejects.toThrow();
        const after = (await c.read(selection(ref))).view;
        for (const before of members)
          expect(
            after.srs.find(
              (sr) =>
                sr.projectId === before.projectId && sr.irId === before.irId && sr.id === before.id,
            )?.trackingBranch,
          ).toEqual(before.trackingBranch);
        expect(
          after.materials.filter(
            (material) => material.projectId === ref.projectId && material.irId === ref.irId,
          ),
        ).toEqual(
          initial.materials.filter(
            (material) => material.projectId === ref.projectId && material.irId === ref.irId,
          ),
        );
      });
    },
    config.timeoutMs,
  );

  it(
    "retries a failed SR branch from the formal documentation merge base",
    async () => {
      await formalCase("formalBranchFailure", async (c, ref, initial) => {
        const sr = srIn(initial, ref);
        const group = initial.groups.find(
          (item) => item.projectId === ref.projectId && item.id === ref.irId,
        )!;
        if (sr.trackingBranch?.status !== "failed" || !group.merge?.commit)
          throw new Error(
            "[ST_BLOCKED] formalBranchFailure requires a failed registered branch and a formal documentation merge fact",
          );
        const result = await c.command({ type: "retrySrBranch", srId: sr.id }, selection(ref));
        expect(result.status).not.toBe("failed");
        const restored = await waitUntil(
          "formal branch retry reaches a usable registered branch",
          async () => srIn((await c.read(selection(ref))).view, ref),
          (current) => current.trackingBranch?.status === "ready",
        );
        expect(restored.trackingBranch).toMatchObject({
          status: "ready",
          baseCommit: group.merge.commit,
          name: sr.trackingBranch.name,
        });
        expect(restored.trackingBranch?.error).toBeUndefined();
        expect(restored.acceptanceHistory).toEqual(sr.acceptanceHistory);
      });
    },
    config.timeoutMs,
  );
});
