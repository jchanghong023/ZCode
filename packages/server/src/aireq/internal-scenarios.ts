import type {
  AIReqAction,
  AIReqCommandBase,
  AIReqProject,
  AIReqRequirementGroup,
  AIReqProposalDelivery,
  AIReqReview,
  AIReqSystemRequirement,
} from "@zcode/services/aireq";
import type { AIReqVersionedProgressInput } from "@zcode/services/aireq";

export interface AIReqCodeMergeInput extends AIReqVersionedProgressInput {
  fix: boolean;
}

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
  branchCreationAttempts?: Record<string, number>;
};
export type InternalProposalDelivery = AIReqProposalDelivery & {
  mergeScenario?: AIReqProposalMergeScenario;
  simulatedMr?: {
    candidate: string;
    number: number;
    openedAt: string;
    mergeEligibleAt: string;
    status: "opened" | "merged";
    commit?: string;
  };
};

// 故障输入仅留在服务端 owner；公开 SR 只投影本次操作已产生的分支事实。
export type InternalSystemRequirement = Omit<AIReqSystemRequirement, "trackingBranch"> & {
  /** 静态业务样例不自动推进代码合入；不属于公开契约。 */
  automaticCodeMerge?: boolean;
  trackingBranch?: NonNullable<AIReqSystemRequirement["trackingBranch"]> & {
    nextCleanupFailure?: boolean;
  };
};
