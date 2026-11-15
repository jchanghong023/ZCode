import { prototypeRecoveryScenario } from "./recovery.js";
import type {
  AIReqWorkflowView,
  AIReqWorkflowStage,
  AIReqSystemRequirement,
  AIReqNativeSessionRef,
  AIReqOperationReceipt,
  AIReqRequirementGroup,
  AIReqSelection,
} from "@zcode/services/aireq";
import { readPrototypeProjectSettings } from "./project-settings.js";
import {
  prototypeChangeRoot,
  prototypeSpecPath,
  prototypeProposalLocation,
} from "./proposal-storage.js";
import { requirementMaterials } from "./materials.js";
import { readPrototypeAgentModelBinding } from "./agent-models.js";
export function initialSelectionForDemo(demo?: string): AIReqSelection {
  if (demo === "empty-projects") return {};
  if (demo === "proposal-intake" || demo === "proposal-feedback" || demo === "operation-failure")
    return { projectId: "demo-aurora", irId: "draft-notification" };
  if (demo === "missing-requirement")
    return { projectId: "demo-aurora", irId: "missing-requirement" };
  if (demo === "missing-sr")
    return { projectId: "demo-aurora", irId: "draft-automation", srId: "missing-sr" };
  if (
    [
      "requirements-review",
      "review-chat",
      "missing-material",
      "material-read-failure",
      "session-read-failure",
      "send-failure",
    ].includes(demo ?? "")
  )
    return { projectId: "demo-aurora", irId: "draft-automation" };
  return { projectId: "demo-aurora" };
}
export const DEFAULT_SELECTION: AIReqSelection = initialSelectionForDemo(prototypeRecoveryScenario);
export const PROTOTYPE_WORKSPACE_IDENTITY = "aireq-mock";
export const PROTOTYPE_RELEASE_ID = "release-2026-11";
export const createdAt = "2026-11-10T09:00:00.000Z";
export function prototypeDefaultCommit(view: AIReqWorkflowView, projectId: string): string {
  const project = readPrototypeProjectSettings().projects.find((item) => item.id === projectId);
  if (!project) throw new Error("项目不存在。");
  return view.repositoryHeads?.[project.repositoryId] ?? `sample-default-${project.repositoryId}`;
}
export function systemRequirement(
  projectId: string,
  irId: string,
  id: string,
  title: string,
  stage?: AIReqWorkflowStage,
  completed = false,
  _preferred = false,
): AIReqSystemRequirement {
  return {
    id,
    projectId,
    irId,
    title,
    documentPath: prototypeSpecPath(irId, id),
    status: completed ? "completed" : stage ? "developing" : "pending",
    round: 0,
    sessions: [],
    approvals: [],
    materials: [],
  };
}
export function sessionRef(
  projectId: string,
  irId: string,
  phase: AIReqNativeSessionRef["phase"],
  srId?: string,
  preferred?: string,
  round = 1,
): AIReqNativeSessionRef {
  const sessionId =
    preferred ??
    `${projectId}-${irId}-${srId ?? "ir"}-${phase}${round > 1 ? `-round-${round}` : ""}`;
  return {
    projectId,
    irId,
    ...(srId ? { srId } : {}),
    sessionId,
    sessionFile: `/demo/sessions/${sessionId}.jsonl`,
    role: phase,
    phase,
    round,
    modelConfig: readPrototypeAgentModelBinding(phase === "solution" ? "solution" : "requirements"),
  };
}
export function receipt(
  type: string,
  revision: number,
  irId?: string,
  srId?: string,
  at = createdAt,
): AIReqOperationReceipt {
  return {
    operationId: `sample-operation-${revision}`,
    commandDigest: `sample:${type}:${revision}`,
    type,
    status: "completed",
    startedAt: at,
    completedAt: at,
    revision,
    irId,
    srId,
    steps: [
      {
        name: "prototype",
        at,
        detail: `服务端内存模拟：${type}。不执行真实 Git、模型、测试或外部审批。`,
      },
    ],
  };
}
export function group(
  projectId: string,
  id: string,
  title: string,
  rows: AIReqSystemRequirement[],
  draft = false,
  proposerId = "j00808874",
): AIReqRequirementGroup {
  const materials = requirementMaterials(projectId, id, title, rows);
  const files = materials.map(({ path, sha256, size }) => ({ path, sha256, size }));
  const digest = `sample-digest:${projectId}:${id}`;
  const requirementsSession = sessionRef(
    projectId,
    id,
    "requirements",
    undefined,
    projectId === "demo-aurora" && id === "ir-auth" ? "demo-requirements" : undefined,
  );
  return {
    id,
    projectId,
    releaseId: PROTOTYPE_RELEASE_ID,
    title,
    documentPath: `${prototypeChangeRoot(id)}/proposal.md`,
    ...(draft
      ? {
          proposalLocation: prototypeProposalLocation(projectId, proposerId),
          proposalStage: "requirements" as const,
          proposalRound: 1,
        }
      : {
          proposalRound: 1,
          proposalSolution: {
            path: `${prototypeChangeRoot(id)}/design.md`,
            employeeId: "j00808874",
            generatedAt: createdAt,
            round: 1,
            valid: true,
            requirementsDigest: digest,
          },
        }),
    origin: "local",
    status: draft ? "draft" : rows.some((row) => row.startedAt) ? "frozen" : "formal",
    revision: 1,
    srIds: rows.map((row) => row.id),
    files,
    sessions: [requirementsSession],
    createdAt,
    ...(!draft
      ? {
          worktree: {
            path: `/demo/worktrees/${projectId}/${id}`,
            branch: `demo/requirements/${id}`,
            baseCommit: "sample-base",
          },
        }
      : {}),
    snapshot: {
      version: 1,
      projectId,
      irId: id,
      title,
      srs: rows.map(({ id: srId, title: srTitle, documentPath }) => ({
        id: srId,
        title: srTitle,
        documentPath,
      })),
      documentPath: `${prototypeChangeRoot(id)}/proposal.md`,
      files,
      digest,
    },
    ...(!draft
      ? {
          confirmation: {
            operationId: `sample-confirm-${id}`,
            snapshotDigest: digest,
            confirmedAt: createdAt,
          },
          review: {
            id: `sample-review-${id}`,
            snapshotDigest: digest,
            passed: true,
            report:
              "前端审核展示样例：需求边界、拆分关系和交互资料齐全。此记录不是实际审核结论，真实审核留待后续 OMP 对接阶段。",
            reviewer: {
              sessionId: `sample-reviewer-${id}`,
              role: "reviewer" as const,
              sourceProjectId: projectId,
              imported: true as const,
            },
            createdAt,
          },
        }
      : {}),
  };
}
