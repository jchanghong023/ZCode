import type { AIReqRequirementGroup } from "@zcode/services/aireq";
import { srDependencyMap } from "@zcode/services/aireq";
export function freezePrototypeRequirement(
  group: AIReqRequirementGroup,
  employeeId: string,
  at: string,
): void {
  if (group.freeze) return;
  group.freeze = {
    frozenAt: at,
    frozenBy: employeeId,
    title: group.title,
    snapshotDigest: group.snapshot!.digest,
    files: structuredClone(group.files),
    srIds: [...group.srIds],
    dependencies: srDependencyMap(group),
  };
  group.status = "frozen";
  group.developmentStartedAt ??= at;
}
