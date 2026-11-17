import { PROPOSAL_STATE_OPTIONS } from "../contract.js";
import { getEmployeeId } from "../identity.js";
interface ProposalPreferences {
  phase: string;
  proposer: string;
  intake: "all" | "attention";
  sort: string;
}
// 只保存客户端筛选偏好，不保存共享提案、材料或操作事实。
const preferences = new Map<string, ProposalPreferences>();
const key = (scope: string) => `${getEmployeeId()}:${scope}`;
export function readProposalPreferences(scope: string): ProposalPreferences {
  const stored = preferences.get(key(scope));
  return {
    ...(stored ?? {
      phase: "all",
      proposer: "all",
      intake: "all",
      sort: "updated",
    }),
    // 旧数字阶段不能映射为新业务状态；仅恢复稳定 ID，防止列表被错误隐藏。
    phase: PROPOSAL_STATE_OPTIONS.some((option) => option.id === stored?.phase)
      ? stored!.phase
      : "all",
  };
}
export function updateProposalPreferences(scope: string, next: ProposalPreferences): void {
  preferences.set(key(scope), { ...next });
}
