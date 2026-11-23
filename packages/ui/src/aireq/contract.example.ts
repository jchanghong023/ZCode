import type { AIReqApplicationProps, AIReqMainView, AIReqReleaseSummary } from "./contract.js";
/** The host supplies the accessor, stable client ID, connection status and operator. */
export function exampleAIReqApplication(props: AIReqApplicationProps): AIReqApplicationProps {
  return {
    services: props.services,
    platform: props.platform,
    clientId: props.clientId,
    connected: props.connected,
    operator: props.operator,
  };
}

/** Global navigation opens all projects or the idea pool. */
export const exampleAIReqNavigation = [
  "projectProgress",
  "ideas",
] as const satisfies readonly AIReqMainView[];

/** Project-space surfaces share one project/Release selection and requirement identity. */
export const exampleAIReqProjectNavigation = [
  "proposals",
] as const satisfies readonly AIReqMainView[];

export const exampleAIReqInitialView: AIReqMainView = "projectProgress";

/** Global Release directory returned by the workflow, with read-only document counts. */
export const exampleAIReqReleases = [
  {
    id: "example-release",
    projectId: "example-project",
    title: "Example release",
    createdAt: "2026-11-16T00:00:00.000Z",
    requirementCount: 1,
    confirmedRequirementCount: 0,
  },
] satisfies AIReqReleaseSummary[];
