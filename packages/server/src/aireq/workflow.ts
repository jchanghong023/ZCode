import {
  AIREQ_ROLE_ADMINISTRATOR,
  hasProjectRole,
  type AIReqCommand,
  type AIReqCommandTarget,
  type AIReqMaterialReadRequest,
  type AIReqNativeSessionRef,
  type AIReqWorkflowResult,
  type AIReqWorkflowTarget,
  type AIReqWorkflowView,
  type AIReqWorkspace,
} from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import type { WorkflowState } from "./workflow-state.js";
import { createPrototypeEvent } from "./events.js";
import {
  projectNativeContext,
  projectDirectory,
  projectReceipt,
  projectReleases,
  projectRequirement,
  projectSummary,
  projectSystemRequirement,
  readProjectWorkspace,
  readProjectWorkspaces,
} from "./workflow-queries.js";
import {
  prototypeMaterialIssue,
  readPrototypeMaterial,
  retryPrototypeMaterialRead,
} from "./recovery.js";
import { currentIdentity, getEmployeeId, isEmployeeId } from "./identity.js";
import { readPrototypeProjectSetting, readPrototypeProjectSettings } from "./project-settings.js";
import { readPrototypeProjectReleases } from "./project-releases.js";
import { DEFAULT_SELECTION, receipt } from "./fixture-builders.js";
import { applyProposalMutation } from "./proposal-mutations.js";
import { stageNativeDocuments } from "./native-documents.js";
import { confirmDocumentVersion, saveDocumentChanges } from "./document-versions.js";
import { validateDocumentVersion } from "./document-validation.js";
import { acceptDocumentReview, type DocumentReviewRun } from "./document-review.js";
import { createPrototypeWorkflow } from "./fixtures.js";

export { DEFAULT_SELECTION } from "./fixture-builders.js";
let state = createPrototypeWorkflow();
export const prototypeWorkflowChanges = createPrototypeEvent<void>();

/** 同一个业务 owner 的事务入口；失败或未产生变更时保留原工作流。 */
function mutatePrototypeWorkflow(update: (next: WorkflowState) => boolean): void {
  const next = structuredClone(state);
  next.revision += 1;
  if (!update(next)) return;
  state = next;
  prototypeWorkflowChanges.fire();
}

export function readPrototypeWorkflowRevision(): number {
  return state.revision;
}

export function validatePrototypeDocumentVersion({
  projectId,
  irId,
}: {
  projectId: string;
  irId: string;
}) {
  const requirement = state.requirements.find(
    (item) => item.projectId === projectId && item.id === irId,
  );
  if (!requirement) throw businessRule("当前项目不存在该需求。");
  requireSolutionAccess(projectId);
  return validateDocumentVersion(state, requirement);
}

export function readPrototypeNativeContext(sessionId: string) {
  return projectNativeContext(state, sessionId);
}

export function readPrototypeProjectDirectory() {
  return projectDirectory(state, canAccessSolution);
}
export function readPrototypeProjectWorkspace(projectId?: string) {
  return readProjectWorkspace(projectId);
}
export function readPrototypeProjectWorkspaces(): Record<string, AIReqWorkspace> {
  return readProjectWorkspaces();
}
export function notifyPrototypeProjectSettingsChanged(): void {
  mutatePrototypeWorkflow((next) => {
    next.projects = readPrototypeProjectSettings().projects;
    return true;
  });
}

export function canAccessSolution(projectId: string): boolean {
  return (
    hasProjectRole(state, projectId, getEmployeeId(), "development") ||
    hasProjectRole(state, projectId, getEmployeeId(), "testing")
  );
}

export function requireSolutionAccess(projectId: string): void {
  if (!canAccessSolution(projectId)) throw businessRule("此操作需要当前项目的开发或测试角色。");
}

export function getPrototypeWorkflow(
  selection: AIReqWorkflowTarget = DEFAULT_SELECTION,
): AIReqWorkflowView {
  const projectId = selection.projectId ?? DEFAULT_SELECTION.projectId;
  const requirements = state.requirements.filter((item) => item.projectId === projectId);
  const irIds = new Set(requirements.map((item) => item.id));
  const solution = projectId !== undefined && canAccessSolution(projectId);
  return {
    revision: state.revision,
    documentFormats: state.documentFormats,
    ideas: state.ideas,
    roleAdministrator: getEmployeeId() === AIREQ_ROLE_ADMINISTRATOR,
    projectRoleMembers: state.projectRoleMembers,
    projects: state.projects.map(projectSummary),
    releases: projectReleases(state, readPrototypeProjectReleases()),
    requirements: requirements.map((item) => projectRequirement(item, solution)),
    srs: state.srs.filter((item) => item.projectId === projectId).map(projectSystemRequirement),
    materials: state.materials
      .filter((item) => item.projectId === projectId)
      .map(readPrototypeMaterial),
    operations: state.operations
      .filter(
        (item) =>
          (!item.irId && !item.irIds?.length) ||
          (item.irId !== undefined && irIds.has(item.irId)) ||
          item.irIds?.some((irId) => irIds.has(irId)),
      )
      .map(projectReceipt),
  };
}

export function resolvePrototypeSession(
  view: Pick<AIReqWorkflowView, "requirements">,
  selection: AIReqWorkflowTarget,
): AIReqNativeSessionRef | undefined {
  if (!selection.irId || selection.srId) return;
  const projectId = selection.projectId ?? DEFAULT_SELECTION.projectId;
  return view.requirements
    .find((item) => item.projectId === projectId && item.id === selection.irId)
    ?.sessions.find((item) => item.phase === (selection.discussionPhase ?? "requirements"));
}

export function retryPrototypeWorkflowMaterial(request: AIReqMaterialReadRequest): boolean {
  const { projectId, releaseId, irId, path, sha256 } = request;
  const requirement = state.requirements.find(
    (item) => item.projectId === projectId && item.releaseId === releaseId && item.id === irId,
  );
  const material =
    requirement &&
    state.materials.find(
      (item) => item.projectId === projectId && item.irId === irId && item.path === path,
    );
  if (!material) throw businessRule("材料不属于当前需求版本。");
  if (material.sha256 !== sha256) throw businessRule("材料版本已变化，请重新读取当前版本。");
  const hadReadIssue = prototypeMaterialIssue(material);
  const recovered = retryPrototypeMaterialRead(material);
  if (recovered && hadReadIssue) prototypeWorkflowChanges.fire();
  return recovered;
}

export function preparePrototypeNativeDocuments(sessionId: string, text: string) {
  const context = projectNativeContext(state, sessionId);
  if (!context) throw businessRule("会话不属于当前需求。");
  return stageNativeDocuments(state, context.requirement, context.ref.phase, text);
}

export function commitPrototypeNativeDocuments(
  sessionId: string,
  output: NonNullable<ReturnType<typeof preparePrototypeNativeDocuments>>,
): boolean {
  let changed = false;
  mutatePrototypeWorkflow((next) => {
    const context = projectNativeContext(next, sessionId);
    if (!context || context.ref.phase !== output.agent) throw businessRule("会话不属于当前需求。");
    changed = saveDocumentChanges(next, context.requirement, output);
    return changed;
  });
  return changed;
}

export function settlePrototypeDocumentReview(
  run: DocumentReviewRun,
  status: "completed" | "failed",
  report: string,
): boolean {
  let stale = false;
  mutatePrototypeWorkflow((next) => {
    const review = next.requirements
      .find((item) => item.projectId === run.projectId && item.id === run.irId)
      ?.documentReviews.find(({ id }) => id === run.id);
    if (!review || review.status !== "running") return false;
    review.status = status;
    review.report = report;
    stale = review.stale;
    return true;
  });
  return stale;
}

/** Validate and commit a business command in the single workflow owner. */
export function applyPrototypeAction(
  action: AIReqCommand,
  selection: AIReqCommandTarget,
): { result: AIReqWorkflowResult; review?: DocumentReviewRun } {
  if (action.type === "createProposal" || action.type === "importProposals") {
    const projectId = action.projectId ?? selection.projectId;
    if (
      !projectId ||
      !readPrototypeProjectReleases(projectId).some((release) => release.id === action.releaseId)
    )
      throw businessRule("请选择明确项目和有效 Release。");
    if (
      action.type === "createProposal" &&
      (typeof action.originalText !== "string" || !action.originalText.trim())
    )
      throw businessRule("请输入原始需求。");
    if (
      action.type === "importProposals" &&
      (!Array.isArray(action.proposals) ||
        !action.proposals.length ||
        action.proposals.some(
          (entry) =>
            !entry ||
            typeof entry.originalText !== "string" ||
            !entry.originalText.trim() ||
            (entry.businessDocument !== undefined &&
              (typeof entry.businessDocument !== "string" ||
                !entry.businessDocument.trim() ||
                new TextEncoder().encode(entry.businessDocument).length > 1_048_576)),
        ))
    )
      throw businessRule("导入正文无效，本批未写入任何提案。");
    if (action.type === "createProposal" && action.clientDraftId) {
      const existing = state.requirements.find(
        (item) =>
          item.projectId === projectId &&
          item.releaseId === action.releaseId &&
          item.clientDraftId === action.clientDraftId &&
          item.submittedBy === getEmployeeId(),
      );
      if (existing && existing.originalText !== action.originalText.trim())
        throw businessRule("同一草稿操作身份不能提交不同原始需求。");
    }
  }
  if (action.type === "createRelease") {
    const projectId = action.projectId ?? selection.projectId;
    if (!state.projects.some((item) => item.id === projectId))
      throw businessRule("请选择已有项目。");
    if (!action.title.trim()) throw businessRule("请输入 Release 名称。");
    if (
      readPrototypeProjectReleases(projectId).some(
        (item) => item.title.toLowerCase() === action.title.trim().toLowerCase(),
      )
    ) {
      throw businessRule("此项目中已存在同名 Release，请使用其他名称。");
    }
  }
  const targetProjectId =
    action.projectId ?? selection.projectId ?? DEFAULT_SELECTION.projectId ?? "";
  const requirement = state.requirements.find(
    (item) => item.projectId === targetProjectId && item.id === (action.irId ?? selection.irId),
  );
  if (action.type === "addProjectRoleMember" || action.type === "removeProjectRoleMember") {
    if (getEmployeeId() !== AIREQ_ROLE_ADMINISTRATOR)
      throw businessRule("只有管理员可以修改项目角色名单。");
    if (!readPrototypeProjectSetting(action.projectId) || !isEmployeeId(action.employeeId))
      throw businessRule("请选择已有项目并输入有效工号。");
    if (action.employeeId === AIREQ_ROLE_ADMINISTRATOR)
      throw businessRule("管理员已拥有所有项目的开发和测试权限。");
    const exists = state.projectRoleMembers.some(
      (entry) =>
        entry.projectId === action.projectId &&
        entry.employeeId === action.employeeId &&
        entry.role === action.role,
    );
    if (action.type === "addProjectRoleMember" && exists)
      throw businessRule("该工号已在当前角色名单中。");
    if (action.type === "removeProjectRoleMember" && !exists)
      throw businessRule("该工号已不在当前角色名单中，请重新读取。");
  }
  if (
    action.type === "deleteRequirement" ||
    action.type === "reviewDocuments" ||
    action.type === "confirmDocumentVersion"
  ) {
    if (!requirement) throw businessRule("当前项目不存在该需求。");
    if (
      action.type === "deleteRequirement" &&
      (requirement.documentVersion?.confirmation || requirement.documentHistory.length)
    )
      throw businessRule("已有确认版本的需求须保留材料与历史。");
    if (
      action.type === "confirmDocumentVersion" ||
      (action.type === "reviewDocuments" && action.agent === "solution")
    )
      requireSolutionAccess(targetProjectId);
  }
  const global = [
    "createIdea",
    "importIdeas",
    "updateIdea",
    "transferIdea",
    "saveDocumentFormats",
    "addProjectRoleMember",
    "removeProjectRoleMember",
    "createRelease",
    "importProposals",
  ].includes(action.type);
  let irId = global ? undefined : (action.irId ?? selection.irId);
  const operation = receipt(action.type, state.revision + 1, irId, new Date().toISOString());
  operation.operationId = action.operationId;
  const identity = currentIdentity();
  if (identity) operation.identity = { ...identity };
  if (
    action.type === "confirmDocumentVersion" &&
    requirement &&
    !requirement.documentVersion?.confirmation
  ) {
    // 接纳与定版在同一个同步 owner 内完成。预检查只用于展示，提交仍检查实际写入的文件。
    const documentValidation = validateDocumentVersion(state, requirement);
    if (documentValidation.issues.length) {
      operation.status = "failed";
      operation.error = "文档检查未通过，请修正后重新检查。";
      operation.revision = state.revision;
      return {
        result: {
          projectId: targetProjectId,
          irId,
          receipt: projectReceipt(operation),
          documentValidation,
        },
      };
    }
  }
  let review: DocumentReviewRun | undefined;
  mutatePrototypeWorkflow((next) => {
    if (action.type === "reviewDocuments" || action.type === "confirmDocumentVersion") {
      const target = next.requirements.find(
        (item) => item.projectId === targetProjectId && item.id === irId,
      )!;
      if (action.type === "reviewDocuments") {
        review = acceptDocumentReview(
          next,
          target,
          action.agent,
          getEmployeeId(),
          operation.startedAt,
        );
      } else {
        confirmDocumentVersion(next, target, getEmployeeId(), operation.startedAt);
      }
    } else {
      irId = applyProposalMutation(next, action, targetProjectId, irId, operation);
    }
    next.operations.push(operation);
    return true;
  });
  return {
    review,
    result: {
      projectId: targetProjectId,
      irId,
      receipt: projectReceipt(operation),
      transferredRequirements:
        action.type === "transferIdea"
          ? action.targets.map((target, index) => ({ ...target, irId: operation.irIds![index]! }))
          : undefined,
      ...(action.type === "saveDocumentFormats" && {
        documentFormatSnapshot: {
          documentFormats: state.documentFormats,
          revision: state.revision,
        },
      }),
    },
  };
}
