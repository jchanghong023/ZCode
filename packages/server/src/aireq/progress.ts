import { businessRule } from "./errors.js";
import type { InternalSystemRequirement, AIReqCodeMergeInput } from "./internal-scenarios.js";
import { digestValue } from "./content-digest.js";
import { srCompletionBlocker, srProgress } from "@zcode/services/aireq";
import type {
  AIReqBranchCleanupInput,
  AIReqBranchCleanupItem,
  AIReqProgressAnalysis,
  AIReqRequirementGroup,
  AIReqSystemRequirement,
  AIReqTestAcceptanceInput,
  AIReqVersionedProgressInput,
  AIReqWorkflowView,
} from "@zcode/services/aireq";
import { currentIdentity, getEmployeeId, isEmployeeId } from "./identity.js";
import { prototypeDefaultCommit } from "./fixture-builders.js";
import { getPrototypeWorkflow, mutatePrototypeWorkflow } from "./workflow.js";

const samples: Record<string, { percent: number; merged?: boolean; certain?: boolean }> = {
  "sr-auth": { percent: 72 },
  "sr-session": { percent: 99, certain: true },
  "sr-permissions": { percent: 35 },
  "sr-onboarding": { percent: 100, merged: true, certain: true },
  "sr-export": { percent: 99, merged: true, certain: true },
  "sr-export-download": { percent: 99, merged: true, certain: true },
  "sr-notification-inbox": { percent: 100, merged: true, certain: true },
  "sr-audit-retention": { percent: 100, merged: true, certain: true },
  "sr-mobile-navigation": { percent: 60 },
  "sr-mobile-notifications": { percent: 99, merged: true, certain: true },
  "sr-mobile-profile": { percent: 100, merged: true, certain: true },
};

/** 启动时一次迁入唯一 owner；读投影不维护报告缓存或第二份可写事实。 */
export function initializePrototypeProgress(): void {
  mutatePrototypeWorkflow((state) => {
    const seeded = withPrototypeProgress(state);
    let changed = false;
    for (let index = 0; index < state.srs.length; index++) {
      const sr = state.srs[index]!;
      const progress = seeded.srs[index]?.progress;
      if (!sr.progress && progress) {
        sr.progress = progress;
        changed = true;
      }
    }
    return changed;
  }, false);
}

/** 固定的代码证据样例；不调用模型，不查询远程仓库，不推断真实开发结果。 */
export function withPrototypeProgress(view: AIReqWorkflowView): AIReqWorkflowView;
export function withPrototypeProgress(
  view: Pick<AIReqWorkflowView, "groups" | "drafts" | "srs" | "releases" | "repositoryHeads">,
): Pick<AIReqWorkflowView, "groups" | "drafts" | "srs" | "releases" | "repositoryHeads">;
export function withPrototypeProgress(
  view: Pick<AIReqWorkflowView, "groups" | "drafts" | "srs" | "releases" | "repositoryHeads">,
): Pick<AIReqWorkflowView, "groups" | "drafts" | "srs" | "releases" | "repositoryHeads"> {
  const formal = view.groups;
  return {
    ...view,
    groups: view.groups,
    drafts: view.drafts,
    srs: view.srs.map((sr) => {
      if (
        !formal.some(
          (group) =>
            group.projectId === sr.projectId && group.id === sr.irId && group.srIds.includes(sr.id),
        )
      )
        return sr;
      let progress = sr.progress;
      if (!progress) {
        const sampleProject = sr.id.startsWith("sr-mobile-") ? "demo-mobile" : "demo-aurora";
        const sample = sr.projectId === sampleProject ? samples[sr.id] : undefined;
        if (!sample) return sr;
        const analysedAt = "2026-11-11T01:30:00.000Z";
        progress = {
          ...(sample.percent === 100
            ? {
                manual: {
                  employeeId: "j00808874",
                  reason: "代码已合入，人工测试验收通过。",
                  at: analysedAt,
                },
              }
            : {}),
          percent: sample.percent,
          aiPercent: Math.min(99, sample.percent),
          merged: sample.merged ?? false,
          certain: sample.certain ?? false,
          branch: sr.trackingBranch?.name ?? "",
          analysedAt,
          codeVersion: `${sr.id}-head`,
          defaultVersion: "main-20261111",
          implemented: sample.percent > 0 ? [`${sr.title}：已覆盖主要处理路径。`] : [],
          remaining:
            sample.percent === 100 || sample.certain
              ? []
              : sample.percent === 0
                ? ["尚无独立开发提交，等待开发者推送指定 SR 分支。"]
                : ["异常路径及部分验收行为仍缺少充分代码或测试证据。"],
          issues:
            sample.percent === 100
              ? []
              : sample.percent === 0
                ? [{ title: "尚未开始开发", detail: "当前没有可用于判断实现的新增提交证据。" }]
                : sample.certain
                  ? [
                      {
                        // 同版合入样例的原始报告不能再声称尚未合入；运行后的历史报告不重写。
                        title: sample.merged ? "等待人工测试验收" : "等待合入默认分支",
                        detail: sample.merged
                          ? "代码已合入；有效进度固定 99%，等待人工记录本版本测试结果。"
                          : "分支实现审查已通过；尚未合入，进度最高 99%。",
                      },
                    ]
                  : [
                      {
                        title: "验收证据待补充",
                        detail: "需关注失败恢复和边界行为；当前证据不足以确认全部完成。",
                      },
                    ],
          activity:
            sample.percent > 0
              ? [
                  {
                    commit: `${sr.id}-head`,
                    message: `${sr.title}：最新代码活动`,
                    at: "2026-11-11T01:00:00.000Z",
                  },
                ]
              : [],
        };
      }
      const projected = { ...sr, progress: structuredClone(progress) };
      projected.progress.percent = srProgress(projected);
      if (
        projected.progress.inputFingerprint &&
        (projected.progress.defaultVersion !== prototypeDefaultCommit(view, sr.projectId) ||
          (sr.codeMerge && projected.progress.codeVersion !== sr.codeMerge.commit))
      )
        projected.progress.stale = true;
      return projected;
    }),
  };
}
export function operatePrototypeProgress(
  projectId: string,
  irId: string,
  srId: string | undefined,
  input: AIReqVersionedProgressInput,
  type: string,
  payload: unknown,
  change: (
    state: AIReqWorkflowView,
    group: AIReqRequirementGroup,
    sr: AIReqSystemRequirement | undefined,
    employeeId: string,
    at: string,
  ) => void,
): void {
  const employeeId = getEmployeeId();
  if (!isEmployeeId(employeeId)) throw businessRule("请先登录有效工号。");
  if (
    !input ||
    typeof input.operationId !== "string" ||
    !input.operationId.trim() ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    throw businessRule("操作标识或预期版本无效。");
  const identity = currentIdentity();
  // CAS 版本只约束首次接纳，不能让重读后的同一请求变成不同业务内容。
  const businessPayload =
    payload && typeof payload === "object" ? { ...payload, expectedRevision: undefined } : payload;
  const digest = digestValue([type, projectId, irId, srId, businessPayload, identity]);
  mutatePrototypeWorkflow((state) => {
    const previous = state.operations.find(
      (item) =>
        item.operationId === input.operationId &&
        item.identity?.employeeId === identity?.employeeId &&
        item.identity?.clientId === identity?.clientId,
    );
    if (previous) {
      if (previous.commandDigest !== digest) throw businessRule("同一操作标识不能提交不同内容。");
      return false;
    }
    if (state.revision !== input.expectedRevision)
      throw businessRule("业务版本已变化，请刷新后重试。");
    const group = state.groups.find((item) => item.projectId === projectId && item.id === irId);
    const sr = srId
      ? state.srs.find(
          (item) =>
            item.projectId === projectId &&
            item.irId === irId &&
            item.id === srId &&
            group?.srIds.includes(item.id),
        )
      : undefined;
    if (!group || (srId && !sr)) throw businessRule("正式 IR/SR 不存在或不属于当前项目。");
    const at = new Date().toISOString();
    // 样例报告也先归入同一 SR；后续分析、验收均只更新 workflow 内的报告事实。
    if (sr && !sr.progress) {
      sr.progress = withPrototypeProgress({
        ...state,
        groups: [group],
        srs: [sr],
      }).srs[0]?.progress;
    }
    change(state, group, sr, employeeId, at);
    state.operations.push({
      operationId: input.operationId,
      identity: identity ? { ...identity } : undefined,
      commandDigest: digest,
      type,
      status: "completed",
      startedAt: at,
      completedAt: at,
      revision: state.revision + 1,
      irId,
      srId,
      steps: [
        { name: type, at, detail: `${employeeId} · ${projectId}/${irId}${srId ? `/${srId}` : ""}` },
      ],
    });
  });
}

export async function recordPrototypeSrTest(
  projectId: string,
  irId: string,
  srId: string,
  input: AIReqTestAcceptanceInput,
): Promise<void> {
  operatePrototypeProgress(
    projectId,
    irId,
    srId,
    input,
    "recordSrTest",
    input,
    (_state, _group, target, employeeId, at) => {
      const sr = target!;
      if (input.outcome !== "passed" && input.outcome !== "failed")
        throw businessRule("请选择测试通过或不通过。");
      if (typeof input.reason !== "string" || !input.reason.trim())
        throw businessRule("请填写本次测试的验收依据或问题。");
      const version = sr.codeMerge?.commit;
      if (!version || input.expectedCodeVersion !== version)
        throw businessRule("已合入代码版本已变化，请基于新版本重新测试。");
      const blocker = srCompletionBlocker(sr);
      if (blocker) throw businessRule(blocker);
      const acceptance = {
        operationId: input.operationId,
        outcome: input.outcome,
        employeeId,
        at,
        reason: input.reason.trim(),
        codeVersion: version,
      };
      sr.testAcceptance = acceptance;
      sr.acceptanceHistory = [...(sr.acceptanceHistory ?? []), acceptance];
      if (input.outcome === "failed") {
        sr.developmentIssues = [
          ...(sr.developmentIssues ?? []),
          {
            id: `test-issue-${input.operationId}`,
            detail: acceptance.reason,
            failedCodeVersion: version,
            reportedBy: employeeId,
            reportedAt: at,
            status: "open",
          },
        ];
      } else {
        for (const issue of sr.developmentIssues ?? []) {
          if (issue.status === "awaiting-retest") {
            if (issue.fixCodeVersion !== version || issue.failedCodeVersion === version)
              throw businessRule("问题修复版本不匹配，不能确认通过。");
            issue.status = "resolved";
            issue.resolvedAt = at;
          }
        }
      }
      if (sr.progress) {
        sr.progress.percent = input.outcome === "passed" ? 100 : 99;
        sr.progress.manual =
          input.outcome === "passed" ? { employeeId, reason: acceptance.reason, at } : undefined;
      }
      sr.status = input.outcome === "passed" ? "completed" : "developing";
    },
  );
}

/** 内存 Git 依赖与既有内部输入共用写入路径，不替代人工验收或制造 AI 报告。 */
function applyPrototypeCodeMergeFact(
  state: AIReqWorkflowView,
  sr: AIReqSystemRequirement,
  fix: boolean,
  at: string,
): void {
  if (srProgress(sr) === 100) throw businessRule("已完成 SR 不再接纳代码合入模拟。");
  if (
    !sr.trackingBranch?.name ||
    sr.trackingBranch.status === "failed" ||
    sr.trackingBranch.status === "deleted"
  )
    throw businessRule("开发分支尚不可用，不能模拟合入。");
  const unresolved = (sr.developmentIssues ?? []).filter((issue) => issue.status !== "resolved");
  if (fix && !unresolved.length) throw businessRule("没有待修复测试问题。");
  if (!fix && unresolved.length) throw businessRule("存在未解决测试问题，请使用模拟修复合入。");
  const commit = `simulated-${fix ? "fix" : "code"}-${sr.id}-${state.revision + 1}`;
  const project = state.projects.find((item) => item.id === sr.projectId)!;
  sr.codeMerge = { commit, branch: project.defaultBranch, checkedAt: at, files: [] };
  state.repositoryHeads ??= {};
  state.repositoryHeads[project.repositoryId] = commit;
  for (const issue of unresolved) {
    issue.status = "awaiting-retest";
    issue.fixCodeVersion = commit;
  }
  if (sr.progress) sr.progress = { ...sr.progress, percent: 99, merged: true, stale: true };
  sr.status = "developing";
}

/** 真实服务时钟观测内存 Git 事实；不以读取次数、请求身份或测试标识驱动。 */
export function pollPrototypeDevelopment(): void {
  const now = Date.now();
  const at = new Date(now).toISOString();
  mutatePrototypeWorkflow((state) => {
    let changed = false;
    for (const group of state.groups) {
      for (const sr of state.srs) {
        if (
          sr.projectId !== group.projectId ||
          sr.irId !== group.id ||
          !group.srIds.includes(sr.id)
        )
          continue;
        const branch = sr.trackingBranch;
        if (!branch?.name || branch.status !== "ready" || srProgress(sr) === 100) continue;
        // 分支成功推送才允许首次开发合入；失败后修复等待真实问题产生，不反写人工通过。
        const openIssues = (sr.developmentIssues ?? []).filter((issue) => issue.status === "open");
        const since = sr.codeMerge
          ? openIssues.length
            ? Math.max(...openIssues.map((issue) => Date.parse(issue.reportedAt)))
            : NaN
          : Date.parse(branch.pushedAt);
        if (!Number.isFinite(since) || now - since < 10_000) continue;
        applyPrototypeCodeMergeFact(state, sr, Boolean(sr.codeMerge), at);
        changed = true;
      }
    }
    // 没有新事实时不发布 revision，避免轮询破坏界面的 CAS 编辑。
    return changed;
  });
}

/** 明确的外部模拟输入；不运行 Git、不修改业务代码，也不直接完成测试。 */
export async function simulatePrototypeCodeMerge(
  projectId: string,
  irId: string,
  srId: string,
  input: AIReqCodeMergeInput,
): Promise<void> {
  operatePrototypeProgress(
    projectId,
    irId,
    srId,
    input,
    "simulateCodeMerge",
    input,
    (state, _group, target, _employeeId, at) => {
      const sr = target!;
      if (typeof input.fix !== "boolean") throw businessRule("模拟合入类型无效。");
      applyPrototypeCodeMergeFact(state, sr, input.fix, at);
    },
  );
}

function cleanupItems(
  state: AIReqWorkflowView,
  projectId: string,
  irId: string,
): AIReqBranchCleanupItem[] {
  const view = withPrototypeProgress(state);
  const group = view.groups.find((item) => item.projectId === projectId && item.id === irId);
  if (!group) throw businessRule("正式 IR 不存在。");
  const srs = view.srs.filter(
    (sr) => sr.projectId === projectId && sr.irId === irId && group.srIds.includes(sr.id),
  );
  if (!srs.length || srs.length !== group.srIds.length || srs.some((sr) => srProgress(sr) !== 100))
    throw businessRule("只有本 IR 全部 SR 测试通过达到 100% 后才允许清理开发分支。");
  return srs.map((sr) => ({
    srId: sr.id,
    branch: sr.trackingBranch?.name ?? "",
    status: sr.trackingBranch?.status ?? "ready",
    error: sr.trackingBranch?.error,
  }));
}
export function previewPrototypeBranchCleanup(
  projectId: string,
  irId: string,
): AIReqBranchCleanupItem[] {
  return cleanupItems(getPrototypeWorkflow({ projectId }), projectId, irId);
}
export async function failNextPrototypeBranchCleanup(
  projectId: string,
  irId: string,
  srId: string,
  input: AIReqVersionedProgressInput,
): Promise<void> {
  operatePrototypeProgress(
    projectId,
    irId,
    srId,
    input,
    "failNextBranchCleanup",
    input,
    (_state, _group, target) => {
      const sr = target! as InternalSystemRequirement;
      if (!sr.trackingBranch?.name || sr.trackingBranch.status === "deleted")
        throw businessRule("没有可清理的登记开发分支。");
      sr.trackingBranch.nextCleanupFailure = true;
    },
  );
}
export async function cleanupPrototypeBranches(
  projectId: string,
  irId: string,
  input: AIReqBranchCleanupInput,
): Promise<void> {
  operatePrototypeProgress(
    projectId,
    irId,
    undefined,
    input,
    "cleanupBranches",
    input,
    (state, _group, _target, _employeeId, at) => {
      const items = cleanupItems(state, projectId, irId);
      if (
        !Array.isArray(input.branches) ||
        input.branches.some((branch) => typeof branch !== "string") ||
        JSON.stringify([...new Set(input.branches)].sort()) !==
          JSON.stringify([...new Set(items.map((item) => item.branch))].sort())
      )
        throw businessRule("确认分支清单与当前 IR 登记分支不符，请重新预览。");
      const project = state.projects.find((item) => item.id === projectId)!;
      for (const item of items) {
        const sr = state.srs.find(
          (row) => row.projectId === projectId && row.irId === irId && row.id === item.srId,
        )! as InternalSystemRequirement;
        const branch = sr.trackingBranch;
        if (!branch || branch.status === "deleted") continue;
        if (
          !branch.name.trim() ||
          branch.name === project.defaultBranch ||
          branch.name === `refs/heads/${project.defaultBranch}`
        ) {
          branch.status = "failed";
          branch.error = "保护规则：不得清理空分支或项目主分支。";
        } else if (branch.nextCleanupFailure) {
          branch.nextCleanupFailure = false;
          branch.status = "failed";
          branch.error = "本次分支清理失败，可重试失败项。";
        } else {
          branch.status = "deleted";
          branch.deletedAt = at;
          branch.error = undefined;
        }
      }
    },
  );
}

/** 分析唯一写回点；同一输入之外的迟到结果不能改写当前事实。 */
export function acceptPrototypeProgressReport(
  projectId: string,
  irId: string,
  srId: string,
  expectedFingerprint: string,
  fingerprint: (
    state: AIReqWorkflowView,
    group: AIReqRequirementGroup,
    sr: AIReqSystemRequirement,
  ) => string,
  report: AIReqProgressAnalysis | undefined,
  failure?: string,
): boolean {
  let accepted = false;
  mutatePrototypeWorkflow((state) => {
    const group = state.groups.find((item) => item.projectId === projectId && item.id === irId);
    const sr = state.srs.find(
      (item) =>
        item.projectId === projectId &&
        item.irId === irId &&
        item.id === srId &&
        group?.srIds.includes(item.id),
    );
    if (!group || !sr || fingerprint(state, group, sr) !== expectedFingerprint) return false;
    if (!sr.progress)
      sr.progress = withPrototypeProgress({
        ...state,
        groups: [group],
        srs: [sr],
      }).srs[0]?.progress;
    if (failure) {
      sr.lastAnalysisFailure = { message: failure, at: new Date().toISOString() };
      if (sr.progress)
        sr.progress = {
          ...sr.progress,
          analysisFailure: { message: failure, at: new Date().toISOString() },
          stale: true,
        };
    } else if (report) {
      sr.lastAnalysisFailure = undefined;
      const manual = sr.progress?.manual;
      sr.progress = {
        ...structuredClone(report),
        manual,
        inputFingerprint: expectedFingerprint,
        stale: false,
      };
      sr.progress.percent = srProgress(sr);
    } else return false;
    accepted = true;
  });
  return accepted;
}
