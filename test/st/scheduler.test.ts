import { describe, expect } from "vitest";
import {
  srProgress,
  type AIReqAnalysisFilter,
  type AIReqRemoteBootstrap,
} from "@zcode/services/aireq";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { config, requireConfig } from "./config.js";
import { useFormalPreparations } from "./preparations.js";
import { createProject } from "./business.js";
let preparations: ReturnType<typeof useFormalPreparations>;

async function schedulerResource(c: STClient, id: string) {
  const ref = await preparations.ready(id);
  if (!ref.srId) throw new Error("[ST_BLOCKED] scheduler fixture requires a dedicated formal SR");
  const selection = {
    projectId: ref.projectId,
    irId: ref.irId,
    srId: ref.srId,
    formalView: "detail" as const,
  };
  const { view } = await c.read(selection);
  const sr = view.srs.find(
    (item) => item.projectId === ref.projectId && item.irId === ref.irId && item.id === ref.srId,
  );
  const group = view.groups.find(
    (item) =>
      item.projectId === ref.projectId && item.id === ref.irId && item.srIds.includes(ref.srId!),
  );
  if (!sr || !group)
    throw new Error("[ST_BLOCKED] scheduler fixture must identify an existing formal IR/SR");
  const releaseId = group.releaseId;
  if (!releaseId || (ref.releaseId !== undefined && ref.releaseId !== releaseId))
    throw new Error("[ST_BLOCKED] scheduler fixture Release must match its formal IR");
  const filter = { projectId: ref.projectId, irId: ref.irId, srId: sr.id, releaseId };
  return {
    ref: { ...ref, releaseId },
    sr,
    view,
    selection,
    filter,
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

function requireUnmerged({ sr }: Awaited<ReturnType<typeof schedulerResource>>) {
  if (sr.codeMerge || !sr.trackingBranch?.name || sr.trackingBranch.status !== "ready")
    throw new Error("[ST_BLOCKED] scenario requires a ready SR without a first code merge");
}

async function withSchedulerSettings(
  c: STClient,
  projectId: string,
  run: (settings: {
    configure: (enabled: boolean, minutes: number) => Promise<void>;
    setProjectEnabled: (enabled: boolean) => Promise<void>;
    intervalMinutes: number;
  }) => Promise<void>,
) {
  const baseline = await c.call("progressScheduler.read", []);
  const initialProject = projectSetting(baseline, projectId);
  let project = initialProject;
  let global = { enabled: baseline.enabled, intervalMinutes: baseline.intervalMinutes };
  try {
    await run({
      intervalMinutes: baseline.intervalMinutes,
      async configure(enabled, minutes) {
        await c.call("progressScheduler.configure", [enabled, minutes]);
        global = { enabled, intervalMinutes: minutes };
      },
      async setProjectEnabled(enabled) {
        await c.call("progressScheduler.setProjectEnabled", [projectId, enabled]);
        project = enabled;
      },
    });
  } finally {
    const current = await c.call("progressScheduler.read", []);
    try {
      if (project !== initialProject) {
        expect(
          projectSetting(current, projectId),
          "refusing to overwrite another project switch writer",
        ).toBe(project);
        await c.call("progressScheduler.setProjectEnabled", [projectId, initialProject]);
      }
    } finally {
      if (
        global.enabled !== baseline.enabled ||
        global.intervalMinutes !== baseline.intervalMinutes
      ) {
        expect(current, "refusing to overwrite another scheduler settings writer").toMatchObject(
          global,
        );
        await c.call("progressScheduler.configure", [baseline.enabled, baseline.intervalMinutes]);
      }
    }
  }
}

const analysisRole = "progress-analysis";
// One real minute is part of the automatic scenario, in addition to the usual I/O allowance.
const automaticCheckTimeout = 60_000 + config.timeoutMs;

async function runManual(c: STClient, filter: AIReqAnalysisFilter, concurrent = false) {
  const before = await c.call("progressScheduler.queryRuns", [filter, 1, 50]);
  const existing = new Set(before.items.map((item) => item.id));
  await Promise.all([
    c.call("progressScheduler.runNow", [filter]),
    ...(concurrent ? [c.call("progressScheduler.runNow", [filter])] : []),
  ]);
  const runs = await waitUntil(
    "the admitted manual analysis reaches terminal history",
    async () => {
      const page = await c.call("progressScheduler.queryRuns", [filter, 1, 50]);
      return page.items.filter((item) => !existing.has(item.id));
    },
    (items) => items.length > 0 && items.every((item) => item.status !== "running"),
  );
  expect(runs.every((item) => item.trigger === "manual")).toBe(true);
  expect(runs.every((item) => item.status === "succeeded" || item.status === "skipped")).toBe(true);
  return runs;
}

async function latestSuccessfulRun(c: STClient, filter: AIReqAnalysisFilter) {
  const { items } = await c.call("progressScheduler.queryRuns", [
    { ...filter, status: "succeeded" },
    1,
    25,
  ]);
  expect(items[0]).toBeDefined();
  const result = await c.call("progressScheduler.readRun", [items[0]!.id]);
  expect(result?.report).toBeDefined();
  return result!;
}

// tracking.md: pagination is server-owned; global off only stops automatic admission.
// No simulated clock, internal scheduler or model stub participates in these tests.
describe("progress scheduler over the public backend", () => {
  // 不让其他 case 的动态分支合入改变本例正在分析的仓库输入。
  preparations = useFormalPreparations("case");
  preparations.test(
    "allows manual analysis while global automatic analysis is off and uses new model or instructions once",
    { timeout: config.timeoutMs, meta: { stFormalPurpose: "schedulerConfiguration" } },
    async ({ task }) => {
      const c = await connectST();
      try {
        const resource = await schedulerResource(c, task.id);
        const { ref, filter, selection } = resource;
        requireUnmerged(resource);
        await withSchedulerSettings(c, ref.projectId, async (settings) => {
          await settings.configure(false, settings.intervalMinutes);
          expect((await c.call("progressScheduler.read", [])).nextCheckAt).toBeUndefined();
          const history = () => c.call("progressScheduler.queryRuns", [filter, 1, 50]);
          const tasks = () => c.call("progressScheduler.queryTasks", [filter, 1, 25]);
          const oldHistory = await waitUntil(
            "any analysis admitted before automatic pause finishes",
            history,
            (page) => page.items.every((run) => run.status !== "running"),
          );
          await settings.setProjectEnabled(false);
          expect((await tasks()).eligibleCount).toBe(0);
          await c.call("progressScheduler.runNow", [filter]);
          expect(await history()).toEqual(oldHistory);
          await settings.setProjectEnabled(true);
          expect((await tasks()).eligibleCount).toBe(1);

          const baseline = await c.bootstrap();
          const initialRuns = await runManual(c, filter, true);
          const ordered = [...initialRuns].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
          for (let index = 1; index < ordered.length; index++)
            expect(Date.parse(ordered[index]!.startedAt)).toBeGreaterThanOrEqual(
              Date.parse(ordered[index - 1]!.endedAt!),
            );
          const originalRun = await latestSuccessfulRun(c, filter);
          const initialPrompt = baseline.prompts.saved[analysisRole] ?? "";
          expect(originalRun.promptSnapshot?.additionalPrompt).toBe(initialPrompt);
          let ownedModels: AIReqRemoteBootstrap["models"] | undefined;
          let ownedPrompts: AIReqRemoteBootstrap["prompts"] | undefined;
          try {
            const alternative = requireConfig(
              baseline.models.choices.find(
                (choice) => choice.id !== originalRun.modelConfig?.modelKey,
              ),
              "progress analysis requires another configured model",
            );
            const modelSettings = {
              ...baseline.models.settings,
              agents: baseline.models.settings.agents.map((agent) =>
                agent.id === analysisRole ? { ...agent, model: alternative.id } : agent,
              ),
            };
            const beforeModelSave = await history();
            await c.call("models.save", [modelSettings, baseline.models.revision]);
            const models = (await c.bootstrap()).models;
            expect(models.settings).toEqual(modelSettings);
            ownedModels = models;
            expect(await history()).toEqual(beforeModelSave);
            expect((await runManual(c, filter)).map((run) => run.status)).toEqual(["succeeded"]);
            const modelRun = await latestSuccessfulRun(c, filter);
            expect(modelRun.modelConfig).toMatchObject({
              role: analysisRole,
              modelKey: alternative.id,
              configurationRevision: models.revision,
            });
            expect(modelRun.promptSnapshot).toEqual(originalRun.promptSnapshot);
            expect(modelRun.report!.inputFingerprint).toBe(originalRun.report!.inputFingerprint);
            expect((await runManual(c, filter)).map((run) => run.status)).toEqual(["skipped"]);
            expect(await latestSuccessfulRun(c, filter)).toEqual(modelRun);

            const additionalPrompt = unique("分析报告应标明验收证据");
            const prompts = { ...baseline.prompts.saved, [analysisRole]: additionalPrompt };
            const beforePromptSave = await history();
            await c.call("prompts.save", [prompts, baseline.prompts.revision]);
            const saved = (await c.bootstrap()).prompts;
            expect(saved.saved).toEqual(prompts);
            ownedPrompts = saved;
            expect(await history()).toEqual(beforePromptSave);
            expect((await runManual(c, filter)).map((run) => run.status)).toEqual(["succeeded"]);
            const promptRun = await latestSuccessfulRun(c, filter);
            expect(promptRun.modelConfig).toMatchObject({
              modelKey: alternative.id,
              configurationRevision: models.revision,
            });
            expect(promptRun.promptSnapshot?.additionalPrompt).toBe(additionalPrompt);
            expect(promptRun.report!.inputFingerprint).toBe(originalRun.report!.inputFingerprint);
            const unrelatedRole = requireConfig(
              baseline.models.settings.agents.find((agent) => agent.id !== analysisRole)?.id,
              "analysis deduplication needs an unrelated Agent role",
            );
            const unrelatedPrompt = { ...prompts, [unrelatedRole]: unique("另一个 Agent 的指令") };
            await c.call("prompts.save", [unrelatedPrompt, saved.revision]);
            const afterNoChange = (await c.bootstrap()).prompts;
            expect(afterNoChange.saved).toEqual(unrelatedPrompt);
            ownedPrompts = afterNoChange;
            expect((await runManual(c, filter)).map((run) => run.status)).toEqual(["skipped"]);
            expect(await latestSuccessfulRun(c, filter)).toEqual(promptRun);
            expect(await c.call("progressScheduler.readRun", [originalRun.id])).toEqual(
              originalRun,
            );
            expect(await c.call("progressScheduler.readRun", [modelRun.id])).toEqual(modelRun);
            const projected = (await c.read(selection)).view.srs.find(
              (sr) => sr.projectId === ref.projectId && sr.irId === ref.irId && sr.id === ref.srId,
            );
            expect(projected?.progress?.inputFingerprint).toBe(promptRun.report!.inputFingerprint);
            expect(projected?.progress?.analysedAt).toBe(promptRun.report!.analysedAt);
          } finally {
            try {
              if (ownedPrompts) {
                const current = (await c.bootstrap()).prompts;
                expect(current.revision).toBe(ownedPrompts.revision);
                expect(current.saved).toEqual(ownedPrompts.saved);
                await c.call("prompts.save", [baseline.prompts.saved, current.revision]);
              }
            } finally {
              if (ownedModels) {
                const current = (await c.bootstrap()).models;
                expect(current).toMatchObject({
                  revision: ownedModels.revision,
                  settings: ownedModels.settings,
                });
                await c.call("models.save", [baseline.models.settings, current.revision]);
              }
            }
          }
        });
      } finally {
        await c.close();
      }
    },
  );

  preparations.test(
    "keeps merged tasks and history queryable but excludes them from manual batch and exact-SR analysis",
    { timeout: config.timeoutMs, meta: { stFormalPurpose: "schedulerMerged" } },
    async ({ task }) => {
      const c = await connectST();
      try {
        const { ref, sr, filter } = await schedulerResource(c, task.id);
        if (!sr.codeMerge || sr.testAcceptance)
          throw new Error(
            "[ST_BLOCKED] merged-task scenario requires a first merge awaiting acceptance",
          );
        expect(srProgress(sr)).toBe(99);
        const before = await c.call("progressScheduler.read", []);
        for (const pageSize of [25, 50]) {
          const page = await c.call("progressScheduler.queryTasks", [filter, 1, pageSize]);
          expect(page.page).toBe(1);
          expect(page.pageSize).toBe(pageSize);
          expect(page.total).toBe(1);
          expect(page.items).toHaveLength(1);
          expect(page.eligibleCount).toBe(0);
          expect(page.items[0]).toMatchObject({
            projectId: ref.projectId,
            irId: ref.irId,
            srId: sr.id,
            branch: sr.trackingBranch?.name ?? "",
            state: "completed",
            percent: 99,
          });
          expect(page.items[0]!.releaseId).toBe(ref.releaseId);
          expect(page.items[0]!.nextRunAt).toBeUndefined();
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
        expect(absent.eligibleCount).toBe(0);
        expect(await c.call("progressScheduler.readRun", [unique("missing-run")])).toBeNull();
        const after = await c.call("progressScheduler.read", []);
        // Querying is read-only. Do not assert global totals, which may change through legitimate background work.
        expect(after.enabled).toBe(before.enabled);
        expect(after.intervalMinutes).toBe(before.intervalMinutes);
        expect(projectSetting(after, ref.projectId)).toBe(projectSetting(before, ref.projectId));
        await withSchedulerSettings(c, ref.projectId, async (settings) => {
          await settings.configure(false, settings.intervalMinutes);
          await settings.setProjectEnabled(true);
          const scope = {
            projectId: filter.projectId,
            releaseId: filter.releaseId,
            irId: filter.irId,
          };
          const batch = await c.call("progressScheduler.queryTasks", [scope, 1, 25]);
          expect(batch.eligibleCount).toBe(0);
          const histories = await c.call("progressScheduler.queryRuns", [scope, 1, 50]);
          await c.call("progressScheduler.runNow", [scope]);
          await c.call("progressScheduler.runNow", [filter]);
          const latest = await c.call("progressScheduler.queryRuns", [scope, 1, 50]);
          expect(latest.total).toBe(histories.total);
          expect(latest.items.map((run) => run.id)).toEqual(histories.items.map((run) => run.id));
        });
      } finally {
        await c.close();
      }
    },
  );

  preparations.test(
    "uses actual automatic checks to honor the project switch and exclude already merged SRs",
    { timeout: 2 * automaticCheckTimeout, meta: { stFormalPurpose: "schedulerAutomatic" } },
    async ({ task }) => {
      const c = await connectST();
      try {
        const resource = await schedulerResource(c, task.id);
        requireUnmerged(resource);
        const { filter, ref, view } = resource;
        const merged = requireConfig(
          view.srs.find(
            (sr) => sr.projectId === ref.projectId && sr.irId === ref.irId && sr.codeMerge,
          ),
          "schedulerAutomatic needs a merged SR in the same formal IR as the unmerged target",
        );
        const mergedFilter = { ...filter, srId: merged.id };
        const read = () => c.call("progressScheduler.read", []);
        const history = (target: typeof filter) =>
          c.call("progressScheduler.queryRuns", [target, 1, 50]);
        await withSchedulerSettings(c, ref.projectId, async (settings) => {
          await settings.setProjectEnabled(false);
          const before = await waitUntil(
            "any analysis admitted before project pause finishes",
            () => history(filter),
            (page) => page.items.every((run) => run.status !== "running"),
          );
          const mergedBefore = await history(mergedFilter);
          await settings.configure(true, 1);
          const disabled = await read();
          expect(projectSetting(disabled, ref.projectId)).toBe(false);
          expect(
            (await c.call("progressScheduler.queryTasks", [filter, 1, 25])).eligibleCount,
          ).toBe(0);
          const checkedWhileDisabled = await waitUntil(
            "a real automatic check elapses while the project is disabled",
            read,
            (snapshot) =>
              Boolean(snapshot.lastCheckAt && snapshot.lastCheckAt !== disabled.lastCheckAt),
            automaticCheckTimeout,
          );
          expect(await history(filter)).toEqual(before);
          await settings.setProjectEnabled(true);
          const enabled = await read();
          expect(projectSetting(enabled, ref.projectId)).toBe(true);
          expect(
            (await c.call("progressScheduler.queryTasks", [filter, 1, 25])).eligibleCount,
          ).toBe(1);
          const mergedTasks = await c.call("progressScheduler.queryTasks", [mergedFilter, 1, 25]);
          expect(mergedTasks.eligibleCount).toBe(0);
          expect(mergedTasks.items[0]?.nextRunAt).toBeUndefined();
          const oldIds = new Set(before.items.map((run) => run.id));
          const scheduled = await waitUntil(
            "an enabled due SR completes a real automatically admitted analysis",
            async () => (await history(filter)).items.find((run) => !oldIds.has(run.id)),
            (run) => Boolean(run && run.status !== "running"),
            automaticCheckTimeout,
          );
          expect(scheduled).toMatchObject({
            projectId: ref.projectId,
            releaseId: ref.releaseId,
            irId: ref.irId,
            srId: ref.srId,
            trigger: "schedule",
          });
          expect(["succeeded", "skipped"]).toContain(scheduled!.status);
          const checkedWhileEnabled = await read();
          expect(checkedWhileEnabled.lastCheckAt).not.toBe(checkedWhileDisabled.lastCheckAt);
          const mergedAfter = await history(mergedFilter);
          expect(mergedAfter.total).toBe(mergedBefore.total);
          expect(mergedAfter.items.map((run) => run.id)).toEqual(
            mergedBefore.items.map((run) => run.id),
          );
        });
      } finally {
        await c.close();
      }
    },
  );

  // 由环境准备真实失败和外部合入时序；不能用测试代码碰撞原型后台时钟。
  if (config.fixtures.schedulerLateMerge !== undefined)
    preparations.test(
      "keeps results of analysis overtaken by first merge only in history and rejects another retry",
      { timeout: config.timeoutMs, meta: { stFormalPurpose: "schedulerLateMerge" } },
      async ({ task }) => {
        const c = await connectST();
        try {
          const resource = await schedulerResource(c, task.id);
          requireUnmerged(resource);
          const { ref, sr, filter, selection } = resource;
          const history = () => c.call("progressScheduler.queryRuns", [filter, 1, 50]);
          const { items } = await c.call("progressScheduler.queryRuns", [
            { ...filter, status: "failed" },
            1,
            25,
          ]);
          let failedRunId: string | undefined;
          for (const { id } of items) {
            if ((await c.call("progressScheduler.readRun", [id]))?.failure?.retryable) {
              failedRunId = id;
              break;
            }
          }
          if (!failedRunId)
            throw new Error("[ST_BLOCKED] schedulerLateMerge needs a retryable failure for its SR");
          await withSchedulerSettings(c, ref.projectId, async (settings) => {
            await settings.configure(false, settings.intervalMinutes);
            await settings.setProjectEnabled(true);
            const oldIds = new Set((await history()).items.map((run) => run.id));
            await c.call("progressScheduler.runNow", [filter, failedRunId]);
            const admitted = (await history()).items.find((run) => !oldIds.has(run.id));
            expect(admitted).toMatchObject({ status: "running", trigger: "manual", srId: sr.id });
            const running = await c.call("progressScheduler.readRun", [admitted!.id]);
            const merged = await waitUntil(
              "first merge is observed for the in-flight SR",
              async () =>
                (await c.read(selection)).view.srs.find(
                  (item) =>
                    item.projectId === ref.projectId && item.irId === ref.irId && item.id === sr.id,
                ),
              (item) => Boolean(item?.codeMerge),
            );
            const finished = await waitUntil(
              "the same execution completes after first merge",
              () => c.call("progressScheduler.readRun", [admitted!.id]),
              (report) => Boolean(report && report.status !== "running"),
            );
            expect(finished).toMatchObject({
              status: "skipped",
              modelConfig: running!.modelConfig,
              promptSnapshot: running!.promptSnapshot,
              report: expect.objectContaining({ stale: true }),
            });
            expect(Date.parse(finished!.endedAt!)).toBeGreaterThanOrEqual(
              Date.parse(merged!.codeMerge!.checkedAt),
            );
            const latest = (await c.read(selection)).view.srs.find(
              (item) =>
                item.projectId === ref.projectId && item.irId === ref.irId && item.id === sr.id,
            )!;
            expect(srProgress(latest)).toBe(99);
            expect(latest.progress?.analysedAt).toBe(sr.progress?.analysedAt);
            expect(latest.progress?.inputFingerprint).toBe(sr.progress?.inputFingerprint);
            expect(
              (await c.call("progressScheduler.queryTasks", [filter, 1, 25])).eligibleCount,
            ).toBe(0);
            const after = await history();
            await expect(
              c.call("progressScheduler.runNow", [filter, failedRunId]),
            ).rejects.toThrow();
            expect(await history()).toEqual(after);
          });
        } finally {
          await c.close();
        }
      },
    );

  preparations.test(
    "rejects invalid page/date/config values and leaves scheduler settings unchanged",
    { timeout: config.timeoutMs },
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
  );

  preparations.test(
    "new projects start disabled and their manual requests do not produce analysis runs",
    { timeout: config.timeoutMs },
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
  );
});
