import type { AIReqRequirementGroup, AIReqMaterialView } from "@zcode/services/aireq";
import { prototypeMaterial } from "./materials.js";
import { prototypeIrRoot } from "./proposal-storage.js";
import type { SystemRequirement } from "./workflow-state.js";

/** 依赖 JSON 是预估假设的唯一来源；写业务投入与范围条件，不把私有样例身份带入用户材料。 */
export function prototypeProposalDependencies(
  group: AIReqRequirementGroup,
  rows: SystemRequirement[],
  suppliedJson?: string,
): AIReqMaterialView {
  return prototypeMaterial({
    projectId: group.projectId,
    irId: group.id,
    kind: "solution",
    path: `${prototypeIrRoot(group.id)}/sr-dependencies.json`,
    // A supplied dependency document must be inspected as-is, including structural errors.
    content:
      suppliedJson ??
      JSON.stringify(
        {
          srs: rows.map((row) => ({
            srId: row.id,
            estimate: {
              workingDays: 3,
              assumptions:
                "按单个开发人员投入估算，假设复用现有接口；不含等待前置 SR、评审和外部联调时间，实际排期需结合接口核对和联调范围确认。",
            },
            prerequisites: (row.dependencySrIds ?? []).map((id) => ({
              srId: id,
              reason: "需要先稳定前置 SR 提供的业务结果与接口约定，再实现当前能力。",
            })),
          })),
        },
        null,
        2,
      ),
  });
}
