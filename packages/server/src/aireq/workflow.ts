import {
  AIREQ_ROLE_ADMINISTRATOR,
  fileVersions,
  hasProjectRole,
  type AIReqCommand,
  type AIReqCommandTarget,
  type AIReqMaterialReadRequest,
  type AIReqNativeSessionRef,
  type AIReqObjectRef,
  type AIReqOperationReceipt,
  type AIReqWorkflowResult,
  type AIReqWorkflowTarget,
  type AIReqWorkflowView,
  type AIReqWorkspace,
} from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import type {
  NativeDocumentOutput,
  Project,
  RequirementGroup,
  WorkflowState,
} from "./workflow-state.js";
import { createPrototypeEvent } from "./events.js";
import {
  projectNativeContext,
  projectDirectory,
  projectRequirementSummaries,
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
import { getEmployeeId, isEmployeeId } from "./identity.js";
import {
  readPrototypeProjectSetting,
  readPrototypeProjectSettings,
  syncPrototypeProjectNames,
} from "./project-settings.js";
import { sessionRef } from "./fixture-builders.js";
import { prototypeIrRoot } from "./proposal-storage.js";
import { emptyDocumentFormats } from "./materials.js";
import {
  readCloudDragonProjects,
  cloudDragonRequirementDetails,
  type CloudDragonRequirement,
  readCloudDragonRequirements,
} from "./clouddragon.js";
import { applyProposalMutation } from "./proposal-mutations.js";
import { stageNativeDocuments } from "./native-documents.js";
import {
  confirmDocumentVersion,
  requirementMaterialsFor,
  saveDocumentChanges,
} from "./document-versions.js";
import {
  projectDocumentDirectory,
  publishRequirementDocuments,
  type ProjectDocumentSnapshot,
} from "./project-files.js";
import { validateDocumentVersion } from "./document-validation.js";
import { acceptDocumentReview, type DocumentReviewRun } from "./document-review.js";
import type { RequirementListSnapshot } from "./requirement-list-transfer.js";

let state: WorkflowState = {
  revision: 0,
  documentFormats: emptyDocumentFormats(),
  projects: [],
  projectRoleMembers: [],
  requirements: [],
  srs: [],
  materials: [],
};
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

async function refreshPrototypeProjects(): Promise<void> {
  const cloudProjects = await readCloudDragonProjects();
  syncPrototypeProjectNames(cloudProjects);
  const { projects } = readPrototypeProjectSettings();
  if (JSON.stringify(projects) !== JSON.stringify(state.projects))
    state = { ...state, projects, revision: state.revision + 1 };
}

async function refreshRequirements(projectId: string): Promise<CloudDragonRequirement[]> {
  const items = await readCloudDragonRequirements(projectId);
  if (!readPrototypeProjectSetting(projectId))
    throw businessRule("云龙目录已不包含此项目，请重新选择。");
  const current = state.requirements.filter((item) => item.projectId === projectId);
  const byId = new Map(current.map((item) => [item.id, item]));
  const requirements = items.map((item) => {
    const existing = byId.get(item.businessNo);
    const title = item.name.trim() || item.businessNo;
    const originalText =
      item.description
        .replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi, "\n")
        .replace(/<\/?[a-z][^>]*>/gi, "")
        .replace(/&nbsp;/gi, " ")
        .trim() || title;
    const submittedBy = item.submitter.trim() || item.creator.trim();
    const personnel = {
      delivererOwner: item.delivererOwner || undefined,
      owner: item.owner || undefined,
      seId: item.seId || undefined,
      de: item.de || undefined,
      te: item.te || undefined,
    };
    const process = item.process || undefined;
    const releaseId = item.pi?.trim() ?? "";
    const releaseName = releaseId ? item.piName?.trim() || undefined : undefined;
    const sourceDate = item.createDate.trim();
    const createdAt = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(sourceDate)
      ? sourceDate.replace(" ", "T") + "+08:00"
      : sourceDate;
    if (existing) {
      if (
        existing.title === title &&
        existing.originalText === originalText &&
        existing.sourceDescription === item.description &&
        existing.submittedBy === submittedBy &&
        existing.delivererOwner === personnel.delivererOwner &&
        existing.owner === personnel.owner &&
        existing.seId === personnel.seId &&
        existing.de === personnel.de &&
        existing.te === personnel.te &&
        existing.process === process &&
        existing.releaseId === releaseId &&
        existing.releaseName === releaseName &&
        existing.createdAt === createdAt
      )
        return existing;
      return {
        ...existing,
        title,
        originalText,
        sourceDescription: item.description,
        submittedBy,
        ...personnel,
        process,
        releaseId,
        releaseName,
        createdAt,
        revision: existing.revision + 1,
      };
    }
    return {
      id: item.businessNo,
      projectId,
      releaseId,
      releaseName,
      title,
      originalText,
      sourceDescription: item.description,
      submittedBy,
      ...personnel,
      process,
      createdAt,
      documentPath: `${prototypeIrRoot(item.businessNo)}/requirements.md`,
      revision: 1,
      srIds: [],
      sessions: [
        sessionRef(projectId, item.businessNo, "requirements"),
        sessionRef(projectId, item.businessNo, "solution"),
      ],
      documentHistory: [],
      documentReviews: [],
    };
  });
  const activeIds = new Set(requirements.map(({ id }) => id));
  // Keep local workflow records when an IR disappears from the cloud catalogue.
  const retained = current.filter(({ id }) => !activeIds.has(id));
  const active = current.filter(({ id }) => activeIds.has(id));
  if (
    active.length === requirements.length &&
    requirements.every((item, index) => item === active[index])
  )
    return items;
  state = {
    ...state,
    revision: state.revision + 1,
    requirements: state.requirements
      .filter((item) => item.projectId !== projectId)
      .concat(requirements, retained),
  };
  return items;
}

export interface PrototypeCatalogue {
  projects: Project[];
  requirements: RequirementGroup[];
  details: ReadonlyMap<string, ReadonlyMap<string, CloudDragonRequirement>>;
  failures: string[];
}

let catalogueRead: Promise<PrototypeCatalogue> | undefined;
let catalogueCompletedAt: number | undefined;
let previousCatalogue: PrototypeCatalogue | undefined;

export function readPrototypeCatalogue(): Promise<PrototypeCatalogue> {
  if (
    catalogueRead &&
    (catalogueCompletedAt === undefined || performance.now() - catalogueCompletedAt < 3_000)
  )
    return catalogueRead;
  catalogueCompletedAt = undefined;
  catalogueRead = (async () => {
    await refreshPrototypeProjects();
    const projects = state.projects;
    const projectIds = projects.map(({ id }) => id);
    const reads = await Promise.allSettled(projectIds.map(refreshRequirements));
    const details = new Map<string, ReadonlyMap<string, CloudDragonRequirement>>();
    const failures: string[] = [];
    reads.forEach((result, index) => {
      const id = projectIds[index]!;
      if (result.status === "fulfilled") {
        details.set(id, new Map(result.value.map((ir) => [ir.businessNo, ir])));
      } else {
        failures.push(id);
        const prior = previousCatalogue?.details.get(id);
        if (prior) details.set(id, prior);
      }
    });
    previousCatalogue = {
      projects,
      requirements: state.requirements.filter(({ projectId, id }) =>
        details.get(projectId)?.has(id),
      ),
      details,
      failures,
    };
    return previousCatalogue;
  })().finally(() => {
    catalogueCompletedAt = performance.now();
  });
  return catalogueRead;
}

const mergedCatalogues = new WeakMap<
  PrototypeCatalogue,
  { live: WorkflowState; merged: WorkflowState }
>();
const requirementSummaries = new WeakMap<
  WorkflowState,
  ReturnType<typeof projectRequirementSummaries>
>();

function mergeCatalogue(catalogue: PrototypeCatalogue): WorkflowState {
  const cached = mergedCatalogues.get(catalogue);
  if (cached?.live === state) return cached.merged;
  const requirementKey = (item: RequirementGroup) => JSON.stringify([item.projectId, item.id]);
  const current = new Map(state.requirements.map((item) => [requirementKey(item), item]));
  const merged = {
    ...state,
    projects: catalogue.projects.map((project) => {
      const live = readPrototypeProjectSetting(project.id);
      return live ? { ...live, name: project.name } : project;
    }),
    requirements: catalogue.requirements.map((item) => {
      const live = current.get(requirementKey(item));
      return live && live !== item
        ? {
            ...item,
            revision: live.revision,
            documentVersion: live.documentVersion,
            documentHistory: live.documentHistory,
            documentReviews: live.documentReviews,
            sessions: live.sessions,
            srIds: live.srIds,
          }
        : item;
    }),
  };
  mergedCatalogues.set(catalogue, { live: state, merged });
  return merged;
}

export function readPrototypeRequirementDetails(
  { projectId, irId }: AIReqObjectRef,
  catalogue: PrototypeCatalogue,
) {
  const item = catalogue.details.get(projectId)?.get(irId);
  if (!item) throw businessRule("当前项目不存在该需求。");
  return cloudDragonRequirementDetails(item);
}

export function capturePrototypeRequirementList(
  catalogue: PrototypeCatalogue,
): RequirementListSnapshot {
  if (catalogue.failures.length)
    throw businessRule("部分云龙项目读取失败，请刷新项目后重试全量同步。");
  const keys = (projectId: string, irId: string, path: string) =>
    JSON.stringify([projectId, irId, path]);
  const documents = new Map(
    state.materials
      .filter((file) => file.kind === "ir" && !file.srId)
      .map((file) => [keys(file.projectId, file.irId, file.path), file]),
  );
  const projects: RequirementListSnapshot["projects"] = catalogue.projects.map(({ id, name }) => ({
    projectId: id,
    projectName: name,
    requirements: [],
  }));
  const byProject = new Map(projects.map((project) => [project.projectId, project]));
  for (const item of catalogue.requirements) {
    const project = byProject.get(item.projectId);
    if (!project) continue;
    const document = documents.get(keys(item.projectId, item.id, item.documentPath));
    if (document && (!document.valid || document.content === undefined))
      throw businessRule(`需求 ${item.id} 的需求文档不可读取，请重试全量同步。`);
    project.requirements.push({
      irId: item.id,
      title: item.title,
      description: item.sourceDescription,
      releaseId: item.releaseId,
      releaseName: item.releaseName,
      submittedBy: item.submittedBy,
      delivererOwner: item.delivererOwner,
      owner: item.owner,
      seId: item.seId,
      de: item.de,
      te: item.te,
      submittedAt: item.createdAt,
      process: item.process,
      ...(document?.content === undefined ? {} : { requirementsMarkdown: document.content }),
    });
  }
  return { projects };
}

/** 异步准备新项目目录时捕获同一工作流快照，忽略其他项目和评审造成的 revision 变化。 */
export function capturePrototypeProjectDocuments(projectId: string): ProjectDocumentSnapshot {
  const read = (source: WorkflowState) =>
    source.requirements
      .filter((requirement) => requirement.projectId === projectId)
      .map((requirement) => ({
        irId: requirement.id,
        files: requirementMaterialsFor(source, requirement),
      }));
  const signature = (requirements: ReturnType<typeof read>) =>
    JSON.stringify(requirements.map(({ irId, files }) => [irId, fileVersions(files)]));
  const source = state;
  const requirements = read(source);
  const baseline = signature(requirements);
  return {
    requirements,
    isCurrent: () => source === state || signature(read(state)) === baseline,
  };
}

function currentProjectDocumentDirectory(projectId: string): string | undefined {
  const storageDirectory = readPrototypeProjectSetting(projectId)?.storageDirectory;
  return storageDirectory ? projectDocumentDirectory(storageDirectory) : undefined;
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
export function readPrototypeProjectWorkspace(projectId?: string, catalogue?: PrototypeCatalogue) {
  return readProjectWorkspace(projectId, catalogue?.projects);
}
export function readPrototypeProjectWorkspaces(
  catalogue?: PrototypeCatalogue,
): Record<string, AIReqWorkspace> {
  return readProjectWorkspaces(catalogue?.projects);
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
  selection: AIReqWorkflowTarget = {},
  catalogue?: PrototypeCatalogue,
): AIReqWorkflowView {
  const source = catalogue ? mergeCatalogue(catalogue) : state;
  const projectId = selection.projectId;
  const requirements = source.projects.some(({ id }) => id === projectId)
    ? source.requirements.filter((item) => item.projectId === projectId)
    : [];
  const requirementIds = new Set(requirements.map(({ id }) => id));
  let summaries = requirementSummaries.get(source);
  if (!summaries) {
    summaries = projectRequirementSummaries(source);
    requirementSummaries.set(source, summaries);
  }
  const solution = projectId !== undefined && canAccessSolution(projectId);
  return {
    revision: source.revision,
    documentFormats: source.documentFormats,
    roleAdministrator: getEmployeeId() === AIREQ_ROLE_ADMINISTRATOR,
    projectRoleMembers: source.projectRoleMembers,
    projects: source.projects.map(projectSummary),
    ...summaries,
    ...(catalogue?.failures.length ? { releaseReadFailures: catalogue.failures } : {}),
    requirements: requirements.map((item) => projectRequirement(item, solution)),
    srs: source.srs
      .filter((item) => item.projectId === projectId && requirementIds.has(item.irId))
      .map(projectSystemRequirement),
    materials: source.materials
      .filter((item) => item.projectId === projectId && requirementIds.has(item.irId))
      .map(readPrototypeMaterial),
  };
}

export function resolvePrototypeSession(
  view: Pick<AIReqWorkflowView, "requirements">,
  selection: AIReqWorkflowTarget,
): AIReqNativeSessionRef | undefined {
  if (!selection.irId) return;
  const projectId = selection.projectId;
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
  const agent = context.ref.phase;
  return {
    agent,
    changes: text ? stageNativeDocuments(state, context.requirement, agent, text) : undefined,
  };
}

export function commitPrototypeNativeDocuments(
  sessionId: string,
  output: NativeDocumentOutput,
): boolean {
  let changed = false;
  mutatePrototypeWorkflow((next) => {
    const context = projectNativeContext(next, sessionId);
    if (!context || context.ref.phase !== output.agent) throw businessRule("会话不属于当前需求。");
    changed = saveDocumentChanges(next, context.requirement, output);
    if (changed) {
      const documents = currentProjectDocumentDirectory(context.requirement.projectId);
      if (documents)
        publishRequirementDocuments(
          documents,
          context.requirement.id,
          requirementMaterialsFor(next, context.requirement),
        );
    }
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
  if (
    action.type === "createProposal" ||
    action.type === "createRelease" ||
    action.type === "deleteRequirement"
  )
    throw businessRule("请在云龙管理项目需求。");
  const targetProjectId = action.projectId ?? selection.projectId ?? "";
  const requirement =
    readPrototypeProjectSetting(targetProjectId) &&
    state.requirements.find(
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
  if (action.type === "reviewDocuments" || action.type === "confirmDocumentVersion") {
    if (!requirement) throw businessRule("当前项目不存在该需求。");
    if (
      action.type === "confirmDocumentVersion" ||
      (action.type === "reviewDocuments" && action.agent === "solution")
    )
      requireSolutionAccess(targetProjectId);
  }
  const global = [
    "saveDocumentFormats",
    "addProjectRoleMember",
    "removeProjectRoleMember",
  ].includes(action.type);
  const irId = global ? undefined : (action.irId ?? selection.irId);
  const at = new Date().toISOString();
  const operation: AIReqOperationReceipt = {
    operationId: action.operationId,
    actorEmployeeId: getEmployeeId(),
    type: action.type,
    status: "completed",
    startedAt: at,
    completedAt: at,
    revision: state.revision + 1,
    irId,
  };
  if (action.type === "confirmDocumentVersion" && requirement) {
    if (requirement.documentVersion?.confirmation)
      throw businessRule("当前版本已定版，不能再次确认。");
    // 同一 owner 内同步核对预检快照、复核当前规则并提交；不让旧弹窗定版其他文件。
    const documentValidation = validateDocumentVersion(state, requirement, action.snapshot);
    if (documentValidation.issues.length) {
      operation.status = "failed";
      operation.error = "文档检查未通过，请修正后重新检查。";
      operation.revision = state.revision;
      return {
        result: {
          projectId: targetProjectId,
          irId,
          receipt: operation,
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
      applyProposalMutation(next, action, targetProjectId, operation);
    }
    return true;
  });
  return {
    review,
    result: {
      projectId: targetProjectId,
      irId,
      receipt: operation,
      ...(action.type === "saveDocumentFormats" && {
        documentFormatSnapshot: {
          documentFormats: state.documentFormats,
          revision: state.revision,
        },
      }),
    },
  };
}
