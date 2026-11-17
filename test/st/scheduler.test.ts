import { describe, expect, it } from "vitest";
import type { AIReqAnalysisFilter } from "@zcode/services/aireq";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { config } from "./config.js";
import { claimFixture } from "./fixtures.js";
import { createProject } from "./business.js";
import { createFormalFixture } from "./formal-fixtures.js";

async function schedulerResource(c: STClient, purpose: "query" | "run") {
  // 没有环境专用前置时，完整走公开发布／合入核验流程；不能拿提案中的 SR 或样例任务替代。
  // 显式提供的前置仍按分配规则消费，失效或耗尽时不能悄悄换对象。
  const ref =
    config.fixtures.scheduler !== undefined
      ? await claimFixture(c, "scheduler")
      : await createFormalFixture(c, "scheduler");
  if (!ref.srId) throw new Error("[ST_BLOCKED] scheduler fixture requires a dedicated formal SR");
  const remote = await c.read({
    projectId: ref.projectId,
    irId: ref.irId,
    srId: ref.srId,
    formalView: "detail",
  });
  const sr = remote.view.srs.find(
    (item) => item.projectId === ref.projectId && item.irId === ref.irId && item.id === ref.srId,
  );
  const group = remote.view.groups.find(
    (item) =>
      item.projectId === ref.projectId && item.id === ref.irId && item.srIds.includes(ref.srId!),
  );
  if (!sr || !group)
    throw new Error("[ST_BLOCKED] scheduler fixture must identify an existing formal IR/SR");
  const releaseId = group.releaseId;
  if (!releaseId || (ref.releaseId !== undefined && ref.releaseId !== releaseId))
    throw new Error("[ST_BLOCKED] scheduler fixture Release must match its formal IR");
  // 只读筛选不依赖任务可运行；只有执行场景才要求分支可用且尚未完成。
  if (
    purpose === "run" &&
    (!sr.trackingBranch?.name ||
      ["failed", "deleted"].includes(sr.trackingBranch.status ?? "") ||
      (sr.testAcceptance?.outcome === "passed" &&
        sr.testAcceptance.codeVersion === sr.codeMerge?.commit))
  )
    throw new Error(
      "[ST_BLOCKED] scheduler fixture must have an available branch and unfinished business state",
    );
  return {
    ref: { ...ref, releaseId },
    sr,
    filter: {
      projectId: ref.projectId,
      irId: ref.irId,
      srId: sr.id,
      releaseId,
    } satisfies AIReqAnalysisFilter,
  };
}
function projectSetting(
  snapshot: { projects: { id: string; enabled: boolean }[] },
  projectId: string,
): boolean {
  const project = snapshot.projects.find((item) => item.id === projectId);
  if (!project)
    throw new Error("[ST_BLOCKED] configured project is absent from the scheduler directory");
  return project.enabled;
}

// tracking.md: pagination is server-owned; global off only stops automatic admission.
// No simulated clock, internal scheduler or model stub participates in these tests.
describe("progress scheduler over the public backend", () => {
  it(
    "queries task/history pages and filters exact project, Release, IR and SR without starting work",
    async () => {
      const c = await connectST();
      try {
        const { ref, sr, filter } = await schedulerResource(c, "query");
        const before = await c.call("progressScheduler.read", []);
        for (const pageSize of [25, 50]) {
          const page = await c.call("progressScheduler.queryTasks", [filter, 1, pageSize]);
          expect(page.page).toBe(1);
          expect(page.pageSize).toBe(pageSize);
          expect(page.total).toBe(1);
          expect(page.items).toHaveLength(1);
          expect(page.items[0]).toMatchObject({
            projectId: ref.projectId,
            irId: ref.irId,
            srId: sr.id,
            branch: sr.trackingBranch?.name ?? "",
          });
          expect(page.items[0]!.releaseId).toBe(ref.releaseId);
          const converged = await c.call("progressScheduler.queryTasks", [
            filter,
            1_000_000,
            pageSize,
          ]);
          expect(converged.page).toBe(1);
          expect(converged.items.map((item) => item.id)).toEqual(page.items.map((item) => item.id));
          const history = await c.call("progressScheduler.queryRuns", [filter, 1, pageSize]);
          expect(history.pageSize).toBe(pageSize);
          expect(history.items.length).toBeLessThanOrEqual(pageSize);
          for (const run of history.items) {
            expect(run).toMatchObject({ projectId: ref.projectId, irId: ref.irId, srId: sr.id });
            expect(run.releaseId).toBe(ref.releaseId);
          }
        }
        const matches = await c.call("progressScheduler.queryTasks", [
          { ...filter, srSearch: sr.title },
          1,
          25,
        ]);
        expect(matches.items.map((item) => item.srId)).toEqual([sr.id]);
        const absent = await c.call("progressScheduler.queryTasks", [
          { ...filter, srSearch: unique("no-matching-requirement") },
          1,
          25,
        ]);
        expect(absent.items).toEqual([]);
        expect(absent.total).toBe(0);
        expect(await c.call("progressScheduler.readRun", [unique("missing-run")])).toBeNull();
        const after = await c.call("progressScheduler.read", []);
        // Querying is read-only. Do not assert global totals, which may change through legitimate background work.
        expect(after.enabled).toBe(before.enabled);
        expect(after.intervalMinutes).toBe(before.intervalMinutes);
        expect(projectSetting(after, ref.projectId)).toBe(projectSetting(before, ref.projectId));
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "rejects invalid page/date/config values and leaves scheduler settings unchanged",
    async () => {
      const c = await connectST();
      try {
        const before = await c.call("progressScheduler.read", []);
        for (const [page, size] of [
          [0, 25],
          [-1, 25],
          [1, 10],
          [1, 0],
          [1.5, 25],
        ]) {
          await expect(
            c.call("progressScheduler.queryTasks", [{}, page!, size!]),
          ).rejects.toThrow();
          await expect(c.call("progressScheduler.queryRuns", [{}, page!, size!])).rejects.toThrow();
        }
        for (const range of [
          { since: "not-a-date" },
          { until: "2030-02-30" },
          { since: "2030-02-29" },
          { until: "1900-02-29" },
          { until: "2030-04-31" },
          { until: "2030-02-30T00:00:00Z" },
          { since: "2030-05-08", until: "2030-05-07" },
        ]) {
          await expect(c.call("progressScheduler.queryRuns", [range, 1, 25])).rejects.toThrow();
        }
        // 非法日期须拒绝，但普通月末、闰日、世纪闰年及等值时区表达仍是合法查询。
        for (const range of [
          { since: "2030-02-28", until: "2030-02-28" },
          { since: "2032-02-29", until: "2032-02-29" },
          { since: "2000-02-29T00:00:00Z", until: "2000-02-29T08:00:00+08:00" },
        ]) {
          const page = await c.call("progressScheduler.queryRuns", [range, 1, 25]);
          expect(page).toMatchObject({ page: 1, pageSize: 25, items: expect.any(Array) });
          for (const run of page.items) {
            expect(Date.parse(run.startedAt)).toBeGreaterThanOrEqual(Date.parse(range.since));
            expect(Date.parse(run.startedAt)).toBeLessThanOrEqual(Date.parse(range.until));
          }
        }
        for (const minutes of [0, -1, 1.5])
          await expect(
            c.call("progressScheduler.configure", [before.enabled, minutes]),
          ).rejects.toThrow();
        const after = await c.call("progressScheduler.read", []);
        expect({
          enabled: after.enabled,
          intervalMinutes: after.intervalMinutes,
          projects: after.projects.map(({ id, enabled }) => ({ id, enabled })),
        }).toEqual({
          enabled: before.enabled,
          intervalMinutes: before.intervalMinutes,
          projects: before.projects.map(({ id, enabled }) => ({ id, enabled })),
        });
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "new projects start disabled and their manual requests do not produce analysis runs",
    async () => {
      const c = await connectST();
      try {
        const project = await createProject(c);
        const snapshot = await c.call("progressScheduler.read", []);
        expect(projectSetting(snapshot, project.projectId)).toBe(false);
        await c.call("progressScheduler.runNow", [{ projectId: project.projectId }]);
        const history = await c.call("progressScheduler.queryRuns", [
          { projectId: project.projectId },
          1,
          25,
        ]);
        expect(history.items).toEqual([]);
        expect(history.total).toBe(0);
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "manual admission ignores global automatic-off, deduplicates concurrent SR execution and preserves completion snapshots",
    async () => {
      const c = await connectST();
      let restore: (() => Promise<void>) | undefined;
      let failure: unknown;
      try {
        const { ref, filter } = await schedulerResource(c, "run");
        const baseline = await c.call("progressScheduler.read", []);
        const wasProjectEnabled = projectSetting(baseline, ref.projectId);
        const bootstrap = await c.bootstrap();
        const oldHistory = await c.call("progressScheduler.queryRuns", [filter, 1, 50]);
        const oldIds = new Set(oldHistory.items.map((run) => run.id));
        if (oldHistory.items.some((run) => run.status === "running"))
          throw new Error("[ST_BLOCKED] scheduler fixture already has an active analysis");
        let wroteGlobal = false,
          wroteProject = false;
        let intendedProject = wasProjectEnabled;
        restore = async () => {
          const current = await c.call("progressScheduler.read", []);
          if (
            wroteGlobal &&
            (current.enabled !== false || current.intervalMinutes !== baseline.intervalMinutes)
          )
            throw new Error(
              "ST cleanup failed: scheduler configuration changed by another actor; refusing to overwrite",
            );
          if (wroteProject && projectSetting(current, ref.projectId) !== intendedProject)
            throw new Error(
              "ST cleanup failed: project analysis switch changed by another actor; refusing to overwrite",
            );
          if (wroteProject)
            await c.call("progressScheduler.setProjectEnabled", [ref.projectId, wasProjectEnabled]);
          if (wroteGlobal)
            await c.call("progressScheduler.configure", [
              baseline.enabled,
              baseline.intervalMinutes,
            ]);
        };
        await c.call("progressScheduler.configure", [false, baseline.intervalMinutes]);
        wroteGlobal = true;
        await c.call("progressScheduler.setProjectEnabled", [ref.projectId, false]);
        wroteProject = true;
        intendedProject = false;
        await c.call("progressScheduler.runNow", [filter]);
        expect(
          (await c.call("progressScheduler.queryRuns", [filter, 1, 50])).items.map((run) => run.id),
        ).toEqual(oldHistory.items.map((run) => run.id));
        await c.call("progressScheduler.setProjectEnabled", [ref.projectId, true]);
        intendedProject = true;
        const setting = await c.call("progressScheduler.read", []);
        expect(setting.enabled).toBe(false);
        expect(projectSetting(setting, ref.projectId)).toBe(true);
        const eligible = await c.call("progressScheduler.queryTasks", [filter, 1, 25]);
        if (eligible.eligibleCount !== 1)
          throw new Error(
            "[ST_BLOCKED] scheduler fixture is not eligible for exactly one unfinished SR",
          );
        const notified = new Set<string>();
        const notification = c.services.aiReqService.onDidChange((event) => {
          if (event.type === "scheduler") notified.add(event.type);
        });
        try {
          await Promise.all([
            c.call("progressScheduler.runNow", [filter]),
            c.call("progressScheduler.runNow", [filter]),
          ]);
          const completed = await waitUntil(
            "analysis terminal public history",
            async () => {
              const history = await c.call("progressScheduler.queryRuns", [filter, 1, 50]);
              return history.items.filter((run) => !oldIds.has(run.id));
            },
            (runs) => runs.length > 0 && runs.every((run) => run.status !== "running"),
          );
          expect(notified.has("scheduler")).toBe(true);
          expect(completed.every((run) => run.trigger === "manual")).toBe(true);
          expect(
            completed.every((run) => run.status === "succeeded" || run.status === "skipped"),
          ).toBe(true);
          // Independent intervals allow a second sequential no-change run but never two active runs for one SR.
          const ordered = [...completed].sort(
            (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
          );
          for (let index = 1; index < ordered.length; index++)
            expect(Date.parse(ordered[index]!.startedAt)).toBeGreaterThanOrEqual(
              Date.parse(ordered[index - 1]!.endedAt!),
            );
          for (const run of completed) {
            expect(run).toMatchObject({ projectId: ref.projectId, irId: ref.irId, srId: ref.srId });
            const detail = await c.call("progressScheduler.readRun", [run.id]);
            expect(detail).not.toBeNull();
            expect(detail).toMatchObject({
              id: run.id,
              taskId: run.taskId,
              status: run.status,
              trigger: "manual",
              before: run.before,
              after: run.after,
            });
            expect(detail!.modelConfig).toMatchObject({
              role: "progress-analysis",
              configurationRevision: bootstrap.models.revision,
            });
            expect(detail!.promptSnapshot?.additionalPrompt).toBe(
              bootstrap.prompts.saved["progress-analysis"] ?? "",
            );
            expect(typeof detail!.promptSnapshot?.revision).toBe("string");
            expect(Number.isFinite(Date.parse(run.startedAt))).toBe(true);
            expect(Number.isFinite(Date.parse(run.endedAt!))).toBe(true);
            if (run.status === "succeeded") {
              expect(detail!.report).toBeDefined();
              const projected = (
                await c.read({
                  projectId: ref.projectId,
                  irId: ref.irId,
                  srId: ref.srId,
                  formalView: "detail",
                })
              ).view.srs.find(
                (sr) =>
                  sr.id === ref.srId && sr.projectId === ref.projectId && sr.irId === ref.irId,
              );
              expect(projected?.progress?.inputFingerprint).toBe(detail!.report!.inputFingerprint);
              expect(projected?.progress?.analysedAt).toBe(detail!.report!.analysedAt);
            }
          }
          // No periodic-admission claim: this case deliberately disables the global automatic scheduler.
        } finally {
          notification.dispose();
        }
      } catch (error) {
        failure = error;
      }
      {
        const cleanupErrors: unknown[] = [];
        try {
          if (restore) await restore();
        } catch (error) {
          cleanupErrors.push(error);
        }
        try {
          await c.close();
        } catch (error) {
          cleanupErrors.push(error);
        }
        if (cleanupErrors.length)
          throw new AggregateError(
            [...(failure === undefined ? [] : [failure]), ...cleanupErrors],
            "ST analysis assertions/configuration restoration failed",
          );
      }
      if (failure !== undefined) throw failure;
    },
    config.timeoutMs,
  );
});
