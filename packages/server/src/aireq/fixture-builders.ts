import { prototypeRecoveryScenario } from "./recovery.js";
import type { AIReqDiscussionAgent, AIReqWorkflowTarget } from "@zcode/services/aireq";
import type {
  NativeSessionRef,
  Receipt,
  RequirementGroup,
  SystemRequirement,
} from "./workflow-state.js";
import { prototypeIrRoot, prototypeSpecPath } from "./proposal-storage.js";
import { readPrototypeAgentModelBinding } from "./agent-models.js";

export const DEFAULT_SELECTION: AIReqWorkflowTarget =
  prototypeRecoveryScenario === "empty-projects" ? {} : { projectId: "demo-aurora" };
export const PROTOTYPE_WORKSPACE_IDENTITY = "aireq-mock";
export const createdAt = "2026-11-10T09:00:00.000Z";

export function systemRequirement(
  projectId: string,
  irId: string,
  id: string,
  title: string,
): SystemRequirement {
  return { id, projectId, irId, title, documentPath: prototypeSpecPath(id) };
}

export function sessionRef(
  projectId: string,
  irId: string,
  agent: AIReqDiscussionAgent,
): NativeSessionRef {
  return {
    projectId,
    irId,
    sessionId:
      projectId === "demo-aurora" && irId === "ir-auth" && agent === "requirements"
        ? "demo-requirements"
        : `${projectId}-${irId}-ir-${agent}`,
    phase: agent,
    ...readPrototypeAgentModelBinding(agent),
  };
}

export function receipt(type: string, revision: number, irId?: string, at = createdAt): Receipt {
  return {
    operationId: `sample-operation-${revision}`,
    type,
    status: "completed",
    startedAt: at,
    completedAt: at,
    revision,
    irId,
    steps: [{ name: "业务处理", at, detail: "已接收当前操作。" }],
  };
}
export function group(
  projectId: string,
  id: string,
  releaseId: string,
  text: string,
  submittedBy: string,
): RequirementGroup {
  return {
    id,
    originalText: text,
    submittedBy,
    projectId,
    releaseId,
    title: text.split("\n")[0]!.slice(0, 60),
    documentPath: `${prototypeIrRoot(id)}/requirements.md`,
    origin: "local",
    revision: 1,
    srIds: [],
    files: [],
    sessions: [sessionRef(projectId, id, "requirements"), sessionRef(projectId, id, "solution")],
    createdAt,
    documentHistory: [],
    documentReviews: [],
  };
}
