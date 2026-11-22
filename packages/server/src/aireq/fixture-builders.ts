import { createRequirementSnapshot } from "./content-digest.js";
import { prototypeRecoveryScenario } from "./recovery.js";
import type { AIReqSystemRequirement, AIReqWorkflowTarget } from "@zcode/services/aireq";
import { prototypeRepositoryKey } from "./project-settings.js";
import type {
  NativeSessionRef,
  PrototypeRepositoryTarget,
  Receipt,
  RequirementGroup,
  SystemRequirement,
  WorkflowState,
} from "./workflow-state.js";
import {
  prototypeIrRoot,
  prototypeSpecPath,
  prototypeProposalLocation,
} from "./proposal-storage.js";
import { requirementMaterials } from "./materials.js";
import { readPrototypeAgentModelBinding } from "./agent-models.js";
function initialSelectionForDemo(demo?: string): AIReqWorkflowTarget {
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
export const DEFAULT_SELECTION: AIReqWorkflowTarget =
  initialSelectionForDemo(prototypeRecoveryScenario);
export const PROTOTYPE_WORKSPACE_IDENTITY = "aireq-mock";
const PROTOTYPE_RELEASE_ID = "release-2026-11";
export const createdAt = "2026-11-10T09:00:00.000Z";
export function prototypeDefaultCommit(
  view: Pick<WorkflowState, "repositoryHeads">,
  target: PrototypeRepositoryTarget,
): string {
  return (
    view.repositoryHeads[prototypeRepositoryKey(target)] ??
    `sample-default-${target.repositoryId}`
  );
}
export function systemRequirement(
  projectId: string,
  irId: string,
  id: string,
  title: string,
): SystemRequirement {
  return {
    id,
    projectId,
    irId,
    title,
    documentPath: prototypeSpecPath(irId, id),
  };
}
export function sessionRef(
  projectId: string,
  irId: string,
  phase: NativeSessionRef["phase"],
  srId?: string,
  preferred?: string,
  round = 1,
): NativeSessionRef {
  const sessionId =
    preferred ??
    `${projectId}-${irId}-${srId ?? "ir"}-${phase}${round > 1 ? `-round-${round}` : ""}`;
  return {
    projectId,
    irId,
    ...(srId ? { srId } : {}),
    sessionId,
    role: phase,
    phase,
    round,
    ...readPrototypeAgentModelBinding(phase === "solution" ? "solution" : "requirements"),
  };
}
export function receipt(
  type: string,
  revision: number,
  irId?: string,
  srId?: string,
  at = createdAt,
): Receipt {
  return {
    operationId: `sample-operation-${revision}`,
    type,
    status: "completed",
    startedAt: at,
    completedAt: at,
    revision,
    irId,
    srId,
    steps: [
      {
        name: "业务处理",
        at,
        detail: "已接收当前操作。",
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
): RequirementGroup {
  const materials = requirementMaterials(projectId, id, title, rows);
  const files = materials.map(({ path, sha256, size }) => ({ path, sha256, size }));
  const snapshot = createRequirementSnapshot({
    projectId,
    irId: id,
    title,
    srs: rows.map(({ id: srId, title: srTitle, documentPath }) => ({
      id: srId,
      title: srTitle,
      documentPath,
    })),
    documentPath: `${prototypeIrRoot(id)}/requirements.md`,
    files,
  });
  const digest = snapshot.digest;
  const requirementsSession = sessionRef(
    projectId,
    id,
    "requirements",
    undefined,
    projectId === "demo-aurora" && id === "ir-auth" ? "demo-requirements" : undefined,
  );
  return {
    id,
    originalText: title,
    submittedBy: proposerId,
    projectId,
    releaseId: PROTOTYPE_RELEASE_ID,
    title,
    documentPath: `${prototypeIrRoot(id)}/requirements.md`,
    ...(draft
      ? {
          proposalLocation: prototypeProposalLocation(projectId, proposerId),
          proposalStage: "requirements" as const,
          proposalRound: 1,
        }
      : {
          proposalRound: 1,
          ...(rows.length
            ? {
                proposalSolution: {
                  path: `openspec/changes/${rows[0]!.id}/design.md`,
                  employeeId: "j00808874",
                  generatedAt: createdAt,
                  round: 1,
                  valid: true,
                  requirementsDigest: digest,
                },
              }
            : {}),
        }),
    origin: "local",
    status: draft ? "draft" : "formal",
    revision: 1,
    srIds: rows.map((row) => row.id),
    files,
    sessions: [requirementsSession],
    createdAt,
    snapshot: snapshot,
    ...(!draft
      ? {
          review: {
            id: `sample-review-${id}`,
            snapshotDigest: digest,
            passed: true,
            // 初始记录只陈述已有材料与状态，不宣称执行过外部审核。
            report: `当前记录包含 ${files.length} 份材料，版本 ${digest}；未记录阻断项。`,
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
