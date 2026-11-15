import type {
  AIReqWorkflowView,
  AIReqWorkflowCommand,
  AIReqOperationReceipt,
} from "@zcode/services/aireq";
import { proposalVersion } from "@zcode/services/aireq";
import { group, systemRequirement, sessionRef } from "./fixture-builders.js";
import { getEmployeeId } from "./identity.js";
import { readPrototypeProjectReleases, addPrototypeRelease } from "./project-releases.js";
import { prototypeProposalDependencies, prototypeProposalSolution } from "./proposal-flow.js";
import { requirementMaterials } from "./materials.js";
import {
  createPrototypeRequirementsReview,
  prototypeReviewSessions,
} from "./requirements-review.js";
import { ensurePrototypeProposalMr } from "./proposal-delivery.js";
import { readPrototypeProposalPrHandoff } from "./proposal-pr-handoff.js";
import { prototypeDefaultCommit } from "./fixture-builders.js";
type AIReqAction = AIReqWorkflowCommand extends infer C
  ? C extends AIReqWorkflowCommand
    ? Omit<C, "operationId" | "expectedRevision">
    : never
  : never;
/** Mutates only the transaction state supplied by the workflow owner. */
export function applyProposalMutation(
  state: AIReqWorkflowView,
  action: AIReqAction,
  projectId: string,
  irId: string | undefined,
  operation: AIReqOperationReceipt,
  solutionDiscussion?: string,
): string | undefined {
  const currentGroup = [...state.groups, ...state.drafts].find(
    (item) => item.id === irId && item.projectId === projectId,
  );
  switch (action.type) {
    case "createRelease":
      addPrototypeRelease({
        id: `demo-release-${state.revision}`,
        projectId,
        title: action.title.trim(),
        createdAt: new Date().toISOString(),
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
              item.proposalLocation?.employeeId === getEmployeeId(),
          )
        : undefined;
      if (existing) {
        irId = existing.id;
        operation.irId = irId;
        break;
      }
      irId = `draft-demo-${state.revision}`;
      const item = group(projectId, irId, "新需求提案（样例）", [], true, getEmployeeId());
      item.origin = "browser";
      item.createdAt = new Date().toISOString();
      item.clientDraftId = action.clientDraftId;
      item.pendingFirstMessage = Boolean(action.clientDraftId);
      if (item.pendingFirstMessage) item.title = "未发送草稿";
      item.releaseId = action.releaseId;
      if (action.preparedSessionId) {
        // 首发沿用原生预热会话，附件字节与命令收据的会话归属不能迁移。
        item.sessions = [
          sessionRef(projectId, irId, "requirements", undefined, action.preparedSessionId),
        ];
      }
      state.drafts.push(item);
      state.sessions.push(...item.sessions);
      if (!item.pendingFirstMessage)
        state.materials.push(...requirementMaterials(projectId, irId, item.title, []));
      operation.irId = irId;
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
        deletedAt: new Date().toISOString(),
        manualCloseNeeded: false,
      };
      break;
    case "acceptProposal": {
      currentGroup!.review!.passed = true;
      currentGroup!.review!.humanDecision = {
        employeeId: getEmployeeId(),
        decidedAt: new Date().toISOString(),
        reviewId: currentGroup!.review!.id,
      };
      currentGroup!.proposalStage = "solution";
      currentGroup!.developerHandoff ??= {
        employeeId: getEmployeeId(),
        submittedAt: new Date().toISOString(),
      };
      currentGroup!.developerAcceptance = {
        employeeId: getEmployeeId(),
        acceptedAt: new Date().toISOString(),
        round: currentGroup!.proposalRound ?? 1,
      };
      if (
        !currentGroup!.sessions.some(
          (item) => item.phase === "solution" && item.round === (currentGroup!.proposalRound ?? 1),
        )
      ) {
        const session = sessionRef(
          projectId,
          currentGroup!.id,
          "solution",
          undefined,
          undefined,
          currentGroup!.proposalRound ?? 1,
        );
        currentGroup!.sessions.push(session);
        state.sessions.push(session);
      }
      operation.type = `由 ${getEmployeeId()} 人工通过当前综合意见并进入技术方案（原型）`;
      break;
    }
    case "runRequirementsReview": {
      if (currentGroup!.review) {
        currentGroup!.reviewHistory ??= [];
        currentGroup!.reviewHistory.push(structuredClone(currentGroup!.review));
      }
      currentGroup!.revision += 1;
      currentGroup!.review = createPrototypeRequirementsReview(currentGroup!, getEmployeeId());
      const reviewers = prototypeReviewSessions(currentGroup!.review);
      currentGroup!.sessions.push(...reviewers);
      state.sessions.push(...reviewers);
      operation.type =
        "三模型并行评审后由第四个 Agent 综合意见，等待人工判断（固定样例，未调用模型）";
      break;
    }
    case "generateRequirements":
    case "supplementRequirements": {
      const proposal = currentGroup!;
      const note = action.note.trim();
      if (action.type === "generateRequirements") {
        proposal.title = note.split("\n")[0]!.slice(0, 60);
        const rows = ["业务操作与结果展示", "异常处理与恢复"].map((title, index) =>
          systemRequirement(
            projectId,
            proposal.id,
            `sr-${proposal.id}-${index + 1}`,
            `${proposal.title} · ${title}`,
          ),
        );
        proposal.srIds = rows.map((row) => row.id);
        state.srs.push(...rows);
        state.materials = state.materials.filter(
          (item) => item.projectId !== projectId || item.irId !== irId || item.kind !== "ir",
        );
        state.materials.push(...requirementMaterials(projectId, proposal.id, proposal.title, rows));
      }
      proposal.proposalRound = (proposal.proposalRound ?? 1) + 1;
      if (action.type === "supplementRequirements") {
        proposal.requirementSupplements ??= [];
        proposal.requirementSupplements.push({
          note,
          employeeId: getEmployeeId(),
          createdAt: new Date().toISOString(),
          round: proposal.proposalRound,
        });
        if (proposal.returnFeedback && !proposal.returnFeedback.resumedAt)
          proposal.returnFeedback.resumedAt = new Date().toISOString();
      }
      proposal.developerHandoff = undefined;
      proposal.developerAcceptance = undefined;
      proposal.confirmation = undefined;
      proposal.revision += 1;
      if (proposal.proposalSolution) proposal.proposalSolution.valid = false;
      if (proposal.srDependencyFile) proposal.srDependencyFile.valid = false;
      const materials = state.materials.filter(
        (item) => item.projectId === projectId && item.irId === irId,
      );
      for (const material of materials) {
        if (material.kind === "solution") material.valid = false;
        if (material.kind !== "ir" && material.kind !== "sr") continue;
        material.content = `${material.content ?? ""}\n\n## ${action.type === "generateRequirements" ? "业务需求描述" : "业务补充"}（原型演示）\n${note}`;
        material.size = new TextEncoder().encode(material.content).length;
        material.sha256 = `sample:${material.path}:revision-${proposal.revision}`;
      }
      proposal.files = materials.map(({ path, sha256, size }) => ({ path, sha256, size }));
      proposal.snapshot = {
        version: 1,
        projectId,
        irId: proposal.id,
        title: proposal.title,
        documentPath: proposal.documentPath,
        srs: state.srs
          .filter((row) => row.projectId === projectId && row.irId === irId)
          .map(({ id, title, documentPath }) => ({ id, title, documentPath })),
        files: structuredClone(
          proposal.files.filter(
            (file) =>
              file.path !== proposal.proposalSolution?.path &&
              file.path !== proposal.srDependencyFile?.path,
          ),
        ),
        digest: `sample-digest:${projectId}:${irId}:revision-${proposal.revision}`,
      };
      operation.type =
        action.type === "generateRequirements"
          ? "根据输入生成 IR 与两个 SR（固定模板演示，未调用模型）"
          : `由 ${getEmployeeId()} 补充 IR／SR，旧评审与方案需重新确认（原型）`;
      break;
    }
    case "generateProposalSolution": {
      const dependencyFile = prototypeProposalDependencies(
        currentGroup!,
        state.srs.filter((sr) => sr.projectId === projectId && sr.irId === irId),
        solutionDiscussion,
      );
      dependencyFile.sha256 = `sample:${dependencyFile.path}:revision-${state.revision}`;
      currentGroup!.srDependencyFile = dependencyFile;
      const material = prototypeProposalSolution(currentGroup!, solutionDiscussion);
      material.sha256 = `sample:${material.path}:revision-${state.revision}`;
      currentGroup!.proposalSolution = {
        path: material.path,
        employeeId: getEmployeeId(),
        generatedAt: new Date().toISOString(),
        round: currentGroup!.proposalRound ?? 1,
        valid: true,
        requirementsDigest: currentGroup!.snapshot?.digest,
      };
      currentGroup!.status = "solution-ready";
      currentGroup!.confirmation = undefined;
      state.materials = state.materials.filter(
        (item) => item.projectId !== projectId || item.irId !== irId || item.kind !== "solution",
      );
      state.materials.push(material, dependencyFile);
      currentGroup!.files = [
        ...currentGroup!.files.filter(
          (item) => item.path !== material.path && item.path !== dependencyFile.path,
        ),
        ...[material, dependencyFile].map(({ path, sha256, size }) => ({ path, sha256, size })),
      ];
      operation.type = "方案 Agent 对话完成，同步技术方案、SR 依赖及工期预估（内存原型）";
      break;
    }
    case "returnProposal": {
      currentGroup!.proposalStage = "requirements";
      currentGroup!.status = "draft";
      currentGroup!.proposalRound = (currentGroup!.proposalRound ?? 1) + 1;
      currentGroup!.developerAcceptance = undefined;
      currentGroup!.developerHandoff = undefined;
      currentGroup!.confirmation = undefined;
      if (currentGroup!.returnFeedback) {
        currentGroup!.returnFeedbackHistory ??= [];
        currentGroup!.returnFeedbackHistory.push(structuredClone(currentGroup!.returnFeedback));
      }
      currentGroup!.returnFeedback = {
        employeeId: getEmployeeId(),
        returnedAt: new Date().toISOString(),
        reason: action.reason.trim(),
      };
      if (currentGroup!.proposalSolution) currentGroup!.proposalSolution.valid = false;
      if (currentGroup!.srDependencyFile) currentGroup!.srDependencyFile.valid = false;
      state.materials
        .filter(
          (item) => item.projectId === projectId && item.irId === irId && item.kind === "solution",
        )
        .forEach((item) => {
          item.valid = false;
        });
      operation.type = "开发粘贴待处理意见，直接返回业务 Agent 补充（原型）";
      break;
    }
    case "confirmProposal": {
      const proposal = currentGroup!;
      if (proposal.proposalDelivery) {
        proposal.proposalDeliveryHistory ??= [];
        proposal.proposalDeliveryHistory.push(structuredClone(proposal.proposalDelivery));
      }
      proposal.proposalDelivery = {
        candidate: `sample-proposal-${state.revision}`,
        version: proposalVersion(proposal),
        files: structuredClone(proposal.files),
        confirmedBy: getEmployeeId(),
        confirmedAt: new Date().toISOString(),
      };
      proposal.confirmation = {
        operationId: operation.operationId,
        snapshotDigest: proposal.snapshot!.digest,
        confirmedAt: proposal.proposalDelivery.confirmedAt,
      };
      proposal.requirementsPr = undefined;
      operation.type = "人工确认当前 IR／全部 SR／方案版本（演示）";
      break;
    }
    case "publishProposal": {
      const group = currentGroup!;
      const delivery = group.proposalDelivery!;
      if (
        delivery.pushedCandidate === action.candidate &&
        group.requirementsPr?.number &&
        delivery.prCandidate === action.candidate
      ) {
        operation.type = "当前候选已有 MR，复用既有记录，不重复创建（内存演示）";
        break;
      }
      const at = new Date().toISOString();
      delivery.branch ??= {
        name: readPrototypeProposalPrHandoff(group).branch,
        baseCommit: prototypeDefaultCommit(state, projectId),
        createdAt: at,
        pushedAt: at,
      };
      delivery.pushedCandidate = action.candidate;
      delivery.pushedAt = at;
      ensurePrototypeProposalMr(group);
      delivery.mergeScenario = "unmerged";
      delivery.mergeCheck = {
        status: "waiting",
        nextCheckAt: new Date(Date.now() + 5000).toISOString(),
        message:
          "分支已推送并自动创建 MR，等待人工评审合并；后台定时核验，不需要登记地址或人工通知。",
      };
      group.status = "requirements-pr";
      operation.type = "确认材料后创建分支、提交推送、自动创建 MR 并开始后台定时核验（内存演示）";
      break;
    }
  }
  return irId;
}
