import type { AIReqDiscussionAgent } from "@zcode/services/aireq";
import type { NativeSessionRef, SystemRequirement } from "./workflow-state.js";
import { prototypeSpecPath } from "./proposal-storage.js";
import { readPrototypeAgentModelBinding } from "./agent-models.js";

export const PROTOTYPE_WORKSPACE_IDENTITY = "aireq-mock";

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
    sessionId: `${projectId}-${irId}-ir-${agent}`,
    phase: agent,
    ...readPrototypeAgentModelBinding(agent),
  };
}
