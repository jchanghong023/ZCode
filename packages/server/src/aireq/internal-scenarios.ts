import type {
  AIReqProject,
  AIReqRequirementGroup,
  AIReqProposalDelivery,
  AIReqReview,
  AIReqSystemRequirement,
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
  heldReviews?: AIReqReview[];
  branchCreationFailures?: string[];
};
export type InternalProposalDelivery = AIReqProposalDelivery & {
  mergeScenario?: AIReqProposalMergeScenario;
};

// 故障输入仅留在服务端 owner；公开 SR 只投影本次操作已产生的分支事实。
export type InternalSystemRequirement = Omit<AIReqSystemRequirement, "trackingBranch"> & {
  trackingBranch?: NonNullable<AIReqSystemRequirement["trackingBranch"]> & {
    nextCleanupFailure?: boolean;
  };
};
