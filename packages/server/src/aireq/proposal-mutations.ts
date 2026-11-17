import { contentVersion, createRequirementSnapshot } from "./content-digest.js";
import type {
  InternalRequirementGroup,
  InternalProposalDelivery,
  InternalWorkflowAction,
} from "./internal-scenarios.js";
import type {
  AIReqWorkflowView,
  AIReqOperationReceipt,
  AIReqRequirementGroup,
  AIReqMaterialView,
} from "@zcode/services/aireq";
import { proposalVersion } from "@zcode/services/aireq";
import {
  group,
  systemRequirement,
  sessionRef,
  prototypeDefaultCommit,
} from "./fixture-builders.js";
import { getEmployeeId } from "./identity.js";
import { businessRule } from "./errors.js";
import { readPrototypeProjectSettings } from "./project-settings.js";
import { readPrototypeProjectReleases, addPrototypeRelease } from "./project-releases.js";
import { prototypeProposalDependencies, prototypeProposalSolution } from "./proposal-flow.js";
import { requirementMaterials } from "./materials.js";
import {
  createPrototypeRequirementsReview,
  prototypeReviewSessions,
} from "./requirements-review.js";
import { ensurePrototypeProposalMr } from "./proposal-delivery.js";
import { readPrototypeProposalPrHandoff } from "./proposal-pr-handoff.js";

function materialsFor(
  state: AIReqWorkflowView,
  proposal: AIReqRequirementGroup,
): AIReqMaterialView[] {
  return state.materials.filter(
    (item) => item.projectId === proposal.projectId && item.irId === proposal.id,
  );
}
function snapshot(state: AIReqWorkflowView, proposal: AIReqRequirementGroup): void {
  proposal.files = materialsFor(state, proposal)
    .filter((item) => item.valid)
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
function invalidate(
  state: AIReqWorkflowView,
  proposal: AIReqRequirementGroup,
  reason: string,
  original: boolean,
): void {
  proposal.materialHistory ??= [];
  proposal.materialHistory.push({
    version: proposalVersion(proposal),
    reason,
    changedAt: new Date().toISOString(),
    materials: structuredClone(materialsFor(state, proposal)),
  });
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
  if (proposal.alignment?.length) {
    proposal.alignmentHistory ??= [];
    proposal.alignmentHistory.push(...proposal.alignment);
  }
  proposal.alignment = [];
  proposal.confirmation = undefined;
  if (proposal.proposalDelivery) {
    proposal.proposalDeliveryHistory ??= [];
    proposal.proposalDeliveryHistory.push(structuredClone(proposal.proposalDelivery));
    proposal.proposalDelivery = undefined;
  }
  proposal.revision += 1;
}
function replaceMaterial(
  state: AIReqWorkflowView,
  proposal: AIReqRequirementGroup,
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
  state: AIReqWorkflowView,
  projectId: string,
  releaseId: string,
  text: string,
  operation: AIReqOperationReceipt,
  suffix = "",
  sourceIrId?: string,
): AIReqRequirementGroup {
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
  state: AIReqWorkflowView,
  action: InternalWorkflowAction,
  projectId: string,
  irId: string | undefined,
  operation: AIReqOperationReceipt,
  solutionDiscussion?: string,
): string | undefined {
  const proposal = [...state.groups, ...state.drafts].find(
    (item) => item.id === irId && item.projectId === projectId,
  );
  const at = new Date().toISOString();
  switch (action.type) {
    case "createIdea": {
      if (!action.originalText.trim()) throw businessRule("请输入原始需求。");
      state.ideas.push({
        id: `idea-${state.revision}`,
        originalText: action.originalText.trim(),
        submittedBy: getEmployeeId(),
        createdAt: operation.startedAt,
        updatedAt: operation.startedAt,
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
        idea.updatedAt = operation.startedAt;
        operation.type = "修改想法";
        break;
      }
      const projects = readPrototypeProjectSettings().projects;
      const targets = new Set<string>();
      if (!action.targets.length) throw businessRule("请至少选择一个项目和版本。");
      for (const target of action.targets) {
        if (
          !projects.some((item) => item.id === target.projectId) ||
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
    case "createRelease":
      addPrototypeRelease({
        id: `demo-release-${state.revision}`,
        projectId,
        title: action.title.trim(),
        createdAt: at,
      });
      state.releases = readPrototypeProjectReleases();
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
      action.originalTexts
        .map((text) => text.trim())
        .filter(Boolean)
        .forEach((text, index) => {
          const item = createProposal(
            state,
            projectId,
            action.releaseId,
            text,
            operation,
            `-${index + 1}`,
          );
          operation.irIds!.push(item.id);
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
    case "retrySrBranch": {
      const sr = state.srs.find(
        (item) => item.projectId === projectId && item.irId === irId && item.id === action.srId,
      )!;
      if (sr.trackingBranch?.status === "ready") break;
      const internal = proposal! as InternalRequirementGroup;
      const nextFailure = internal.branchCreationFailures?.includes(sr.id);
      internal.branchCreationFailures = internal.branchCreationFailures?.filter(
        (id) => id !== sr.id,
      );
      sr.trackingBranch = {
        name: `sr/${sr.id}`,
        baseCommit: proposal!.merge!.commit,
        createdAt: at,
        pushedAt: nextFailure ? "" : at,
        status: nextFailure ? "failed" : "ready",
        ...(nextFailure ? { error: "本次创建开发分支失败，请重试。" } : {}),
      };
      break;
    }
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
      operation.deletion = {
        version: 1,
        operationId: operation.operationId,
        deletedAt: at,
        manualCloseNeeded: false,
      };
      break;
    case "acceptProposal": {
      const review = proposal!.originalReview!;
      review.passed = true;
      review.humanDecision = { employeeId: getEmployeeId(), decidedAt: at, reviewId: review.id };
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
    case "runRequirementsReview":
    case "runFullReview": {
      const kind = action.type === "runFullReview" ? "full" : "original";
      const prior = kind === "original" ? proposal!.originalReview : proposal!.review;
      if (prior) {
        const history =
          kind === "original"
            ? (proposal!.originalReviewHistory ??= [])
            : (proposal!.reviewHistory ??= []);
        history.push(structuredClone(prior));
      }
      proposal!.revision += 1;
      const scenario = (proposal! as InternalRequirementGroup).reviewScenarios?.[kind] ?? "normal";
      const review = createPrototypeRequirementsReview(
        proposal!,
        getEmployeeId(),
        false,
        kind,
        scenario,
      );
      // “下一次”仅在本轮评审成功接纳的同一事务中消费；读取和旧结果释放不改变该输入。
      delete (proposal! as InternalRequirementGroup).reviewScenarios?.[kind];
      if (kind === "original") proposal!.originalReview = review;
      else {
        proposal!.review = review;
        proposal!.alignmentHistory ??= [];
        proposal!.alignmentHistory.push(...(proposal!.alignment ?? []));
        proposal!.alignment = [];
        proposal!.confirmation = undefined;
        if (proposal!.proposalDelivery) {
          proposal!.proposalDeliveryHistory ??= [];
          proposal!.proposalDeliveryHistory.push(structuredClone(proposal!.proposalDelivery));
        }
        proposal!.proposalDelivery = undefined;
      }
      if (scenario === "hold") {
        const internal = proposal! as InternalRequirementGroup;
        internal.heldReviews ??= [];
        internal.heldReviews.push(structuredClone(review));
      }
      const sessions = prototypeReviewSessions(review);
      proposal!.sessions.push(...sessions);
      state.sessions.push(...sessions);
      operation.type = kind === "original" ? "原始需求评审" : "完整材料评审";
      break;
    }
    case "approveFullReview":
      proposal!.review!.passed = true;
      // 新操作编号也不能重写同一轮首次人工放行的来源；版本门禁仍由命令接纳入口执行。
      proposal!.review!.humanDecision ??= {
        employeeId: getEmployeeId(),
        decidedAt: at,
        reviewId: proposal!.review!.id,
      };
      break;
    case "confirmAlignment":
      proposal!.alignment ??= [];
      if (
        !proposal!.alignment.some(
          (entry) => entry.perspective === action.perspective && entry.version === action.version,
        )
      )
        proposal!.alignment.push({
          perspective: action.perspective,
          version: action.version,
          employeeId: getEmployeeId(),
          confirmedAt: at,
        });
      break;
    case "generateRequirements":
    case "supplementRequirements": {
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
      const existing = materialsFor(state, proposal!).find(
        (item) => item.path === proposal!.documentPath,
      );
      const material = existing
        ? structuredClone(existing)
        : requirementMaterials(projectId, proposal!.id, proposal!.title, [])[0]!;
      material.content = `${material.content ?? ""}${existing ? "" : `\n\n## 原始短需求\n${proposal!.originalText}`}\n\n## 业务澄清\n${action.note.trim()}`;
      material.size = new TextEncoder().encode(material.content).length;
      replaceMaterial(state, proposal!, material);
      proposal!.proposalStage = "requirements";
      proposal!.status = "draft";
      if (proposal!.proposalSolution) proposal!.proposalSolution.valid = false;
      if (proposal!.returnFeedback) proposal!.returnFeedback.resumedAt = at;
      proposal!.requirementSupplements ??= [];
      proposal!.requirementSupplements.push({
        note: action.note.trim(),
        employeeId: getEmployeeId(),
        createdAt: at,
      });
      snapshot(state, proposal!);
      break;
    }
    case "generateProposalSolution": {
      invalidate(
        state,
        proposal!,
        "SR 方案、拆分、依赖或测试材料发生变化，完整审查与三方确认失效",
        false,
      );
      if (!proposal!.srIds.length) {
        const rows = ["业务操作与结果展示", "异常处理与恢复"].map((title, index) => {
          const row = systemRequirement(
            projectId,
            proposal!.id,
            `sr-${proposal!.id}-${index + 1}`,
            `${proposal!.title} · ${title}`,
          );
          row.developerEmployeeId = proposal!.contacts?.development;
          row.testingEmployeeId = proposal!.contacts?.testing;
          return row;
        });
        proposal!.srIds = rows.map((row) => row.id);
        state.srs.push(...rows);
      }
      const rows = state.srs.filter((row) => row.projectId === projectId && row.irId === irId);
      for (const material of requirementMaterials(
        projectId,
        proposal!.id,
        proposal!.title,
        rows,
      ).filter((item) => item.kind !== "ir")) {
        material.content += `\n\n## 本轮方案讨论\n${solutionDiscussion ?? ""}`;
        material.size = new TextEncoder().encode(material.content).length;
        replaceMaterial(state, proposal!, material);
      }
      const dependency = prototypeProposalDependencies(proposal!, rows, solutionDiscussion);
      replaceMaterial(state, proposal!, dependency);
      proposal!.srDependencyFile = dependency;
      const summary = prototypeProposalSolution(proposal!, solutionDiscussion);
      replaceMaterial(state, proposal!, summary);
      proposal!.proposalSolution = {
        path: summary.path,
        employeeId: getEmployeeId(),
        generatedAt: at,
        round: proposal!.proposalRound ?? 1,
        valid: true,
      };
      proposal!.status = "solution-ready";
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
        );
      invalidate(
        state,
        proposal!,
        `${action.target === "test-plan" ? "测试方案" : "SR 方案"}修改，整包批准与三方确认失效`,
        false,
      );
      for (const material of materialsFor(state, proposal!).filter((item) =>
        action.target === "test-plan"
          ? item.path.endsWith("/test-plan.md")
          : item.path.endsWith("/design.md"),
      )) {
        material.content = `${material.content ?? ""}\n\n## 修订\n${action.note.trim()}`;
        material.size = new TextEncoder().encode(material.content).length;
        Object.assign(material, contentVersion(material.content ?? ""));
      }
      snapshot(state, proposal!);
      break;
    }
    case "returnProposal":
      proposal!.proposalStage = "requirements";
      proposal!.status = "draft";
      proposal!.returnFeedbackHistory ??= [];
      if (proposal!.returnFeedback) proposal!.returnFeedbackHistory.push(proposal!.returnFeedback);
      proposal!.returnFeedback = {
        employeeId: getEmployeeId(),
        returnedAt: at,
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
    case "confirmProposal":
      if (proposal!.proposalDelivery) {
        proposal!.proposalDeliveryHistory ??= [];
        proposal!.proposalDeliveryHistory.push(structuredClone(proposal!.proposalDelivery));
      }
      proposal!.proposalDelivery = {
        candidate: `sample-proposal-${state.revision}`,
        version: proposalVersion(proposal!),
        files: structuredClone(proposal!.files),
        confirmedBy: getEmployeeId(),
        confirmedAt: at,
      };
      proposal!.confirmation = {
        operationId: operation.operationId,
        snapshotDigest: proposal!.snapshot!.digest,
        confirmedAt: at,
      };
      proposal!.requirementsPr = undefined;
      break;
    case "publishProposal": {
      const delivery = proposal!.proposalDelivery!;
      if (
        delivery.pushedCandidate === action.candidate &&
        proposal!.requirementsPr?.number &&
        delivery.prCandidate === action.candidate
      ) {
        operation.type = "复用当前版本的文档 PR，不重复推送或创建";
        break;
      }
      delivery.branch ??= {
        name: readPrototypeProposalPrHandoff(proposal!).branch,
        baseCommit: prototypeDefaultCommit(state, projectId),
        createdAt: at,
        pushedAt: at,
      };
      delivery.pushedCandidate = action.candidate;
      delivery.pushedAt = at;
      ensurePrototypeProposalMr(proposal!);
      (delivery as InternalProposalDelivery).mergeScenario = "unmerged";
      delivery.mergeCheck = {
        status: "waiting",
        message: "文档 PR 等待合并，核验当前版本材料后转正。",
      };
      proposal!.status = "requirements-pr";
      break;
    }
    case "closeProposalPr":
      proposal!.requirementsPr!.status = "closed";
      proposal!.proposalDeliveryHistory ??= [];
      proposal!.proposalDeliveryHistory.push(structuredClone(proposal!.proposalDelivery!));
      proposal!.proposalDelivery = undefined;
      proposal!.confirmation = undefined;
      proposal!.status = "solution-ready";
      break;
  }
  return irId;
}
