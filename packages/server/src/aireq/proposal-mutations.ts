import { contentVersion, createRequirementSnapshot } from "./content-digest.js";
import type { InternalWorkflowAction } from "./internal-scenarios.js";
import type { Receipt, RequirementGroup, WorkflowState } from "./workflow-state.js";
import type {
  AIReqMaterialView,
  AIReqMaterialHistoryEvent,
  AIReqSystemRequirement,
} from "@zcode/services/aireq";
import { completeProposalPaths, proposalAlignmentCurrent } from "@zcode/services/aireq";
import { group, systemRequirement, sessionRef } from "./fixture-builders.js";
import { getEmployeeId } from "./identity.js";
import { businessRule } from "./errors.js";
import { readPrototypeProjectReleases, addPrototypeRelease } from "./project-releases.js";
import { prototypeProposalDependencies } from "./proposal-flow.js";
import {
  appendMaterialDiscussion,
  checkProposalMaterials,
  prototypeMaterial,
  solutionMaterials,
} from "./materials.js";
import { prototypeMaterialIssue } from "./recovery.js";
import { acceptPrototypeReview, type PrototypeReviewRun } from "./requirements-review.js";
import {
  closePrototypeProposalMr,
  preparePrototypeProposalCandidate,
  publishPrototypeProposal,
} from "./proposal-delivery.js";
import { capturePrototypeMaterialHistory } from "./proposal-storage.js";

function materialsFor(
  state: WorkflowState,
  proposal: RequirementGroup,
): AIReqMaterialView[] {
  return state.materials.filter(
    (item) => item.projectId === proposal.projectId && item.irId === proposal.id,
  );
}

type NativeRequirementsOutput = {
  kind: "requirements";
  material: AIReqMaterialView;
};
type NativeSolutionOutput = {
  kind: "solution";
  rows: AIReqSystemRequirement[];
  bundle: AIReqMaterialView[];
  dependency: AIReqMaterialView;
};
export type NativeProposalOutput = NativeRequirementsOutput | NativeSolutionOutput;

function stageRequirementsOutput(
  proposal: RequirementGroup,
  existing: AIReqMaterialView | undefined,
  note: string,
): NativeRequirementsOutput {
  const content = /^#(?:[ \t]+|$)/.test(note)
    ? note
    : appendMaterialDiscussion(
        existing?.content ?? `# ${proposal.title}\n\n## 目标与范围\n\n${proposal.originalText}`,
        note,
        "业务澄清",
      );
  return {
    kind: "requirements",
    material: prototypeMaterial({
      projectId: proposal.projectId,
      irId: proposal.id,
      path: proposal.documentPath,
      kind: "ir",
      content,
    }),
  };
}

/** Simulated execution stages the same material bundle without mutating the workflow. */
export function stageNativeProposalOutput(
  state: WorkflowState,
  proposal: RequirementGroup,
  kind: NativeProposalOutput["kind"],
  text: string,
): NativeProposalOutput {
  const current = materialsFor(state, proposal);
  if (kind === "requirements")
    return stageRequirementsOutput(
      proposal,
      current.find((item) => item.path === proposal.documentPath),
      text,
    );

  const { projectId, id: irId } = proposal;
  const rows = proposal.srIds.length
    ? state.srs.filter((row) => row.projectId === projectId && row.irId === irId)
    : ["业务操作与结果展示", "异常处理与恢复"].map((title, index) =>
        systemRequirement(
          projectId,
          irId,
          `sr-${irId}-${index + 1}`,
          `${proposal.title} · ${title}`,
        ),
      );
  const dependencyInput = text.startsWith("{") ? text : undefined;
  const bundle = solutionMaterials(projectId, irId, rows);
  for (const material of bundle) {
    // 退回后继续使用已经存在的工作材料，不能用新一轮的模拟模板覆盖它。
    const prior = current.find((item) => item.path === material.path);
    if (prior) material.content = prior.content;
    if (!dependencyInput)
      material.content = appendMaterialDiscussion(material.content, text, "本轮方案讨论");
  }
  const round = proposal.proposalRound ?? 1;
  const dependency =
    !dependencyInput && proposal.srDependencyFile?.round === round
      ? { ...proposal.srDependencyFile }
      : prototypeProposalDependencies(
          proposal,
          rows,
          dependencyInput ?? proposal.srDependencyFile?.content,
        );
  bundle.push(dependency);
  return { kind, rows, bundle, dependency };
}

function checkMaterials(
  state: WorkflowState,
  proposal: RequirementGroup,
  stage: "requirements" | "solution",
): void {
  const result = checkProposalMaterials(
    proposal,
    materialsFor(state, proposal),
    stage,
    state.documentFormats,
    prototypeMaterialIssue,
  );
  if (stage === "requirements") {
    proposal.requirementsCheck = result;
    proposal.solutionCheck = undefined;
  } else {
    proposal.solutionCheck = result;
    if (proposal.proposalSolution) proposal.proposalSolution.valid = !result.issues.length;
  }
}
function snapshot(state: WorkflowState, proposal: RequirementGroup): void {
  const required = new Set(completeProposalPaths(proposal));
  proposal.files = materialsFor(state, proposal)
    .filter(
      (item) =>
        item.valid &&
        required.has(item.path) &&
        (item.path === proposal.documentPath || proposal.solutionCheck),
    )
    .map(({ path, sha256, size }) => ({ path, sha256, size }));
  proposal.snapshot = createRequirementSnapshot({
    version: 1,
    projectId: proposal.projectId,
    irId: proposal.id,
    title: proposal.title,
    documentPath: proposal.documentPath,
    srs: state.srs
      .filter((row) => row.projectId === proposal.projectId && row.irId === proposal.id)
      .map(({ id, title, documentPath }) => ({ id, title, documentPath })),
    files: structuredClone(proposal.files),
  });
  if (proposal.proposalSolution?.valid)
    proposal.proposalSolution.requirementsDigest = proposal.snapshot.digest;
}
function recordMaterialConfirmation(
  state: WorkflowState,
  proposal: RequirementGroup,
  role: Extract<AIReqMaterialHistoryEvent, { type: "confirmation" }>["role"],
  at: string,
  requirementsOnly = false,
): void {
  const paths = new Set(proposal.files.map((file) => file.path));
  const confirmed = materialsFor(state, proposal).filter(
    (file) => paths.has(file.path) && (!requirementsOnly || file.path === proposal.documentPath),
  );
  const snapshot = capturePrototypeMaterialHistory(state, proposal, confirmed, "人工确认");
  (proposal.materialHistory ??= []).push({
    ...snapshot,
    changedAt: at,
    event: { type: "confirmation", employeeId: getEmployeeId(), role },
  });
}

function invalidate(
  state: WorkflowState,
  proposal: RequirementGroup,
  reason: string,
  original: boolean,
): void {
  proposal.materialHistory ??= [];
  proposal.materialHistory.push(
    capturePrototypeMaterialHistory(state, proposal, materialsFor(state, proposal), reason),
  );
  if (proposal.review) {
    proposal.review.invalidatedReason = reason;
    proposal.reviewHistory ??= [];
    proposal.reviewHistory.push(structuredClone(proposal.review));
    proposal.review = undefined;
  }
  if (original && proposal.originalReview) {
    proposal.originalReview.invalidatedReason = reason;
    proposal.originalReviewHistory ??= [];
    proposal.originalReviewHistory.push(structuredClone(proposal.originalReview));
    proposal.originalReview = undefined;
  }
  if (original) proposal.developerAcceptance = undefined;
  if (proposal.alignment?.length) {
    proposal.alignmentHistory ??= [];
    proposal.alignmentHistory.push(...proposal.alignment);
  }
  proposal.alignment = [];
  if (proposal.proposalDelivery) {
    proposal.proposalDeliveryHistory ??= [];
    proposal.proposalDeliveryHistory.push(structuredClone(proposal.proposalDelivery));
    proposal.proposalDelivery = undefined;
  }
  proposal.requirementsPr = undefined;
  proposal.revision += 1;
}
function replaceMaterial(
  state: WorkflowState,
  proposal: RequirementGroup,
  material: AIReqMaterialView,
): void {
  material.round = proposal.proposalRound ?? 1;
  Object.assign(material, contentVersion(material.content ?? ""));
  state.materials = state.materials.filter(
    (item) =>
      item.projectId !== proposal.projectId ||
      item.irId !== proposal.id ||
      item.path !== material.path,
  );
  state.materials.push(material);
}
function createProposal(
  state: WorkflowState,
  projectId: string,
  releaseId: string,
  text: string,
  operation: Receipt,
  suffix = "",
  sourceIrId?: string,
): RequirementGroup {
  const id = `ir-demo-${state.revision}${suffix}`;
  const proposal = group(
    projectId,
    id,
    text.split("\n")[0]!.slice(0, 60),
    [],
    true,
    getEmployeeId(),
  );
  proposal.originalText = text;
  proposal.submittedBy = getEmployeeId();
  proposal.contacts = { business: getEmployeeId() };
  proposal.sourceIrId = sourceIrId;
  proposal.createdAt = operation.startedAt;
  proposal.origin = suffix ? "import" : "browser";
  proposal.releaseId = releaseId;
  proposal.files = [];
  proposal.snapshot = undefined;
  state.drafts.push(proposal);
  state.sessions.push(...proposal.sessions);
  return proposal;
}
/** Mutates only the transaction supplied by the unique workflow owner. */
export function applyProposalMutation(
  state: WorkflowState,
  action: InternalWorkflowAction,
  projectId: string,
  irId: string | undefined,
  operation: Receipt,
  reviewRuns: PrototypeReviewRun[],
  stagedOutput?: NativeProposalOutput,
): string | undefined {
  const proposal = [...state.groups, ...state.drafts].find(
    (item) => item.id === irId && item.projectId === projectId,
  );
  const at = new Date().toISOString();
  const acceptReview = (
    target: RequirementGroup,
    kind: PrototypeReviewRun["kind"],
    retry = false,
  ) => {
    const run = acceptPrototypeReview(state, target, kind, getEmployeeId(), retry);
    if (run) reviewRuns.push(run);
  };
  switch (action.type) {
    case "requestProjectRoles":
      for (const role of action.roles) {
        (state.roleRegistrations ??= []).push({
          id: crypto.randomUUID(),
          projectId,
          employeeId: getEmployeeId(),
          role,
          status: "pending",
          note: action.note?.trim() || undefined,
          requestedAt: at,
        });
      }
      break;
    case "decideProjectRole": {
      const registration = state.roleRegistrations!.find(
        (entry) => entry.id === action.registrationId && entry.projectId === projectId,
      )!;
      registration.status = action.decision;
      registration.decidedAt = at;
      registration.decidedBy = getEmployeeId();
      break;
    }
    case "syncFormalDocuments":
      throw businessRule("Git 同步需要服务端已读取的版本。");

    case "importIdeas": {
      if (!action.originalTexts.length || action.originalTexts.some((text) => !text.trim()))
        throw businessRule("导入正文无效，本批未写入任何想法。");
      // 先校验整批，再由 workflow 同一克隆事务写入；不借用项目或生成提案会话。
      state.ideas.push(
        ...action.originalTexts.map((text, index) => ({
          id: `idea-${state.revision}-${index + 1}`,
          originalText: text.trim(),
          submittedBy: getEmployeeId(),
          createdAt: operation.startedAt,
          revision: 1,
        })),
      );
      operation.type = "批量导入想法";
      break;
    }
    case "createIdea": {
      if (!action.originalText.trim()) throw businessRule("请输入原始需求。");
      state.ideas.push({
        id: `idea-${state.revision}`,
        originalText: action.originalText.trim(),
        submittedBy: getEmployeeId(),
        createdAt: operation.startedAt,
        revision: 1,
      });
      operation.type = "新增想法";
      break;
    }
    case "updateIdea":
    case "transferIdea": {
      const idea = state.ideas.find((item) => item.id === action.ideaId);
      if (!idea) throw businessRule("想法已转入版本或不存在，请刷新想法池。");
      if (idea.revision !== action.ideaRevision)
        throw businessRule("想法内容已变化，请关闭表单并重新打开最新内容。");
      if (action.type === "updateIdea") {
        if (!action.originalText.trim()) throw businessRule("请输入原始需求。");
        idea.originalText = action.originalText.trim();
        idea.revision += 1;
        operation.type = "修改想法";
        break;
      }
      const targets = new Set<string>();
      if (!action.targets.length) throw businessRule("请至少选择一个项目和版本。");
      for (const target of action.targets) {
        if (
          !state.projects.some((item) => item.id === target.projectId) ||
          !readPrototypeProjectReleases(target.projectId).some(
            (item) => item.id === target.releaseId,
          )
        )
          throw businessRule("目标项目或版本不存在，请重新选择。");
        const key = JSON.stringify([target.projectId, target.releaseId]);
        if (targets.has(key)) throw businessRule("不能重复选择同一项目和版本。");
        targets.add(key);
      }
      // 全部目标先验证，再在 workflow 的同一克隆事务内创建和消费；失败不可留下部分提案。
      operation.irIds = action.targets.map((target, index) => {
        const item = createProposal(
          state,
          target.projectId,
          target.releaseId,
          idea.originalText,
          operation,
          `-idea-${index + 1}`,
        );
        item.submittedBy = idea.submittedBy;
        item.createdAt = idea.createdAt;
        item.contacts = { business: idea.submittedBy };
        item.origin = "browser";
        return item.id;
      });
      state.ideas = state.ideas.filter((item) => item.id !== idea.id);
      operation.type = "想法转入版本";
      break;
    }
    case "saveDocumentFormats":
      state.documentFormats = Object.fromEntries(
        Object.entries(action.documentFormats).map(([name, sections]) => [
          name,
          sections.map((section) => section.trim()),
        ]),
      ) as typeof action.documentFormats;
      operation.type = "保存文档格式";
      break;
    case "createRelease":
      addPrototypeRelease({
        id: `demo-release-${state.revision}`,
        projectId,
        title: action.title.trim(),
        createdAt: at,
      });
      break;
    case "createProposal": {
      const existing = action.clientDraftId
        ? state.drafts.find(
            (item) =>
              item.clientDraftId === action.clientDraftId &&
              item.projectId === projectId &&
              item.releaseId === action.releaseId &&
              item.submittedBy === getEmployeeId(),
          )
        : undefined;
      const item =
        existing ??
        createProposal(
          state,
          projectId,
          action.releaseId,
          action.originalText.trim(),
          operation,
          "",
          action.sourceIrId,
        );
      item.clientDraftId = action.clientDraftId;
      irId = item.id;
      operation.irId = irId;
      break;
    }
    case "importProposals":
      // 整批共用一个回执与幂等身份，新 IR 关联不借用导入前的查看目标。
      operation.irIds = [];
      action.proposals.forEach((entry, index) => {
        const item = createProposal(
          state,
          projectId,
          action.releaseId,
          entry.originalText.trim(),
          operation,
          `-${index + 1}`,
        );
        operation.irIds!.push(item.id);
        if (entry.businessDocument !== undefined) {
          // 检查已提供正文，不重写导入字节；格式问题保留给本 IR 澄清。
          state.materials.push(
            prototypeMaterial({
              projectId,
              irId: item.id,
              path: item.documentPath,
              kind: "ir",
              round: item.proposalRound ?? 1,
              content: entry.businessDocument,
            }),
          );
          checkMaterials(state, item, "requirements");
          snapshot(state, item);
        }
      });
      operation.type = "批量导入需求";
      break;
    case "assignContacts":
      proposal!.contacts = { ...action.contacts };
      proposal!.contactHistory ??= [];
      proposal!.contactHistory.push({
        employeeId: getEmployeeId(),
        at,
        contacts: { ...action.contacts },
      });
      break;
    case "deleteRequirement":
      state.groups = state.groups.filter(
        (item) => item.id !== irId || item.projectId !== projectId,
      );
      state.drafts = state.drafts.filter(
        (item) => item.id !== irId || item.projectId !== projectId,
      );
      state.srs = state.srs.filter((item) => item.irId !== irId || item.projectId !== projectId);
      state.materials = state.materials.filter(
        (item) => item.irId !== irId || item.projectId !== projectId,
      );
      state.sessions = state.sessions.filter(
        (item) => item.irId !== irId || item.projectId !== projectId,
      );
      break;
    case "acceptProposal": {
      const review = proposal!.originalReview!;
      if (review.humanDecision) break;
      review.passed = true;
      review.humanDecision = {
        employeeId: getEmployeeId(),
        decidedAt: at,
        reviewId: review.id,
        snapshotDigest: review.snapshotDigest,
      };
      recordMaterialConfirmation(state, proposal!, "business", at, true);
      proposal!.proposalStage = "solution";
      proposal!.developerAcceptance = {
        employeeId: getEmployeeId(),
        acceptedAt: at,
        round: proposal!.proposalRound ?? 1,
      };
      const session = sessionRef(
        projectId,
        proposal!.id,
        "solution",
        undefined,
        undefined,
        proposal!.proposalRound ?? 1,
      );
      if (!proposal!.sessions.some((item) => item.sessionId === session.sessionId)) {
        proposal!.sessions.push(session);
        state.sessions.push(session);
      }
      break;
    }
    case "submitProposalReview":
      acceptReview(proposal!, action.kind);
      operation.type = action.kind === "original" ? "提交需求评审" : "提交方案审查";
      break;
    case "runRequirementsReview":
    case "runFullReview": {
      const kind = action.type === "runFullReview" ? "full" : "original";
      acceptReview(proposal!, kind, true);
      operation.type = kind === "original" ? "重试需求评审" : "重试方案审查";
      break;
    }
    case "confirmAlignment": {
      proposal!.alignment ??= [];
      if (
        !proposal!.alignment.some(
          (entry) =>
            entry.perspective === action.perspective && proposalAlignmentCurrent(proposal!, entry),
        )
      ) {
        proposal!.alignment.push({
          perspective: action.perspective,
          version: action.version,
          reviewId: action.reviewId,
          snapshotDigest: action.snapshotDigest,
          employeeId: getEmployeeId(),
          confirmedAt: at,
        });
        recordMaterialConfirmation(state, proposal!, action.perspective, at);
      }
      preparePrototypeProposalCandidate(
        proposal!,
        `sample-proposal-${state.revision}`,
        getEmployeeId(),
        at,
      );
      break;
    }
    case "generateRequirements":
    case "supplementRequirements": {
      const existing = materialsFor(state, proposal!).find(
        (item) => item.path === proposal!.documentPath,
      );
      const note = action.note.trim();
      const { material } =
        stagedOutput?.kind === "requirements"
          ? stagedOutput
          : stageRequirementsOutput(proposal!, existing, note);
      if (
        existing?.content === material.content &&
        proposal!.requirementsCheck?.issues.length === 0
      )
        break;
      invalidate(state, proposal!, "IR 业务需求文档发生变化，整包批准失效并重新进行前置评审", true);
      if (proposal!.proposalStage === "solution") {
        proposal!.proposalRound = (proposal!.proposalRound ?? 1) + 1;
        const session = sessionRef(
          projectId,
          proposal!.id,
          "requirements",
          undefined,
          undefined,
          proposal!.proposalRound,
        );
        proposal!.sessions.push(session);
        state.sessions.push(session);
      }
      replaceMaterial(state, proposal!, material);
      proposal!.proposalStage = "requirements";
      proposal!.status = "draft";
      if (proposal!.proposalSolution) proposal!.proposalSolution.valid = false;
      if (proposal!.returnFeedback) proposal!.returnFeedback.resumedAt = at;
      proposal!.requirementSupplements ??= [];
      proposal!.requirementSupplements.push({
        note,
        employeeId: getEmployeeId(),
        createdAt: at,
      });
      checkMaterials(state, proposal!, "requirements");
      snapshot(state, proposal!);
      // 对话只产生材料和校验结果；人提交当前版本后才接纳评审。
      break;
    }
    case "generateProposalSolution": {
      if (stagedOutput?.kind !== "solution") throw businessRule("方案执行未提交材料。");
      const { rows, bundle, dependency } = stagedOutput;
      const newSplit = proposal!.srIds.length === 0;
      const current = materialsFor(state, proposal!);
      const round = proposal!.proposalRound ?? 1;
      if (
        !newSplit &&
        proposal!.solutionCheck?.issues.length === 0 &&
        bundle.every((material) =>
          current.some(
            (prior) =>
              prior.path === material.path &&
              prior.round === round &&
              prior.content === material.content,
          ),
        )
      ) {
        break;
      }
      invalidate(
        state,
        proposal!,
        "SR 方案、拆分、依赖或测试材料发生变化，完整审查与三方确认失效",
        false,
      );
      proposal!.proposalStage = "solution";
      if (newSplit) {
        proposal!.srIds = rows.map((row) => row.id);
        state.srs.push(...rows);
      }
      for (const material of bundle) replaceMaterial(state, proposal!, material);
      proposal!.srDependencyFile = dependency;
      proposal!.proposalSolution = {
        path: `openspec/changes/${rows[0]!.id}/design.md`,
        employeeId: getEmployeeId(),
        generatedAt: at,
        round,
        valid: false,
      };
      proposal!.status = "solution-ready";
      checkMaterials(state, proposal!, "solution");
      snapshot(state, proposal!);
      break;
    }
    case "reviseProposalMaterial": {
      if (action.target === "requirements")
        return applyProposalMutation(
          state,
          { type: "supplementRequirements", note: action.note },
          projectId,
          irId,
          operation,
          reviewRuns,
        );
      const note = action.note.trim();
      const targets = materialsFor(state, proposal!).filter((item) =>
        item.path.endsWith(action.target === "test-plan" ? "/test-plan.md" : "/design.md"),
      );
      const updated = targets.map((material) => ({
        ...material,
        content: /^#(?:[ \t]+|$)/.test(note)
          ? note
          : appendMaterialDiscussion(material.content, note, "修订"),
      }));
      if (
        proposal!.solutionCheck?.issues.length === 0 &&
        updated.every((material, index) => material.content === targets[index]?.content)
      ) {
        break;
      }
      invalidate(
        state,
        proposal!,
        `${action.target === "test-plan" ? "测试方案" : "SR 方案"}修改，整包批准与三方确认失效`,
        false,
      );
      for (const material of updated) replaceMaterial(state, proposal!, material);
      checkMaterials(state, proposal!, "solution");
      snapshot(state, proposal!);
      break;
    }
    case "returnProposal": {
      invalidate(state, proposal!, `需求退回补充：${action.reason.trim()}`, true);
      proposal!.requirementsCheck = undefined;
      proposal!.solutionCheck = undefined;
      if (proposal!.proposalSolution) proposal!.proposalSolution.valid = false;
      // 退回只撤销批准及检查；保留文件、版本和清单，后续讨论负责更新实际材料。
      proposal!.proposalStage = "requirements";
      proposal!.status = "draft";
      proposal!.returnFeedbackHistory ??= [];
      if (proposal!.returnFeedback) proposal!.returnFeedbackHistory.push(proposal!.returnFeedback);
      proposal!.returnFeedback = {
        employeeId: getEmployeeId(),
        returnedAt: at,
        round: proposal!.proposalRound ?? 1,
        reason: action.reason.trim(),
      };
      proposal!.proposalRound = (proposal!.proposalRound ?? 1) + 1;
      {
        const session = sessionRef(
          projectId,
          proposal!.id,
          "requirements",
          undefined,
          undefined,
          proposal!.proposalRound,
        );
        proposal!.sessions.push(session);
        state.sessions.push(session);
      }
      break;
    }
    case "publishProposal":
      if (publishPrototypeProposal(state, proposal!, at))
        operation.type = "复用当前版本的文档 PR，不重复推送或创建";
      break;
    case "closeProposalPr":
      closePrototypeProposalMr(proposal!, `sample-proposal-${state.revision}`);
      break;
  }
  return irId;
}
