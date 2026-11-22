import type {
  AIReqAction,
  AIReqCommandBase,
  AIReqProject,
  AIReqRequirementGroup,
  AIReqProposalDelivery,
  AIReqReview,
} from "@zcode/services/aireq";

// 生成材料只由原生讨论完成回调驱动，不能出现在浏览器安全的公共命令类型中。
export type InternalWorkflowAction =
  | AIReqAction
  | (Omit<AIReqCommandBase, "operationId" | "expectedRevision"> &
      (
        | { type: "generateRequirements"; note: string }
        | { type: "supplementRequirements"; note: string }
        | { type: "generateProposalSolution" }
      ));

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

export type AIReqReviewScenario = "normal" | "blocked" | "failed" | "hold";

export type InternalRequirementGroup = AIReqRequirementGroup & {
  reviewScenarios?: { original?: AIReqReviewScenario; full?: AIReqReviewScenario };
  heldReviews?: AIReqReview[];
};
export type PrototypeRepositoryTarget = Pick<
  AIReqProject,
  "repositoryId" | "repositoryUrl" | "defaultBranch"
>;

export type InternalProposalDelivery = AIReqProposalDelivery & {
  repositoryTarget?: PrototypeRepositoryTarget;
  mergeScenario?: AIReqProposalMergeScenario;
  simulatedMr?: {
    candidate: string;
    version: string;
    manifest: string;
    number: number;
    openedAt: string;
    mergeEligibleAt: string;
    status: "opened" | "merged";
    commit?: string;
  };
};
