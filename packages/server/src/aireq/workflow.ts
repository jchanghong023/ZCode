import {
  AIREQ_ROLE_ADMINISTRATOR,
  fileVersions,
  hasProjectRole,
  type AIReqCommand,
  type AIReqCommandTarget,
  type AIReqDiscussionAgent,
  type AIReqMaterialReadRequest,
  type AIReqMaterialView,
  type AIReqObjectRef,
  type AIReqOperationReceipt,
  type AIReqRemoteWorkflow,
  type AIReqWorkflowResult,
  type AIReqWorkflowTarget,
  type AIReqWorkflowView,
  type AIReqWorkspace,
} from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import { onProductionOpen, production } from "./production-store.js";
import { createRedZoneReceiver } from "./zone-receiver.js";
import type { ProductionStore } from "./production-store.js";
import { createServiceLogger } from "@zcode/services/logger";
import type { NativeDocumentOutput, RequirementGroup, WorkflowState } from "./workflow-state.js";
import { createPrototypeEvent } from "./events.js";
import {
  projectNativeContext,
  projectDirectory,
  irDocumentActivity,
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
  configuredStorageDirectory,
  projectSettingsForSource,
  readPrototypeProjectSettings,
  syncPrototypeProjectNames,
} from "./project-settings.js";
import { mergeSourceRequirement, type PrototypeCatalogue } from "./catalogue-source.js";
import { isAgentModelAvailable, readPrototypeAgentModelBinding } from "./agent-models.js";
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
  projectImportedMaterial,
  requirementMaterialsFor,
  saveDocumentChanges,
} from "./document-versions.js";
import {
  projectDocumentDirectory,
  publishRequirementDocuments,
  queueSharedDocument,
  sharedPublicationPrefix,
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

onProductionOpen((store) => {
  const saved = store.get<WorkflowState>("workflow");
  if (!saved) return;
  let interrupted = false;
  for (const requirement of saved.requirements) {
    for (const review of requirement.documentReviews) {
      if (review.status !== "running") continue;
      review.status = "failed";
      review.report = "服务重启中断了本次评审，请重新发起。";
      interrupted = true;
    }
  }
  if (interrupted) {
    saved.revision += 1;
    store.set("workflow", saved);
  }
  state = saved;
});

/** 同一个业务 owner 的事务入口；失败或未产生变更时保留原工作流。 */
function mutatePrototypeWorkflow(
  update: (next: WorkflowState) => boolean,
  commitReceipt?: (next: WorkflowState) => void,
): WorkflowState {
  const next = structuredClone(state);
  next.revision += 1;
  if (!update(next)) return state;
  if (production) {
    const store = production;
    store.db.transaction(() => {
      store.set("workflow", next);
      commitReceipt?.(next);
    })();
  }
  state = next;
  prototypeWorkflowChanges.fire();
  return next;
}

export function readPrototypeWorkflowRevision(): number {
  return state.revision;
}

async function refreshPrototypeProjects(): Promise<void> {
  const cloudProjects = await readCloudDragonProjects();
  const projects = cloudProjects.map(projectSettingsForSource);
  if (JSON.stringify(projects) !== JSON.stringify(state.projects)) {
    const next = { ...state, projects, revision: state.revision + 1 };
    production?.set("workflow", next);
    state = next;
  }
  syncPrototypeProjectNames(cloudProjects);
}

async function refreshRequirements(projectId: string): Promise<CloudDragonRequirement[]> {
  const { items, domainNames } = await readCloudDragonRequirements(projectId);
  if (!readPrototypeProjectSetting(projectId))
    throw businessRule("云龙目录已不包含此项目，请重新选择。");
  const current = state.requirements.filter((row) => row.projectId === projectId);
  const byId = new Map(current.map((row) => [row.id, row]));
  const requirements = items.map((item) =>
    mergeSourceRequirement(
      projectId,
      item,
      domainNames.get(item.domain),
      byId.get(item.businessNo),
    ),
  );
  const activeIds = new Set(requirements.map((row) => row.id));
  const active = current.filter((row) => activeIds.has(row.id));
  if (
    requirements.every((row, index) => row === active[index]) &&
    active.length === requirements.length
  )
    return items;

  const next = {
    ...state,
    revision: state.revision + 1,
    requirements: state.requirements
      .filter((row) => row.projectId !== projectId || !activeIds.has(row.id))
      .concat(requirements),
  };
  production?.set("workflow", next);
  state = next;
  return items;
}

export type { PrototypeCatalogue } from "./catalogue-source.js";

let catalogueRead: Promise<PrototypeCatalogue> | undefined;
let catalogueCompletedAt: number | undefined;
let previousCatalogue: PrototypeCatalogue | undefined;

const exchangeLog = createServiceLogger("aireq.exchange");

const redZone = createRedZoneReceiver({
  current: () => state,
  install: (next) => {
    state = next;
  },
  queueShared: queueSharedPublication,
  notify: (store) => {
    publishCommittedDocuments(store);
    prototypeWorkflowChanges.fire();
  },
});
export const startRedZoneImport = redZone.start;

export function readPrototypeCatalogue(explicitRefresh = false): Promise<PrototypeCatalogue> {
  if (production) publishCommittedDocuments(production);
  if (production?.zone === "red") return redZone.read(production, explicitRefresh);
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
            irDocument: live.irDocument,
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

export function requirePrototypeCatalogueRequirement(
  { projectId, irId }: AIReqObjectRef,
  catalogue: PrototypeCatalogue,
) {
  const item = catalogue.details.get(projectId)?.get(irId);
  if (!item) throw businessRule("当前项目不存在该需求。");
  return item;
}

export function readPrototypeRequirementDetails(
  target: AIReqObjectRef,
  catalogue: PrototypeCatalogue,
) {
  return cloudDragonRequirementDetails(requirePrototypeCatalogueRequirement(target, catalogue));
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
  const liveRequirements = new Map(
    state.requirements.map((ir) => [keys(ir.projectId, ir.id, ir.documentPath), ir]),
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
    // 仅交接该 IR 当轮的正式需求材料；复用读取边界，不能把有读取错误的正文发到红区。
    const material = documents.get(keys(item.projectId, item.id, item.documentPath));
    const document = material && readPrototypeMaterial(material);
    if (document && (!document.valid || document.error || document.content === undefined))
      throw businessRule(`需求 ${item.id} 的需求文档不可读取，请重试全量同步。`);
    project.requirements.push({
      ...(production && { source: catalogue.details.get(item.projectId)?.get(item.id) }),
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
      cloudFields: item.cloudFields,
      ...(document?.content === undefined
        ? {}
        : {
            requirementsMarkdown: document.content,
            irDocument: irDocumentActivity(
              liveRequirements.get(keys(item.projectId, item.id, item.documentPath)) ?? item,
            ),
          }),
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

function queueSharedPublication(
  store: ProductionStore,
  next: WorkflowState,
  requirement: RequirementGroup,
) {
  if (!next.projects.some((p) => p.id === requirement.projectId && p.storageDirectory)) return;
  queueSharedDocument(store, requirement.projectId, requirement.id);
}

function publishCommittedDocuments(store: ProductionStore) {
  // 共享目录是业务快照的导出。持久提交后再发布，I/O 中断后按最新内容重试。
  for (const [key, target] of store.entries<AIReqObjectRef>(sharedPublicationPrefix)) {
    const directory = configuredStorageDirectory(target.projectId);
    const ir = state.requirements.find(
      (r) => r.projectId === target.projectId && r.id === target.irId,
    );
    try {
      if (ir && directory) {
        publishRequirementDocuments(
          projectDocumentDirectory(directory),
          ir.id,
          requirementMaterialsFor(state, ir),
        );
      }
      store.db.query("DELETE FROM records WHERE name=?").run(sharedPublicationPrefix + key);
    } catch (error) {
      exchangeLog.warn(undefined, "需求文档已保存，共享目录发布等待重试。", {
        projectId: target.projectId,
        irId: target.irId,
        error,
      });
    }
  }
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
  const context = projectNativeContext(state, sessionId);
  if (
    context &&
    production &&
    context.ref.phase !== (production.zone === "red" ? "solution" : "requirements")
  )
    throw businessRule("该会话不属于当前部署区。");
  return context;
}

function captureDocumentInputs(current: WorkflowState, requirement: RequirementGroup) {
  const materials = requirementMaterialsFor(current, requirement);
  const srs = current.srs.filter(
    (row) => row.projectId === requirement.projectId && row.irId === requirement.id,
  );
  const source = {
    id: requirement.id,
    title: requirement.title,
    description: requirement.sourceDescription,
  };
  const version = requirement.documentVersion;
  const stamp = JSON.stringify([
    source,
    fileVersions(materials),
    srs,
    current.documentFormats,
    version?.number,
    version?.confirmation,
  ]);
  return { stamp, source, materials, srs, formats: current.documentFormats };
}

export function captureNativeDocumentInputs(sessionId: string) {
  const target = projectNativeContext(state, sessionId);
  if (!target) throw businessRule("会话不属于当前需求。");
  return structuredClone(captureDocumentInputs(state, target.requirement));
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
  if (production) publishCommittedDocuments(production);
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

function bindPrototypeDiscussion(
  projectId: string,
  irId: string,
  phase: AIReqDiscussionAgent,
): void {
  const index = state.requirements.findIndex(
    (item) => item.projectId === projectId && item.id === irId,
  );
  const requirement = state.requirements[index];
  if (!requirement) return;
  const ref = requirement.sessions.find((item) => item.phase === phase);
  if (!ref || ref.runtimeModel) return;
  // 目录、评论和历史材料只需读取。缺少可用模型时，应由真正的发送操作报错。
  if (production && !isAgentModelAvailable(phase)) return;

  const bound = { ...ref, ...readPrototypeAgentModelBinding(phase) };
  const requirements = state.requirements.slice();
  requirements[index] = {
    ...requirement,
    sessions: requirement.sessions.map((item) => (item === ref ? bound : item)),
  };
  // 目录预留 ID 不应锁定配置。首次讨论只更新 canonical 引用，让旧目录重合并而不推进业务 revision。
  const next = { ...state, requirements };
  production?.set("workflow", next);
  state = next;
}

export function ensureProductionDiscussionBinding(sessionId: string): void {
  if (!production) return;
  const target = readPrototypeNativeContext(sessionId);
  if (!target) throw businessRule("会话不属于当前需求。");
  if (!target.ref.runtimeModel) {
    bindPrototypeDiscussion(target.ref.projectId, target.ref.irId, target.ref.phase);
    if (!readPrototypeNativeContext(sessionId)?.ref.runtimeModel)
      throw businessRule("当前角色尚未配置可用的 OMP 模型，请先在模型设置中选择。");
  }
}

export function readPrototypeWorkflow(
  { projectId, irId, discussionPhase }: AIReqWorkflowTarget,
  catalogue: PrototypeCatalogue,
  bindSession: boolean,
): Pick<AIReqRemoteWorkflow, "view" | "session"> {
  const activePhase = production?.zone === "red" ? "solution" : "requirements";
  if (production && bindSession && irId && discussionPhase && discussionPhase !== activePhase)
    throw businessRule("该会话不属于当前部署区。");
  discussionPhase ??= activePhase;
  const visible = catalogue.projects.some(({ id }) => id === projectId);
  const solution = projectId !== undefined && canAccessSolution(projectId);
  if (
    bindSession &&
    visible &&
    projectId &&
    irId &&
    catalogue.details.get(projectId)?.has(irId) &&
    (discussionPhase !== "solution" || solution)
  ) {
    bindPrototypeDiscussion(projectId, irId, discussionPhase);
  }
  const source = mergeCatalogue(catalogue);
  const requirements = visible
    ? source.requirements.filter((item) => item.projectId === projectId)
    : [];
  const requirementIds = new Set(requirements.map(({ id }) => id));
  const visibleMaterial = (file: AIReqMaterialView) =>
    file.projectId === projectId && requirementIds.has(file.irId);
  const local = source.materials.filter(visibleMaterial);
  const imported = (source.importedRequirements ?? [])
    .filter(visibleMaterial)
    .map((file) => projectImportedMaterial(file, local));
  const importedPaths = new Map(imported.map((file) => [file.irId, file.path]));
  let summaries = requirementSummaries.get(source);
  if (!summaries) {
    summaries = projectRequirementSummaries(source);
    requirementSummaries.set(source, summaries);
  }
  const view: AIReqWorkflowView = {
    revision: source.revision,
    documentFormats: source.documentFormats,
    roleAdministrator: getEmployeeId() === AIREQ_ROLE_ADMINISTRATOR,
    projectRoleMembers: source.projectRoleMembers,
    projects: source.projects.map(projectSummary),
    ...summaries,
    ...(catalogue?.failures.length ? { releaseReadFailures: catalogue.failures } : {}),
    requirements: requirements.map((item) =>
      projectRequirement(item, solution, importedPaths.get(item.id)),
    ),
    srs: source.srs
      .filter((item) => item.projectId === projectId && requirementIds.has(item.irId))
      .map(projectSystemRequirement),
    materials: local.concat(imported).map(readPrototypeMaterial),
  };
  return {
    view,
    session: irId
      ? view.requirements
          .find((item) => item.id === irId)
          ?.sessions.find((item) => item.phase === discussionPhase)
      : undefined,
  };
}

export function retryPrototypeWorkflowMaterial(request: AIReqMaterialReadRequest): boolean {
  const { projectId, releaseId, irId, path, sha256 } = request;
  const requirement = state.requirements.find(
    (item) => item.projectId === projectId && item.releaseId === releaseId && item.id === irId,
  );
  const material =
    requirement && requirementMaterialsFor(state, requirement).find((item) => item.path === path);
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
  let edited: RequirementGroup | undefined;
  mutatePrototypeWorkflow(
    (next) => {
      const context = projectNativeContext(next, sessionId);
      if (!context || context.ref.phase !== output.agent)
        throw businessRule("会话不属于当前需求。");
      if (
        output.expectedInputs !== undefined &&
        output.expectedInputs !== captureDocumentInputs(next, context.requirement).stamp
      )
        throw businessRule("本轮依据的需求或材料已更新，请重新读取后提交。");
      changed = saveDocumentChanges(next, context.requirement, output);
      if (changed && production) edited = context.requirement;
      if (changed && !production) {
        const documents = currentProjectDocumentDirectory(context.requirement.projectId);
        if (documents)
          publishRequirementDocuments(
            documents,
            context.requirement.id,
            requirementMaterialsFor(next, context.requirement),
          );
      }
      return changed;
    },
    (next) => {
      if (edited && production) queueSharedPublication(production, next, edited);
    },
  );
  if (edited && production) publishCommittedDocuments(production);
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
  commitReceipt?: (result: AIReqWorkflowResult) => void,
): { result: AIReqWorkflowResult; review?: DocumentReviewRun } {
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
    if (
      action.type === "reviewDocuments" &&
      production &&
      action.agent !== (production.zone === "red" ? "solution" : "requirements")
    )
      throw businessRule("该评审不属于当前部署区。");
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
    ...(irId === undefined ? {} : { irId }),
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
      const result = {
        projectId: targetProjectId,
        irId,
        receipt: operation,
        documentValidation,
      };
      commitReceipt?.(result);
      return { result };
    }
  }
  const resultFor = (committed: WorkflowState): AIReqWorkflowResult => ({
    projectId: targetProjectId,
    ...(irId === undefined ? {} : { irId }),
    receipt: operation,
    ...(action.type === "saveDocumentFormats" && {
      documentFormatSnapshot: {
        documentFormats: committed.documentFormats,
        revision: committed.revision,
      },
    }),
  });
  let review: DocumentReviewRun | undefined;
  const committed = mutatePrototypeWorkflow(
    (next) => {
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
    },
    (next) => commitReceipt?.(resultFor(next)),
  );
  return { review, result: resultFor(committed) };
}
