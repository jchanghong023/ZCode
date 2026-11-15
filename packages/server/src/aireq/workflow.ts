import { PROTOTYPE_BACKEND } from "./backend.js";
import { proposalVersion } from "@zcode/services/aireq";
import { proposalDependencyMaterialIssue } from "@zcode/services/aireq";
import {
  ensurePrototypeProposalMr,
  isPrototypeProposalDeliveryAction,
  validatePrototypeProposalDeliveryAction,
} from "./proposal-delivery.js";
import { createPrototypeEvent } from "./events.js";

import { freezePrototypeRequirement } from "./requirement-freeze.js";

import {
  prototypeSessionReadIssue,
  prototypeMaterialIssue,
  consumePrototypeOperationFailure,
} from "./recovery.js";
import { prototypeReviewModelBindings } from "./requirements-review.js";
import {
  requirementsReviewStartBlocker,
  requirementsReviewReadyBlocker,
  requirementsReviewBlocker,
  requirementsReviewCurrent,
  proposalViewedIndex,
} from "@zcode/services/aireq";
import { getEmployeeId, isEmployeeId } from "./identity.js";
import { hasCurrentProposalSolution } from "@zcode/services/aireq";
import { readPrototypeProjectSettings } from "./project-settings.js";
import { readPrototypeProjectReleases } from "./project-releases.js";
import type {
  AIReqWorkflowCommand,
  AIReqMaterialView,
  AIReqNativeSessionRef,
  AIReqRequirementGroup,
  AIReqProposalMergeScenario,
  AIReqSelection,
  AIReqWorkflowResult,
  AIReqWorkflowView,
} from "@zcode/services/aireq";

import {
  DEFAULT_SELECTION,
  createdAt,
  prototypeDefaultCommit,
  receipt,
} from "./fixture-builders.js";
import { applyProposalMutation } from "./proposal-mutations.js";
import { createPrototypeWorkflow } from "./fixtures.js";
export { DEFAULT_SELECTION, PROTOTYPE_WORKSPACE_IDENTITY } from "./fixture-builders.js";
let state = createPrototypeWorkflow();
// 正式 SR 的分支是平台已分配的必填映射；此处仅补齐初始内存样例，不在前端猜测。
for (const group of state.groups) {
  for (const sr of state.srs.filter(
    (item) => item.projectId === group.projectId && item.irId === group.id,
  )) {
    sr.trackingBranch ??= {
      name: `sr/${sr.id}`,
      baseCommit: prototypeDefaultCommit(state, group.projectId),
      createdAt,
      pushedAt: createdAt,
    };
  }
}
for (const group of state.drafts.filter(
  (item) => item.status === "requirements-pr" && hasCurrentProposalSolution(item),
)) {
  const candidate = `sample-pushed-${group.id}`;
  group.proposalDelivery = {
    candidate,
    version: proposalVersion(group),
    files: structuredClone(group.files),
    confirmedBy: group.developerAcceptance?.employeeId ?? "j00808874",
    confirmedAt: createdAt,
    pushedCandidate: candidate,
    pushedAt: createdAt,
    branch: {
      name: `ir/${group.id}`,
      baseCommit: prototypeDefaultCommit(state, group.projectId),
      createdAt,
      pushedAt: createdAt,
    },
    mergeScenario: "unmerged",
    mergeCheck: { status: "waiting", message: "MR 已自动创建，等待人工评审合并与后台定时核验。" },
  };
  ensurePrototypeProposalMr(group);
}
export const prototypeWorkflowChanges = createPrototypeEvent<void>();
export function notifyPrototypeProjectSettingsChanged(): void {
  Object.assign(state, readPrototypeProjectSettings());
  state.revision += 1;
  prototypeWorkflowChanges.fire();
}
/** 仅写入内存样例；合入证据与文档完整性是自动入库的两项条件。 */
function completePrototypeProposal(group: AIReqRequirementGroup, checkedAt: string): void {
  const project = state.projects.find((item) => item.id === group.projectId)!;
  const commit = `sample-proposal-merged-${state.revision}`;
  group.status = "formal";
  group.merge = {
    commit,
    branch: project.defaultBranch,
    checkedAt,
    files: structuredClone(group.files),
  };
  state.drafts = state.drafts.filter(
    (item) => item.id !== group.id || item.projectId !== group.projectId,
  );
  if (!state.groups.some((item) => item.id === group.id && item.projectId === group.projectId))
    state.groups.push(group);
  group.revising = false;
  const revision = group.proposalRevisions?.at(-1);
  if (revision && !revision.completedAt) revision.completedAt = checkedAt;
  state.repositoryHeads ??= {};
  state.repositoryHeads[project.repositoryId] = commit;
  for (const sr of state.srs.filter(
    (item) => item.projectId === group.projectId && item.irId === group.id,
  )) {
    sr.trackingBranch ??= {
      name: `sr/${sr.id}`,
      baseCommit: commit,
      createdAt: checkedAt,
      pushedAt: checkedAt,
    };
  }
  freezePrototypeRequirement(group, "platform", checkedAt);
}

export function setPrototypeProposalMergeScenario(
  projectId: string,
  irId: string,
  scenario: AIReqProposalMergeScenario,
): void {
  const group = state.drafts.find((item) => item.projectId === projectId && item.id === irId);
  if (!group?.proposalDelivery?.pushedAt) throw new Error("请先完成方案并推送提案分支。");
  if (!["unmerged", "merged", "incomplete", "failed", "mr-closed"].includes(scenario))
    throw new Error("未知 MR 检查情景。");
  group.proposalDelivery.mergeScenario = scenario;
  prototypeWorkflowChanges.fire();
}

/** 原型五秒时钟只读取显式预置的 Git 结果，不连接 Git、PR API 或模型。 */
export function pollPrototypeProposalMerges(): void {
  let checked = false;
  // 转正替换 state.drafts 引用，不修改当前遍历的数组，因此无需复制快照。
  for (const group of state.drafts) {
    const delivery = group.proposalDelivery;
    if (
      group.status !== "requirements-pr" ||
      !delivery?.pushedAt ||
      delivery.pushedCandidate !== delivery.candidate
    )
      continue;
    checked = true;
    const at = new Date().toISOString();
    const nextCheckAt = new Date(Date.now() + 5000).toISOString();
    const scenario = delivery.mergeScenario ?? "unmerged";
    if (scenario === "failed") {
      delivery.mergeCheck = {
        status: "failed",
        checkedAt: at,
        nextCheckAt,
        message: "查询 MR 或读取默认分支失败，保留最后结果，下一轮定时重试。",
      };
      continue;
    }
    const mr = group.requirementsPr;
    if (!mr?.number || delivery.prCandidate !== delivery.candidate) {
      delivery.mergeCheck = {
        status: "failed",
        checkedAt: at,
        nextCheckAt,
        message: "当前候选缺少平台创建的 MR 记录，保留提案，不转正。",
      };
      continue;
    }
    if (scenario === "mr-closed") {
      mr.status = "closed";
      delivery.mergeCheck = {
        status: "unmerged",
        checkedAt: at,
        nextCheckAt,
        message: "MR 已关闭且未合入，保留提案，不转正。",
      };
      continue;
    }
    if (scenario === "unmerged") {
      mr.status = "opened";
      delivery.mergeCheck = {
        status: "unmerged",
        checkedAt: at,
        nextCheckAt,
        message: "MR 已创建，等待人工评审、合并；后台按计划核验合入与材料完整性。",
      };
      continue;
    }
    mr.status = "merged";
    const expected = [
      group.documentPath,
      ...group.srIds.map(
        (id) =>
          state.srs.find(
            (sr) => sr.projectId === group.projectId && sr.irId === group.id && sr.id === id,
          )?.documentPath,
      ),
      group.proposalSolution?.path,
      group.srDependencyFile?.path,
    ];
    const complete =
      hasCurrentProposalSolution(group) &&
      delivery.version === proposalVersion(group) &&
      !proposalDependencyMaterialIssue(group, state.materials) &&
      expected.length >= 4 &&
      expected.every(
        (path) =>
          path &&
          state.materials.some(
            (material) =>
              material.projectId === group.projectId &&
              material.irId === group.id &&
              material.path === path &&
              material.valid &&
              !material.error &&
              Boolean(material.content?.trim()),
          ),
      );
    if (scenario === "incomplete" || !complete) {
      delivery.mergeCheck = {
        status: "incomplete",
        checkedAt: at,
        nextCheckAt,
        message: "已发现合入，但 IR、SR 或方案文档不完整（样例），保留提案，下一轮继续检查。",
      };
      continue;
    }
    delivery.mergeCheck = {
      status: "merged",
      checkedAt: at,
      message: "提案分支已合入且需求文档完整（样例），自动入库并创建、推送各 SR 分支。",
    };
    const operation = receipt(
      "后台核验提案合入与文档完整性，自动入库并推送 SR 分支（内存演示）",
      ++state.revision,
      group.id,
    );
    operation.startedAt = at;
    operation.completedAt = at;
    completePrototypeProposal(group, at);
    state.operations.push(operation);
  }
  if (checked) {
    state.revision += 1;
    prototypeWorkflowChanges.fire();
  }
}

export function getPrototypeWorkflow(
  selection: AIReqSelection = DEFAULT_SELECTION,
): AIReqWorkflowView {
  const projectId = selection.projectId ?? DEFAULT_SELECTION.projectId;
  const sharedSettings = readPrototypeProjectSettings();
  return {
    ...state,
    ompWebId: PROTOTYPE_BACKEND.id,
    projects: sharedSettings.projects,
    currentProjectId: projectId,
    repositoryHeads: Object.fromEntries(
      sharedSettings.projects.map((project) => [
        project.repositoryId,
        prototypeDefaultCommit(state, project.id),
      ]),
    ),
    releases: readPrototypeProjectReleases(projectId),
    groups: state.groups.filter((item) => item.projectId === projectId),
    drafts: state.drafts.filter(
      (item) =>
        item.projectId === projectId && (!item.pendingFirstMessage || item.id === selection.irId),
    ),
    srs: state.srs.filter((item) => item.projectId === projectId),
    materials: state.materials
      .filter((item) => item.projectId === projectId)
      .map((item) =>
        prototypeMaterialIssue(item.path)
          ? { ...item, error: prototypeMaterialIssue(item.path), content: undefined }
          : item,
      ),
    sessions: state.sessions.filter(
      (item) => item.projectId === projectId && !prototypeSessionReadIssue(item.sessionId),
    ),
    operations: state.operations.filter(
      (item) =>
        !item.irId ||
        [...state.groups, ...state.drafts].some(
          (group) => group.projectId === projectId && group.id === item.irId,
        ),
    ),
    changes: state.changes?.filter((item) => item.projectId === projectId),
    selected:
      selection.irId && projectId
        ? { projectId, irId: selection.irId, ...(selection.srId ? { srId: selection.srId } : {}) }
        : undefined,
  };
}
/** 提案内的 IR/SR 是查看目标；业务需求会话始终归属于整份提案。 */
export function resolvePrototypeSession(
  view: AIReqWorkflowView,
  selection: AIReqSelection,
): AIReqNativeSessionRef | undefined {
  if (!selection.irId) return;
  const projectId = selection.projectId ?? view.currentProjectId;
  if (selection.srId) return;
  const proposal = view.drafts.find(
    (item) => item.projectId === projectId && item.id === selection.irId,
  );
  if (proposal && !selection.srId && proposalViewedIndex(proposal, selection) === 1) {
    const reviewer =
      proposal.review?.agents?.find((agent) => agent.id === (selection.reviewAgent ?? "summary"))
        ?.session ?? proposal.review?.reviewer;
    return reviewer && "projectId" in reviewer ? reviewer : undefined;
  }
  if (!proposal) return;
  if (proposal)
    return proposal.sessions
      .filter(
        (item) =>
          item.projectId === projectId &&
          item.irId === proposal.id &&
          !item.srId &&
          item.role !== "reviewer" &&
          item.phase === (selection.discussionPhase ?? proposal.proposalStage ?? "requirements"),
      )
      .sort((a, b) => b.round - a.round)[0];
}
export function getPrototypeSession(
  selection: AIReqSelection = DEFAULT_SELECTION,
): AIReqNativeSessionRef | undefined {
  return resolvePrototypeSession(getPrototypeWorkflow(selection), selection);
}
export function getPrototypeMaterial(
  selection: AIReqSelection,
  path: string,
): AIReqMaterialView | undefined {
  return getPrototypeWorkflow(selection).materials.find(
    (item) =>
      item.irId === selection.irId &&
      item.path === path &&
      (!item.srId || item.srId === selection.srId),
  );
}
/** Small UI-only transitions, not backend workflow approvals or an execution engine. */
export function applyPrototypeAction(
  action: AIReqAction,
  selection: AIReqSelection,
  solutionDiscussion?: string,
): AIReqWorkflowResult {
  if (consumePrototypeOperationFailure(action.type))
    throw new Error("操作未完成（一次性故障样例）。内容和当前状态已保留，请明确重试。");
  if (action.type === "createProposal") {
    const projectId = action.projectId ?? selection.projectId ?? DEFAULT_SELECTION.projectId;
    if (
      !readPrototypeProjectReleases(projectId).some((release) => release.id === action.releaseId)
    ) {
      throw new Error("请选择当前项目的有效 Release。");
    }
  }
  if (action.type === "createRelease") {
    const projectId = action.projectId ?? selection.projectId;
    if (!state.projects.some((item) => item.id === projectId)) throw new Error("请选择已有项目。");
    if (!action.title.trim()) throw new Error("请输入 Release 名称。");
    if (
      readPrototypeProjectReleases(projectId).some(
        (item) => item.title.toLowerCase() === action.title.trim().toLowerCase(),
      )
    ) {
      throw new Error("此项目中已存在同名 Release，请使用其他名称。");
    }
  }
  const targetProjectId = action.projectId ?? selection.projectId ?? DEFAULT_SELECTION.projectId;
  const targetProposal = state.drafts.find(
    (item) => item.projectId === targetProjectId && item.id === (action.irId ?? selection.irId),
  );
  const proposalAction =
    [
      "submitProposalReview",
      "acceptProposal",
      "runRequirementsReview",
      "generateRequirements",
      "supplementRequirements",
      "generateProposalSolution",
      "returnProposal",
      "recordRequirementsDecision",
    ].includes(action.type) || isPrototypeProposalDeliveryAction(action);
  if (proposalAction) {
    if (!targetProposal) throw new Error("请选择需求提案，不能对正式需求重复执行提案动作。");
    if (!isEmployeeId(getEmployeeId())) throw new Error("请先输入有效工号。");
  }
  if (
    targetProposal &&
    [
      "submitProposalReview",
      "acceptProposal",
      "generateProposalSolution",
      "markRequirementsPrSubmitted",
      "markRequirementsMerged",
    ].includes(action.type)
  ) {
    const blocker =
      action.type === "acceptProposal"
        ? requirementsReviewReadyBlocker(targetProposal)
        : requirementsReviewBlocker(targetProposal);
    if (blocker) throw new Error(blocker);
  }
  if (action.type === "runRequirementsReview") {
    const blocker = targetProposal && requirementsReviewStartBlocker(targetProposal);
    if (blocker) throw new Error(blocker);
    prototypeReviewModelBindings();
  }
  if (
    action.type === "acceptProposal" &&
    targetProposal?.review?.agents &&
    (action.reviewId !== targetProposal.review.id ||
      action.snapshotDigest !== targetProposal.review.snapshotDigest)
  )
    throw new Error("人工通过须绑定当前综合意见和需求版本，请刷新后重新判断。");
  if (
    action.type === "acceptProposal" &&
    (targetProposal?.proposalStage !== "requirements" || targetProposal.status !== "draft")
  )
    throw new Error("请先完成当前需求版本的评审，再进入技术方案。");
  if (
    action.type === "acceptProposal" &&
    targetProposal?.developerAcceptance?.round === (targetProposal?.proposalRound ?? 1)
  )
    throw new Error("本轮提案已有方案参与记录，不能重复通过。");
  if (action.type === "runRequirementsReview" && targetProposal?.status === "requirements-pr")
    throw new Error("PR 已提交，本轮仅支持提交 PR 前的需求评审。");
  if (
    (action.type === "generateRequirements" || action.type === "supplementRequirements") &&
    (targetProposal?.proposalStage !== "requirements" ||
      targetProposal.status !== "draft" ||
      !action.note.trim())
  )
    throw new Error("请在业务需求阶段填写明确的需求内容。");
  if (action.type === "generateRequirements" && targetProposal?.srIds.length)
    throw new Error("本提案已有 SR，请补充当前需求，不重复生成或覆盖已有拆分。");
  if (action.type === "supplementRequirements" && !targetProposal?.srIds.length)
    throw new Error("请先生成 IR／SR，再补充需求。");
  if (
    action.type === "submitProposalReview" &&
    (targetProposal?.status !== "draft" || targetProposal.proposalStage !== "requirements")
  )
    throw new Error("仅业务需求阶段的草稿可交给开发评审，无需预先生成方案。");
  if (
    action.type === "generateProposalSolution" &&
    (!targetProposal?.srIds.length ||
      targetProposal.proposalStage !== "solution" ||
      !["draft", "solution-ready"].includes(targetProposal.status))
  )
    throw new Error("请先完成 IR／SR 并交给开发，在方案阶段生成方案。");
  if (
    action.type === "returnProposal" &&
    (!targetProposal ||
      targetProposal.status === "requirements-pr" ||
      !["draft", "solution-ready"].includes(targetProposal.status) ||
      !(
        targetProposal.proposalStage === "solution" ||
        (targetProposal.proposalStage === "requirements" &&
          requirementsReviewCurrent(targetProposal))
      ) ||
      !action.reason.trim())
  )
    throw new Error("请在当前需求评审或提交 PR 前的方案阶段填写业务需补充的细节，再打回提案。");
  if (isPrototypeProposalDeliveryAction(action) && targetProposal)
    validatePrototypeProposalDeliveryAction(
      getPrototypeWorkflow({ projectId: targetProjectId }),
      targetProposal,
      action,
    );
  if (
    action.type === "deleteRequirement" &&
    (!targetProposal ||
      targetProposal.proposalRevisions?.length ||
      targetProposal.merge ||
      targetProposal.developmentStartedAt)
  )
    throw new Error("正式提案的修订必须保留原入库记录，不能作为普通草稿删除。");
  if (
    action.type === "deleteRequirement" &&
    state.groups.some(
      (item) =>
        item.projectId === targetProjectId &&
        item.id === (action.irId ?? selection.irId) &&
        (item.merge || item.developmentStartedAt),
    )
  )
    throw new Error("已入库的正式提案须保留 Git 记录与历史，不能通过删除需求释放仓库。");
  state = structuredClone(state);
  const projectId = action.projectId ?? selection.projectId ?? "demo-aurora";
  let irId = action.irId ?? selection.irId;
  const srId = proposalAction ? undefined : (action.srId ?? selection.srId);
  const selectedProjectId = projectId;
  const operation = receipt(action.type, ++state.revision, irId, srId, new Date().toISOString());
  irId = applyProposalMutation(state, action, projectId, irId, operation, solutionDiscussion);
  state.operations.push(operation);
  prototypeWorkflowChanges.fire();
  return {
    operationId: operation.operationId,
    projectId: selectedProjectId,
    revision: state.revision,
    irId,
    srId,
    status: "completed",
    receipt: operation,
    deletion: operation.deletion,
    view: getPrototypeWorkflow({ projectId: selectedProjectId, irId, srId }),
  };
}

/** 只有首条消息实际进入会话后，待接纳条目才进入共享提案列表。 */
export function publishPrototypeProposalForSession(sessionId: string): void {
  const item = state.drafts.find(
    (group) =>
      group.pendingFirstMessage &&
      group.sessions.some((session) => session.sessionId === sessionId),
  );
  if (!item) return;
  item.pendingFirstMessage = false;
  if (item.title === "未发送草稿") item.title = "新需求提案 · 整理中（样例）";
  state.revision += 1;
  prototypeWorkflowChanges.fire();
}

type AIReqAction = AIReqWorkflowCommand extends infer C
  ? C extends AIReqWorkflowCommand
    ? Omit<C, "operationId" | "expectedRevision">
    : never
  : never;
