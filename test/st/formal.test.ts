import { describe, expect } from "vitest";
import type {
  AIReqSelection,
  AIReqSystemRequirement,
  AIReqWorkflowView,
} from "@zcode/services/aireq";
import { srProgress, srProgressStatus } from "@zcode/services/aireq";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { config } from "./config.js";
import { useFormalPreparations } from "./preparations.js";
import { requireCreatedThisRun } from "./resources.js";
let preparations: ReturnType<typeof useFormalPreparations>;

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
  id: string,
  run: (c: STClient, ref: FormalRef, view: AIReqWorkflowView) => Promise<void>,
) {
  const c = await connectST();
  try {
    const ref = await preparations.ready(id);
    const { view } = await c.read(selection(ref));
    await run(c, ref, view);
  } finally {
    await c.close();
  }
}
function acceptancePrerequisite(sr: AIReqSystemRequirement) {
  if (!sr.codeMerge?.commit || sr.testAcceptance)
    throw new Error("[ST_BLOCKED] acceptance requires an unaccepted first code merge");
  return sr.codeMerge.commit;
}
function preservedFacts(sr: AIReqSystemRequirement) {
  return {
    acceptance: sr.testAcceptance,
    merge: sr.codeMerge,
    branch: sr.trackingBranch,
    plan: sr.planning,
    developer: sr.developerEmployeeId,
    tester: sr.testingEmployeeId,
  };
}

// tracking.md: planning is an atomic versioned edit; assignment is not exclusive authorization.
describe("formal SR contracts over the public backend", () => {
  preparations = useFormalPreparations();
  preparations.test(
    "cleans only registered branches of a completed IR while preserving evidence and idempotent receipts",
    { timeout: config.timeoutMs, meta: { stFormalPurpose: "formalCleanup", stPriority: 1 } },
    async ({ task }) => {
      await formalCase(task.id, async (c, ref, initial) => {
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
  );

  preparations.test(
    "keeps first-merge acceptance pending at 99% without analysis, then records evidence once and removes the todo",
    { timeout: config.timeoutMs, meta: { stFormalPurpose: "formalAcceptance", stPriority: 2 } },
    async ({ task }) => {
      await formalCase(task.id, async (c, ref, initial) => {
        const before = srIn(initial, ref),
          version = acceptancePrerequisite(before);
        const selected = selection(ref);
        const releaseId = initial.groups.find(
          (group) => group.projectId === ref.projectId && group.id === ref.irId,
        )!.releaseId;
        const testingTodos = (view: AIReqWorkflowView) =>
          (view.todos ?? []).filter(
            (todo) =>
              todo.kind === "testing" &&
              todo.projectId === ref.projectId &&
              todo.releaseId === releaseId &&
              todo.irId === ref.irId &&
              todo.srId === before.id,
          );
        const filter = { projectId: ref.projectId, releaseId, irId: ref.irId, srId: before.id };
        const successfulRuns = await c.call("progressScheduler.queryRuns", [
          { ...filter, status: "succeeded" },
          1,
          25,
        ]);
        expect(successfulRuns.total).toBe(0);
        expect(srProgressStatus(before)).toBe("待验收");
        expect(srProgress(before)).toBe(99);
        const todos = testingTodos(initial);
        expect(todos).toHaveLength(1);
        expect(todos[0]!.employeeId).toBe(before.testingEmployeeId);
        const pending = (await c.read(selected)).view;
        expect(srProgress(srIn(pending, ref))).toBe(99);
        expect(testingTodos(pending)).toEqual(todos);
        const operationId = unique("acceptance");
        const reason = "ST: acceptance evidence for the first merged code version";
        const input = {
          operationId,
          expectedRevision: pending.revision,
          expectedCodeVersion: version,
          reason,
        };
        await c.call("progress.recordTest", [ref.projectId, ref.irId, before.id, input], selected);
        const acceptedView = (await c.read(selected)).view;
        const accepted = srIn(acceptedView, ref);
        expect(accepted.testAcceptance).toMatchObject({
          operationId,
          employeeId: c.identity.employeeId,
          codeVersion: version,
          reason,
        });
        expect(accepted.status).toBe("completed");
        expect(srProgressStatus(accepted)).toBe("已完成");
        expect(Number.isFinite(Date.parse(accepted.testAcceptance!.at))).toBe(true);
        expect(accepted.codeMerge).toEqual(before.codeMerge);
        expect(accepted.trackingBranch).toEqual(before.trackingBranch);
        expect(srProgress(accepted)).toBe(100);
        expect(testingTodos(acceptedView)).toEqual([]);
        await c.call("progress.recordTest", [ref.projectId, ref.irId, before.id, input], selected);
        const replayedView = (await c.read(selected)).view;
        await expect(
          c.call(
            "progress.recordTest",
            [
              ref.projectId,
              ref.irId,
              before.id,
              {
                ...input,
                operationId: unique("duplicate-acceptance"),
                expectedRevision: replayedView.revision,
              },
            ],
            selected,
          ),
        ).rejects.toThrow();
        const replayed = (await c.read(selected)).view;
        expect(preservedFacts(srIn(replayed, ref))).toEqual(preservedFacts(accepted));
        expect(testingTodos(replayed)).toEqual([]);
      });
    },
  );

  preparations.test(
    "rejects stale revisions, mismatched merge versions and empty evidence without changing acceptance",
    {
      timeout: config.timeoutMs,
      meta: { stFormalPurpose: "formalAcceptanceValidation", stPriority: 2 },
    },
    async ({ task }) => {
      await formalCase(task.id, async (c, ref, initial) => {
        const before = srIn(initial, ref),
          version = acceptancePrerequisite(before);
        const selected = selection(ref);
        await c.call(
          "planning.updateSr",
          [
            ref.projectId,
            ref.irId,
            before.id,
            {
              operationId: unique("assign-tester"),
              expectedRevision: initial.revision,
              testingEmployeeId:
                before.testingEmployeeId === c.identity.employeeId ? "" : c.identity.employeeId,
            },
          ],
          selected,
        );
        const pending = srIn((await c.read(selected)).view, ref);
        for (const patch of [
          { expectedCodeVersion: unique("wrong-code"), reason: "ST valid evidence" },
          { expectedCodeVersion: version, reason: " \n " },
          {
            expectedRevision: initial.revision,
            expectedCodeVersion: version,
            reason: "ST valid evidence",
          },
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
                  ...patch,
                },
              ],
              selection(ref),
            ),
          ).rejects.toThrow();
          expect(preservedFacts(srIn((await c.read(selection(ref))).view, ref))).toEqual(
            preservedFacts(pending),
          );
        }
      });
    },
  );

  preparations.test(
    "saves assignment and dates atomically, rejects stale edits, and honors explicit clearing",
    { timeout: config.timeoutMs, meta: { stFormalPurpose: "formalPlanning", stPriority: 4 } },
    async ({ task }) => {
      await formalCase(task.id, async (c, ref, initial) => {
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
  );

  preparations.test(
    "rejects invalid employee IDs, impossible dates and incomplete/reversed intervals without partial writes",
    { timeout: config.timeoutMs, meta: { stFormalPurpose: "formalPlanning", stPriority: 4 } },
    async ({ task }) => {
      await formalCase(task.id, async (c, ref, initial) => {
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
  );

  preparations.test(
    "rejects branch cleanup before every SR is accepted without removing registered branches",
    { timeout: config.timeoutMs, meta: { stFormalPurpose: "formalCleanupBlocked", stPriority: 5 } },
    async ({ task }) => {
      await formalCase(task.id, async (c, ref, initial) => {
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
  );

  preparations.test(
    "retries only the failed SR branch from the formal documentation merge base",
    { timeout: config.timeoutMs, meta: { stFormalPurpose: "formalBranchFailure", stPriority: 6 } },
    async ({ task }) => {
      await formalCase(task.id, async (c, ref, initial) => {
        const sr = srIn(initial, ref);
        const group = initial.groups.find(
          (item) => item.projectId === ref.projectId && item.id === ref.irId,
        )!;
        if (sr.trackingBranch?.status !== "failed" || !group.merge?.commit)
          throw new Error(
            "[ST_BLOCKED] formalBranchFailure requires a failed registered branch and a formal documentation merge fact",
          );
        const siblings = (view: AIReqWorkflowView) =>
          view.srs
            .filter(
              (item) =>
                item.projectId === ref.projectId && item.irId === ref.irId && item.id !== sr.id,
            )
            .map((item) => ({ id: item.id, branch: item.trackingBranch }));
        const beforeSiblings = siblings(initial);
        if (!beforeSiblings.some(({ branch }) => branch?.status === "ready"))
          throw new Error("[ST_BLOCKED] formalBranchFailure requires a usable sibling branch");
        const result = await c.command({ type: "retrySrBranch", srId: sr.id }, selection(ref));
        expect(result.status).not.toBe("failed");
        const restored = await waitUntil(
          "formal branch retry reaches a usable registered branch",
          async () => (await c.read(selection(ref))).view,
          (view) => srIn(view, ref).trackingBranch?.status === "ready",
        );
        const restoredBranch = srIn(restored, ref).trackingBranch;
        expect(restoredBranch).toMatchObject({
          status: "ready",
          baseCommit: group.merge.commit,
          name: sr.trackingBranch.name,
        });
        expect(restoredBranch?.error).toBeUndefined();
        expect(siblings(restored)).toEqual(beforeSiblings);
        expect(
          restored.groups
            .filter((item) => item.projectId === ref.projectId && item.id === ref.irId)
            .map((item) => item.srIds),
        ).toEqual([group.srIds]);
      });
    },
  );
});
