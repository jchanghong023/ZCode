import { getEmployeeId, isEmployeeId } from "./identity.js";
export const PROTOTYPE_BACKEND = {
  id: "aireq-shared-mock",
  kind: "team" as const,
  owner: "j00808874",
  name: "AIReq 共享内存模拟",
  configDirectory: "/mock/aireq/config",
  userSkillsDirectory: "/mock/aireq/user-skills",
};
export const prototypeSettingsWriteAllowed = () => getEmployeeId() === PROTOTYPE_BACKEND.owner;
export const prototypeProposalDiscussionAllowed = () => isEmployeeId(getEmployeeId());
export const prototypeCodeDevelopmentAllowed = () => false;
export function requirePrototypeSettingsWrite(): void {
  if (!prototypeSettingsWriteAllowed())
    throw Object.assign(new Error("仅所有者 j00808874 可修改平台配置。"), { code: "FORBIDDEN" });
}
