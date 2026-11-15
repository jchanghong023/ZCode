import type { AIReqApplicationProps, AIReqMainView, AIReqProjectProgress } from "./contract.js";
/** Host supplies its connected accessor and operator; Skill design opens within Settings. */
export function exampleAIReqApplication(props: AIReqApplicationProps): AIReqApplicationProps {
  return { services: props.services, platform: props.platform, operator: props.operator };
}

/** Project overview is mounted; sign-in still starts with todos. */
export const exampleAIReqNavigation = [
  "projectProgress",
  "todos",
  "formal",
  "proposals",
  "requirementAnalysis",
] as const satisfies readonly AIReqMainView[];

export const exampleAIReqInitialView: AIReqMainView = "todos";

/** Read-only workflow projection; null means no formal SRs, not zero progress. */
export const exampleAIReqProjectProgress = {
  projectId: "example-project",
  total: {
    proposalCount: 1, formalCount: 0, srCount: 0, unanalyzedCount: 0,
    percent: null, requirements: [],
  },
  releases: [{
    releaseId: "example-release",
    proposalCount: 1, formalCount: 0, srCount: 0, unanalyzedCount: 0,
    percent: null, requirements: [],
  }],
} satisfies AIReqProjectProgress;
