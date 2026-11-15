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
  return {
    ...(preferences.get(key(scope)) ?? {
      phase: "all",
      proposer: "all",
      intake: "all",
      sort: "updated",
    }),
  };
}
export function updateProposalPreferences(scope: string, next: ProposalPreferences): void {
  preferences.set(key(scope), { ...next });
}
