import type { AIReqApplicationProps, AIReqMainView, AIReqProjectDocuments } from "./contract.js";
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
  "projectOverview",
  "formal",
  "proposals",
  "todos",
] as const satisfies readonly AIReqMainView[];

export const exampleAIReqInitialView: AIReqMainView = "projectProgress";

/** Read-only document counts returned by the workflow. */
export const exampleAIReqProjectDocuments = {
  projectId: "example-project",
  releases: [
    {
      releaseId: "example-release",
      title: "Example release",
      createdAt: "2026-11-16T00:00:00.000Z",
      proposalCount: 1,
      formalCount: 0,
    },
  ],
} satisfies AIReqProjectDocuments;
