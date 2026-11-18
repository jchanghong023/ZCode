import { SUPPORTED_AIREQ_DEMOS } from "./scenarios.js";

/** Explicit in-memory failure fixtures, without filesystem or network probing. */
const PROTOTYPE_RECOVERY_SCENARIOS = SUPPORTED_AIREQ_DEMOS;
export type PrototypeRecoveryScenario = (typeof PROTOTYPE_RECOVERY_SCENARIOS)[number];
export const prototypeRecoveryScenario = PROTOTYPE_RECOVERY_SCENARIOS.find(
  (value) => value === process.env.AIREQ_DEMO,
);
const defaultMaterial = "docs/requirements/draft-automation/requirements.md";
const defaultSession = "demo-aurora-draft-automation-ir-requirements";
const recoveredMaterials = new Set<string>();
const recoveredSessions = new Set<string>();
const consumedOperations = new Set<string>();
const scope = () => `process:${prototypeRecoveryScenario ?? ""}`;
const scenario = () => prototypeRecoveryScenario;
export function prototypeMaterialIssue(path: string): string | undefined {
  if (path !== defaultMaterial || recoveredMaterials.has(`${scope()}:${path}`)) return undefined;
  if (scenario() === "missing-material") return "当前材料不存在，请核对需求及材料版本。";
  if (scenario() === "material-read-failure") return "当前材料读取失败，请重试。";
  return undefined;
}
export function retryPrototypeMaterialRead(path: string): boolean {
  if (scenario() === "missing-material" && path === defaultMaterial) return false;
  recoveredMaterials.add(`${scope()}:${path}`);
  return !prototypeMaterialIssue(path);
}
export function prototypeSessionReadIssue(sessionId: string): boolean {
  return (
    scenario() === "session-read-failure" &&
    sessionId === defaultSession &&
    !recoveredSessions.has(`${scope()}:${sessionId}`)
  );
}
export function retryPrototypeSessionRead(sessionId: string): void {
  recoveredSessions.add(`${scope()}:${sessionId}`);
}
export function consumePrototypeSendFailure(): boolean {
  if (scenario() !== "send-failure") return false;
  const key = `${scope()}:send`;
  if (consumedOperations.has(key)) return false;
  consumedOperations.add(key);
  return true;
}
export function consumePrototypeOperationFailure(type: string): boolean {
  if (scenario() !== "operation-failure" || type !== "returnProposal") return false;
  const key = `${scope()}:${type}`;
  if (consumedOperations.has(key)) return false;
  consumedOperations.add(key);
  return true;
}
export function consumePrototypeMrCreationFailure(candidate: string): boolean {
  if (scenario() !== "mr-create-failure") return false;
  const key = `${scope()}:mr:${candidate}`;
  if (consumedOperations.has(key)) return false;
  consumedOperations.add(key);
  return true;
}
