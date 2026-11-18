import { businessRule } from "./errors.js";
import { createHash } from "node:crypto";
import { readPrototypeAgentPrompts } from "./personalization.js";
import { readPrototypeAgentModelBinding } from "./agent-models.js";
import type {
  AIReqAnalysisFailure,
  AIReqAnalysisFilter,
  AIReqAnalysisHistoryFilter,
  AIReqAnalysisRun,
  AIReqAnalysisRunSummary,
  AIReqAnalysisSnapshot,
  AIReqAnalysisTask,
  AIReqProgressScheduler,
} from "@zcode/services/aireq";
import type { AIReqProgressAnalysis, AIReqSystemRequirement } from "@zcode/services/aireq";
import { srProgress } from "@zcode/services/aireq";
import {
  acceptPrototypeProgressReport,
  initializePrototypeProgress,
  withPrototypeProgress,
} from "./progress.js";
import {
  prototypeAnalysisReport,
  prototypeProgressFingerprint,
} from "./progress-scheduler-state.js";
import { readPrototypeProjectSettings } from "./project-settings.js";
import { getPrototypeWorkflow, prototypeWorkflowChanges } from "./workflow.js";

interface Input {
  sr: AIReqSystemRequirement;
  releaseId?: string;
  defaultVersion?: string;
  fingerprint: string;
}
interface Pending {
  run: AIReqAnalysisRun;
  input: Input;
  held?: boolean;
  fail?: boolean;
}
interface ScaleInput {
  input: Input;
  irTitle: string;
}

const failureSamples: AIReqAnalysisFailure[] = [
  {
    stage: "仓库读取",
    reason: "无法读取所选分支的代码。",
    nextStep: "请检查仓库地址、分支与读取权限后重试。",
    retryable: true,
  },
  {
    stage: "模型调用",
    reason: "模型请求超时，尚未生成分析结论。",
    nextStep: "请检查需求分析 Agent 的模型配置与服务状态后重试。",
    retryable: true,
  },
  {
    stage: "文档读取",
    reason: "当前 SR 的需求文档未能读取，分析依据不完整。",
    nextStep: "请检查 SR 文档路径、文件是否存在及读取权限后重试。",
    retryable: true,
  },
];
function failureMessage(failure: AIReqAnalysisFailure): string {
  return `${failure.stage}失败：${failure.reason}`;
}

/** Service-lifetime memory scheduler; accepted reports write to the existing workflow owner. */
export function createPrototypeProgressScheduler(
  options: { scaleDemo?: boolean } = {},
): AIReqProgressScheduler & { tick(): void } {
  initializePrototypeProgress();
  const scaleDemo = options.scaleDemo === true;
  let clock = Date.now();
  let enabled = true;
  let intervalMinutes = 60;
  let nextCheck = clock + intervalMinutes * 60_000;
  let lastCheckAt: string | undefined;
  let serial = 0;
  let disposed = false;
  const projects = new Map<string, boolean>();
  const tasks = new Map<string, AIReqAnalysisTask>();
  const inputs = new Map<string, Input>();
  // Scheduler-only additions: never inserted into the formal workflow or its requirements UI.
  const scaleInputs = new Map<string, ScaleInput>();
  const analysed = new Map<string, string>();
  const pending = new Map<string, Pending>();
  const scenarios = new Map<string, "fail-next" | "hold-next">();
  const runs: AIReqAnalysisRun[] = [];
  const listeners = new Set<() => void>();
  const at = () => new Date(clock).toISOString();
  const requireTime = (value: number) => {
    if (!Number.isFinite(new Date(value).getTime()))
      throw businessRule("分析间隔过大，请使用更小的正整数分钟数。");
    return value;
  };
  const nextAt = () => new Date(clock + intervalMinutes * 60_000).toISOString();
  const active = (task: AIReqAnalysisTask) =>
    projects.get(task.projectId) === true &&
    inputs.has(task.id) &&
    task.percent < 100 &&
    Boolean(task.branch.trim()) &&
    inputs.get(task.id)?.sr.trackingBranch?.status !== "failed";
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const requireActive = () => {
    if (disposed) throw businessRule("需求分析服务已关闭，请刷新页面后重试。");
  };
  const matches = (
    row: { projectId: string; releaseId?: string; irId: string; srId: string; srTitle: string },
    filter: AIReqAnalysisFilter,
  ) => {
    const search = filter.srSearch?.trim().toLowerCase();
    return (
      (!filter.projectId || row.projectId === filter.projectId) &&
      (!filter.releaseId ||
        (row.releaseId ??
          inputs.get(JSON.stringify([row.projectId, row.irId, row.srId]))?.releaseId) ===
          filter.releaseId) &&
      (!filter.irId || row.irId === filter.irId) &&
      (!filter.srId || row.srId === filter.srId) &&
      (!search ||
        row.srId.toLowerCase().includes(search) ||
        row.srTitle.toLowerCase().includes(search))
    );
  };
  const pageBounds = (total: number, requestedPage: number, requestedSize: number) => {
    if (
      ![25, 50].includes(requestedSize) ||
      !Number.isSafeInteger(requestedPage) ||
      requestedPage < 1
    )
      throw businessRule("分页参数无效。");
    const pageSize = requestedSize;
    const page = Math.min(
      Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1),
      Math.max(1, Math.ceil(total / pageSize)),
    );
    return { page, pageSize, start: (page - 1) * pageSize };
  };
  const matchesState = (task: AIReqAnalysisTask, filter: AIReqAnalysisFilter) =>
    !filter.taskState || task.state === filter.taskState;
  const newestFirst = (a: AIReqAnalysisRunSummary, b: AIReqAnalysisRunSummary) =>
    b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id);
  const summary = (run: AIReqAnalysisRun): AIReqAnalysisRunSummary => ({
    id: run.id,
    batchId: run.batchId,
    taskId: run.taskId,
    projectId: run.projectId,
    releaseId: run.releaseId,
    irId: run.irId,
    srId: run.srId,
    srTitle: run.srTitle,
    branch: run.branch,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    message: run.message,
    before: run.before,
    after: run.after,
  });

  function branchFor(sr: AIReqSystemRequirement): string {
    return sr.trackingBranch?.name?.trim() ?? "";
  }
  function promptSnapshot() {
    const additionalPrompt = readPrototypeAgentPrompts().saved["progress-analysis"] ?? "";
    return {
      additionalPrompt,
      revision: createHash("sha256").update(additionalPrompt).digest("hex"),
    };
  }

  function putInput(input: Input, irTitle: string): void {
    const sr = input.sr;
    const id = JSON.stringify([sr.projectId, sr.irId, sr.id]);
    const branch = branchFor(sr);
    inputs.set(id, input);
    let task = tasks.get(id);
    if (!task) {
      task = {
        id,
        projectId: sr.projectId,
        releaseId: input.releaseId,
        irId: sr.irId,
        irTitle,
        srId: sr.id,
        srTitle: sr.title,
        branch,
        state: "waiting",
        percent: 0,
      };
      tasks.set(id, task);
    }
    Object.assign(task, {
      irTitle,
      srTitle: sr.title,
      percent: srProgress(sr),
      branch,
      releaseId: input.releaseId,
    });
    if (!branch || sr.trackingBranch?.status === "failed")
      task.error = sr.trackingBranch?.error ?? "开发分支缺失，不能分析。";
    else if (task.error) {
      // 分支错误来自当前分支事实；恢复后只保留最近分析运行自身的失败，不能沿用旧分支错误。
      const lastRun = runs.find((run) => run.id === task.lastRunId);
      task.error = lastRun?.status === "failed" ? lastRun.message : undefined;
    }
  }

  function reconcile(): void {
    const candidates: { input: Input; irTitle: string }[] = [];
    for (const project of readPrototypeProjectSettings().projects) {
      const view = withPrototypeProgress(getPrototypeWorkflow({ projectId: project.id }));
      for (const group of view.groups) {
        for (const sr of view.srs.filter(
          (item) => item.irId === group.id && group.srIds.includes(item.id),
        )) {
          const fingerprint = prototypeProgressFingerprint(view, group, sr);
          candidates.push({
            input: {
              sr,
              fingerprint,
              releaseId: group.releaseId,
              defaultVersion: view.repositoryHeads?.[project.repositoryId],
            },
            irTitle: group.title,
          });
        }
      }
    }
    candidates.push(...scaleInputs.values());
    inputs.clear();
    for (const { input, irTitle } of candidates) putInput(input, irTitle);
    for (const project of readPrototypeProjectSettings().projects)
      if (!projects.has(project.id)) projects.set(project.id, false);
    for (const task of tasks.values()) {
      if (pending.has(task.id)) {
        task.state = "running";
        task.nextRunAt = undefined;
        continue;
      }
      if (inputs.has(task.id) && task.percent >= 100) {
        task.state = "completed";
        task.nextRunAt = undefined;
        task.error = undefined;
      } else if (!enabled || !active(task)) {
        task.state = "paused";
        task.nextRunAt = undefined;
      } else {
        task.state = task.error ? "failed" : "waiting";
        task.nextRunAt ??= nextAt();
      }
    }
  }

  function report(input: Input): AIReqProgressAnalysis {
    return prototypeAnalysisReport(input.sr, input.fingerprint, at(), input.defaultVersion);
  }

  function admit(filter: AIReqAnalysisFilter, trigger: AIReqAnalysisRun["trigger"]): void {
    const modelConfig = readPrototypeAgentModelBinding("progress-analysis");
    const prompt = promptSnapshot();
    const batchId = `memory-demo-batch-${++serial}`;
    for (const task of tasks.values()) {
      if (
        !active(task) ||
        pending.has(task.id) ||
        !matches(task, filter) ||
        !matchesState(task, filter)
      )
        continue;
      if (
        trigger === "schedule" &&
        (!enabled || (task.nextRunAt && Date.parse(task.nextRunAt) > clock))
      )
        continue;
      const run: AIReqAnalysisRun = {
        id: `memory-demo-run-${++serial}`,
        batchId,
        taskId: task.id,
        projectId: task.projectId,
        releaseId: task.releaseId,
        irId: task.irId,
        srId: task.srId,
        srTitle: task.srTitle,
        branch: task.branch,
        trigger,
        status: "running",
        startedAt: at(),
        modelConfig: structuredClone(modelConfig),
        promptSnapshot: { ...prompt },
        message: "正在分析需求材料、任务及代码合入证据。",
        before: task.percent,
        after: task.percent,
      };
      runs.push(run);
      const scenario = scenarios.get(task.id);
      scenarios.delete(task.id);
      pending.set(task.id, {
        run,
        input: structuredClone(inputs.get(task.id)!),
        held: scenario === "hold-next",
        fail: scenario === "fail-next",
      });
      task.state = "running";
      task.error = undefined;
      task.nextRunAt = undefined;
      task.lastRunAt = at();
      task.lastRunId = run.id;
    }
  }

  reconcile();
  const initialProjects = readPrototypeProjectSettings().projects;
  if (scaleDemo) {
    // Pad each of the two initial projects to 150 records, retaining every real formal-SR record.
    for (const project of initialProjects.slice(0, 2)) {
      const existingCount = [...tasks.values()].filter(
        (task) => task.projectId === project.id,
      ).length;
      for (let index = 1; index <= 150 - existingCount; index++) {
        const suffix = String(index).padStart(3, "0");
        const irIndex = Math.floor((index - 1) / 50) + 1;
        const srId = `scale-${project.id}-sr-${suffix}`;
        const irId = `scale-${project.id}-ir-${irIndex}`;
        const percent = index % 10 === 0 ? 100 : index % 100;
        const sr: AIReqSystemRequirement = {
          id: srId,
          projectId: project.id,
          irId,
          title: `系统需求 ${suffix} · ${project.name}`,
          documentPath: `memory-scale/${srId}.md`,
          status: percent === 100 ? "completed" : "pending",
          round: 0,
          sessions: [],
          approvals: [],
          materials: [],
          ...(percent === 100
            ? {
                codeMerge: {
                  commit: `memory-scale-code-${srId}`,
                  branch: project.defaultBranch,
                  checkedAt: at(),
                  files: [],
                },
                testAcceptance: {
                  operationId: `memory-scale-test-${srId}`,
                  outcome: "passed" as const,
                  employeeId: "j00808874",
                  at: at(),
                  reason: "规模模拟样例人工测试通过",
                  codeVersion: `memory-scale-code-${srId}`,
                },
              }
            : {}),
          trackingBranch: {
            name: `sr/${srId}`,
            baseCommit: "memory-scale-base",
            createdAt: at(),
            pushedAt: at(),
          },
          progress: {
            percent,
            merged: percent === 100,
            certain: false,
            branch: `sr/${srId}`,
            analysedAt: at(),
            codeVersion: "未记录",
            defaultVersion: "未记录",
            implemented: [],
            remaining: [],
            issues: [],
            activity: [],
            ...(percent === 100
              ? {
                  manual: {
                    employeeId: "j00808874",
                    reason: "AI 分析到 99% 后人工确认完成（样例）。",
                    at: at(),
                  },
                }
              : {}),
          },
        };
        const input = { sr, fingerprint: `memory-scale-input:${project.id}:${srId}:1` };
        scaleInputs.set(JSON.stringify([project.id, irId, srId]), {
          input,
          irTitle: `需求 ${irIndex} · ${project.name}`,
        });
      }
    }
    if (initialProjects[0]) projects.set(initialProjects[0].id, true);
  } else if (projects.has("demo-aurora")) projects.set("demo-aurora", true);
  reconcile();

  if (scaleDemo) {
    const fixtureTasks = [...tasks.values()];
    for (let index = 0; index < 1000; index++) {
      const task = fixtureTasks[index % fixtureTasks.length]!;
      const input = inputs.get(task.id)!;
      const status = index < 300 ? "succeeded" : index < 600 || index >= 900 ? "failed" : "skipped";
      const timestamp = new Date(clock - Math.ceil((1000 - index) / 2) * 3_600_000).toISOString();
      const detail = report(input);
      detail.analysedAt = timestamp;
      const failure =
        status === "failed" ? failureSamples[index % failureSamples.length]! : undefined;
      const message = failure
        ? failureMessage(failure)
        : status === "skipped"
          ? "需求与代码未发生变化，已跳过重复分析。"
          : "分析完成，当前进度未发生变化。";
      runs.push({
        id: `memory-scale-run-${String(index + 1).padStart(4, "0")}`,
        batchId: `memory-scale-batch-${Math.floor(index / 25) + 1}`,
        taskId: task.id,
        projectId: task.projectId,
        irId: task.irId,
        srId: task.srId,
        srTitle: task.srTitle,
        branch: task.branch,
        trigger: index % 2 ? "manual" : "schedule",
        modelConfig: readPrototypeAgentModelBinding("progress-analysis"),
        promptSnapshot: promptSnapshot(),
        status,
        startedAt: timestamp,
        endedAt: timestamp,
        message,
        before: task.percent,
        after: task.percent,
        report: status === "succeeded" ? detail : undefined,
        failure,
      });
      task.lastRunAt = timestamp;
      task.lastRunId = `memory-scale-run-${String(index + 1).padStart(4, "0")}`;
      if (status === "failed") {
        task.error = message;
        analysed.delete(task.id);
      } else {
        task.error = undefined;
        analysed.set(task.id, input.fingerprint);
      }
    }
    reconcile();
  } else {
    // Compact historical simulations use the same report admission path as later runs.
    for (const [projectId, srId, status] of [
      ["demo-aurora", "sr-auth", "succeeded"],
      ["demo-aurora", "sr-session", "skipped"],
      ["demo-aurora", "sr-permissions", "failed"],
      ["demo-mobile", "sr-mobile-navigation", "succeeded"],
      ["demo-mobile", "sr-mobile-notifications", "skipped"],
    ] as const) {
      const task = [...tasks.values()].find(
        (item) => item.projectId === projectId && item.srId === srId,
      );
      if (!task || task.percent >= 100) continue;
      const input = inputs.get(task.id)!;
      const timestamp = new Date(clock - 60_000).toISOString();
      const message =
        status === "succeeded"
          ? "分析完成，当前进度未发生变化。"
          : status === "skipped"
            ? "需求与代码未发生变化，已跳过重复分析。"
            : failureMessage(failureSamples[2]!);
      const fixtureReport =
        status === "succeeded" ? { ...report(input), analysedAt: timestamp } : undefined;
      if (fixtureReport)
        acceptPrototypeProgressReport(
          task.projectId,
          task.irId,
          srId,
          input.fingerprint,
          prototypeProgressFingerprint,
          fixtureReport,
        );
      if (status === "failed")
        acceptPrototypeProgressReport(
          task.projectId,
          task.irId,
          srId,
          input.fingerprint,
          prototypeProgressFingerprint,
          undefined,
          message,
        );
      runs.push({
        id: `memory-demo-fixture-${srId}`,
        batchId: "memory-demo-fixtures",
        taskId: task.id,
        projectId: task.projectId,
        releaseId: task.releaseId,
        irId: task.irId,
        srId,
        srTitle: task.srTitle,
        branch: task.branch,
        trigger: "schedule",
        status,
        startedAt: timestamp,
        endedAt: timestamp,
        modelConfig: readPrototypeAgentModelBinding("progress-analysis"),
        promptSnapshot: promptSnapshot(),
        message,
        before: task.percent,
        // 样例成功也须记录实际写回值，不能把执行前分数复制为执行后分数。
        after: fixtureReport?.percent ?? task.percent,
        report: fixtureReport,
        failure: status === "failed" ? failureSamples[2] : undefined,
      });
      task.lastRunAt = timestamp;
      task.lastRunId = `memory-demo-fixture-${srId}`;
      if (status !== "failed") analysed.set(task.id, input.fingerprint);
      else {
        task.error = message;
        task.state = "failed";
      }
      if (status === "failed") {
        for (const [index, failure] of failureSamples.slice(0, 2).entries()) {
          const earlier = new Date(clock - (3 - index) * 60_000).toISOString();
          runs.push({
            id: `memory-demo-fixture-${srId}-${index}`,
            batchId: "memory-demo-fixtures",
            taskId: task.id,
            projectId: task.projectId,
            releaseId: task.releaseId,
            irId: task.irId,
            srId,
            srTitle: task.srTitle,
            branch: task.branch,
            trigger: "schedule",
            status: "failed",
            startedAt: earlier,
            endedAt: earlier,
            modelConfig: readPrototypeAgentModelBinding("progress-analysis"),
            promptSnapshot: promptSnapshot(),
            message: failureMessage(failure),
            before: task.percent,
            after: task.percent,
            failure,
          });
        }
      }
    }
    // 初始化写回报告发生在订阅安装前；首次查询也必须从同一 owner 收敛任务进度。
    reconcile();
  }
  const subscription = prototypeWorkflowChanges.event(() => {
    reconcile();
    emit();
  });

  const advanceTo = (nextClock: number) => {
    requireActive();
    reconcile();
    requireTime(nextClock + intervalMinutes * 60_000);
    clock = nextClock;
    for (const [id, pendingRun] of pending) {
      if (pendingRun.held) continue;
      const { run, input } = pendingRun;
      const task = tasks.get(id)!;
      run.endedAt = at();
      const current = inputs.get(id);
      if (!current || current.fingerprint !== input.fingerprint) {
        run.status = "skipped";
        run.message = "需求材料或代码版本已变化，本次结果未采用。";
      } else if (pendingRun.fail) {
        run.status = "failed";
        run.failure = failureSamples[1];
        run.message = failureMessage(failureSamples[1]!);
        task.error = run.message;
        analysed.delete(id);
        acceptPrototypeProgressReport(
          run.projectId,
          run.irId,
          run.srId,
          input.fingerprint,
          prototypeProgressFingerprint,
          undefined,
          run.message,
        );
      } else if (analysed.get(id) === input.fingerprint) {
        run.status = "skipped";
        run.report = structuredClone(current.sr.progress);
        run.message = "任务材料与代码版本未变化，已跳过重复分析。";
      } else {
        const detail = report(input);
        const scale = scaleInputs.get(id);
        const accepted = scale
          ? true
          : acceptPrototypeProgressReport(
              run.projectId,
              run.irId,
              run.srId,
              input.fingerprint,
              prototypeProgressFingerprint,
              detail,
            );
        run.status = accepted ? "succeeded" : "skipped";
        run.message = accepted
          ? "分析完成，最新报告已更新。"
          : "输入版本已变化，迟到结果已拒绝写回。";
        if (accepted) {
          if (scale) scale.input.sr.progress = detail;
          run.report = detail;
          analysed.set(id, input.fingerprint);
          task.error = undefined;
        }
      }
      const latest = withPrototypeProgress(
        getPrototypeWorkflow({ projectId: run.projectId }),
      ).srs.find((sr) => sr.irId === run.irId && sr.id === run.srId);
      run.after = latest ? srProgress(latest) : task.percent;
      if (run.report && latest?.progress) run.report = structuredClone(latest.progress);
      task.nextRunAt = nextAt();
      pending.delete(id);
    }
    if (enabled && clock >= nextCheck) {
      lastCheckAt = at();
      nextCheck = clock + intervalMinutes * 60_000;
      admit({}, "schedule");
    }
    reconcile();
    emit();
  };

  return {
    read(): AIReqAnalysisSnapshot {
      const projectSummaries = readPrototypeProjectSettings().projects.map((project) => ({
        id: project.id,
        name: project.name,
        enabled: projects.get(project.id) ?? false,
        pendingCount: 0,
        runningCount: 0,
        lastRunAt: undefined as string | undefined,
        lastStatus: undefined as AIReqAnalysisRunSummary["status"] | undefined,
      }));
      const byProject = new Map(projectSummaries.map((project) => [project.id, project]));
      const irs = new Map<
        string,
        { projectId: string; releaseId?: string; id: string; title: string }
      >();
      for (const task of tasks.values()) {
        const project = byProject.get(task.projectId);
        if (project) {
          if (pending.has(task.id)) project.runningCount++;
          else if (active(task)) project.pendingCount++;
        }
        irs.set(JSON.stringify([task.projectId, task.irId]), {
          projectId: task.projectId,
          releaseId: task.releaseId,
          id: task.irId,
          title: task.irTitle,
        });
      }
      const latest = new Map<string, AIReqAnalysisRun>();
      for (const run of runs) {
        const previous = latest.get(run.projectId);
        if (!previous || newestFirst(run, previous) < 0) latest.set(run.projectId, run);
      }
      for (const project of projectSummaries) {
        const run = latest.get(project.id);
        project.lastRunAt = run?.startedAt;
        project.lastStatus = run?.status;
      }
      return {
        enabled,
        intervalMinutes,
        currentTime: at(),
        lastCheckAt,
        nextCheckAt: enabled ? new Date(nextCheck).toISOString() : undefined,
        projects: projectSummaries,
        irs: [...irs.values()],
        tasksTotal: tasks.size,
        runsTotal: runs.length,
      };
    },
    queryTasks(filter, requestedPage, requestedSize) {
      const scoped = [...tasks.values()].filter((task) => matches(task, filter));
      const matching = scoped.filter((task) => matchesState(task, filter));
      const bounds = pageBounds(matching.length, requestedPage, requestedSize);
      return {
        items: structuredClone(matching.slice(bounds.start, bounds.start + bounds.pageSize)),
        total: matching.length,
        failedCount: scoped.filter((task) => task.state === "failed").length,
        page: bounds.page,
        pageSize: bounds.pageSize,
        eligibleCount: matching.reduce(
          (count, task) => count + Number(active(task) && !pending.has(task.id)),
          0,
        ),
      };
    },
    queryRuns(filter: AIReqAnalysisHistoryFilter, requestedPage, requestedSize) {
      const since = filter.since ? Date.parse(filter.since) : undefined;
      const until = filter.until ? Date.parse(filter.until) : undefined;
      if (
        (since !== undefined && !Number.isFinite(since)) ||
        (until !== undefined && !Number.isFinite(until))
      )
        throw businessRule("历史查询日期无效。");
      if (since !== undefined && until !== undefined && since > until)
        throw businessRule("结束时间必须晚于开始时间。");
      const matching = runs
        .filter(
          (run) =>
            matches(run, filter) &&
            (!filter.status || run.status === filter.status) &&
            (since === undefined || Date.parse(run.startedAt) >= since) &&
            (until === undefined || Date.parse(run.startedAt) <= until),
        )
        .sort(newestFirst);
      const bounds = pageBounds(matching.length, requestedPage, requestedSize);
      return {
        items: matching.slice(bounds.start, bounds.start + bounds.pageSize).map(summary),
        total: matching.length,
        page: bounds.page,
        pageSize: bounds.pageSize,
      };
    },
    readRun(id) {
      const run = runs.find((item) => item.id === id);
      return run ? structuredClone(run) : undefined;
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setProjectEnabled(projectId, value) {
      requireActive();
      if (!readPrototypeProjectSettings().projects.some((project) => project.id === projectId))
        throw businessRule("请选择已有项目。");
      if (typeof value !== "boolean") throw businessRule("项目分析开关无效。");
      reconcile();
      projects.set(projectId, value);
      reconcile();
      emit();
    },
    configure(value, minutes) {
      requireActive();
      if (typeof value !== "boolean") throw businessRule("全局分析开关无效。");
      if (!Number.isSafeInteger(minutes) || minutes < 1)
        throw businessRule("全局检查间隔须为正整数分钟。");
      const next = requireTime(clock + minutes * 60_000);
      reconcile();
      enabled = value;
      intervalMinutes = minutes;
      nextCheck = next;
      for (const task of tasks.values()) task.nextRunAt = undefined;
      reconcile();
      emit();
    },
    runNow(filter) {
      requireActive();
      reconcile();
      admit(filter, "manual");
      emit();
    },
    // 后台只按真实经过时间推进；不能因存在暂缓项而每五秒跳到下一小时。
    tick() {
      requireActive();
      const now = Math.max(clock, Date.now());
      let runnable = false;
      for (const item of pending.values()) if (!item.held) runnable = true;
      if (runnable || (enabled && now >= nextCheck)) advanceTo(now);
      else clock = now;
    },
    // Resource cleanup is not a settings write: read-only visitors must also be able to unmount.
    dispose() {
      if (disposed) return;
      disposed = true;
      subscription.dispose();
      listeners.clear();
      pending.clear();
    },
  };
}
