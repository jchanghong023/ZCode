import type { AIReqAction, AIReqCommandBase } from "@zcode/services/aireq";

// 生成材料只由原生讨论完成回调驱动，不能出现在浏览器安全的公共命令类型中。
export type InternalWorkflowAction =
  | AIReqAction
  | (AIReqCommandBase &
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
