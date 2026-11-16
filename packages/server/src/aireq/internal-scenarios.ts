import type {
  AIReqProject,
  AIReqRequirementGroup,
  AIReqProposalDelivery,
} from "@zcode/services/aireq";

/** 服务端夹具专属类型；不属于可替换后端的公开协议。 */
export type AIReqProposalMergeScenario =
  | "unmerged"
  | "merged"
  | "incomplete"
  | "failed"
  | "mr-closed"
  | "stale-version";

export type AIReqPrHandoffScenario =
  | "current"
  | "missing-directory"
  | "wrong-repository"
  | "change-conflict"
  | "stale-version";

export interface AIReqPrHandoffInput {
  group: AIReqRequirementGroup;
  project?: AIReqProject;
  developmentRoot?: string;
  developmentDirectory?: { path: string; repositoryRoot?: string; git: boolean };
  employeeId: string;
  scenario?: AIReqPrHandoffScenario;
}

export type AIReqReviewScenario = "normal" | "blocked" | "failed" | "hold";

export type InternalRequirementGroup = AIReqRequirementGroup & {
  reviewScenarios?: { original?: AIReqReviewScenario; full?: AIReqReviewScenario };
};
export type InternalProposalDelivery = AIReqProposalDelivery & {
  mergeScenario?: AIReqProposalMergeScenario;
};
