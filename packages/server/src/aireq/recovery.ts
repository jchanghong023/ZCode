import type { AIReqMaterialView } from "@zcode/services/aireq";
import { SUPPORTED_AIREQ_DEMOS } from "./scenarios.js";

/** Explicit in-memory failure fixtures, without filesystem or network probing. */
export const prototypeRecoveryScenario = SUPPORTED_AIREQ_DEMOS.find(
  (value) => value === process.env.AIREQ_DEMO,
);
const defaultMaterial = "docs/requirements/draft-automation/requirements.md";
const defaultSession = "demo-aurora-draft-automation-ir-requirements";
const recoveredMaterials = new Set<string>();
const recoveredSessions = new Set<string>();
const consumedOperations = new Set<string>();
const scope = () => `process:${prototypeRecoveryScenario ?? ""}`;
const scenario = () => prototypeRecoveryScenario;
const hasMaterialFailure = (material: AIReqMaterialView) =>
  material.projectId === "demo-aurora" &&
  material.irId === "draft-automation" &&
  material.path === defaultMaterial &&
  (scenario() === "missing-material" || scenario() === "material-read-failure");

// IR IDs are stable within their project; the retry command validates their owning Release.
const materialKey = ({ projectId, irId, path, sha256, round }: AIReqMaterialView) =>
  JSON.stringify([projectId, irId, path, sha256, round]);

export function prototypeMaterialIssue(material: AIReqMaterialView): string | undefined {
  if (!hasMaterialFailure(material)) return undefined;
  if (scenario() === "missing-material") return "当前材料不存在，请核对需求及材料版本。";
  if (!recoveredMaterials.has(materialKey(material))) return "当前材料读取失败，请重试。";
}
export function readPrototypeMaterial(material: AIReqMaterialView): AIReqMaterialView {
  const error = prototypeMaterialIssue(material);
  return error ? { ...material, error, content: undefined } : material;
}
export function retryPrototypeMaterialRead(material: AIReqMaterialView): boolean {
  if (!hasMaterialFailure(material)) return !material.error;
  if (scenario() === "missing-material") return false;
  recoveredMaterials.add(materialKey(material));
  return true;
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
