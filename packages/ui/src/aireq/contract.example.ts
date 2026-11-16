import type { AIReqApplicationProps, AIReqMainView, AIReqProjectProgress } from "./contract.js";
/** Host supplies its connected accessor and operator; hidden Skill design stays retained. */
export function exampleAIReqApplication(props: AIReqApplicationProps): AIReqApplicationProps {
  return { services: props.services, platform: props.platform, operator: props.operator };
}

/** The 68px global rail opens all projects or cross-project todos. */
export const exampleAIReqNavigation = [
  "projectProgress",
  "todos",
] as const satisfies readonly AIReqMainView[];

/** Project-space surfaces share one project/Release selection and requirement identity. */
export const exampleAIReqProjectNavigation = [
  "projectOverview",
  "formal",
  "proposals",
  "requirementAnalysis",
] as const satisfies readonly AIReqMainView[];

export const exampleAIReqInitialView: AIReqMainView = "projectProgress";

/** Read-only workflow projection; null means no formal SRs, not zero progress. */
export const exampleAIReqProjectProgress = {
  projectId: "example-project",
  total: {
    proposalCount: 1,
    formalCount: 0,
    srCount: 0,
    unanalyzedCount: 0,
    percent: null,
    requirements: [],
  },
  releases: [
    {
      releaseId: "example-release",
      title: "Example release",
      createdAt: "2026-11-16T00:00:00.000Z",
      proposalCount: 1,
      formalCount: 0,
      srCount: 0,
      unanalyzedCount: 0,
      percent: null,
      requirements: [],
    },
  ],
} satisfies AIReqProjectProgress;
