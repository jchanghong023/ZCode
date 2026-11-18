import type {
  AIReqRequirementGroup,
  AIReqMaterialView,
  AIReqSrSolutionAnalysis,
  AIReqSystemRequirement,
} from "@zcode/services/aireq";
import { parallelSrIds, readSrDependencies } from "@zcode/services/aireq";
import { prototypeMaterial } from "./materials.js";
import { prototypeIrRoot } from "./proposal-storage.js";

/** 依赖 JSON 是预估假设的唯一来源；写业务投入与范围条件，不把私有样例身份带入用户材料。 */
export function prototypeProposalDependencies(
  group: AIReqRequirementGroup,
  rows: AIReqSystemRequirement[],
  suppliedJson?: string,
): AIReqMaterialView {
  return prototypeMaterial({
    projectId: group.projectId,
    irId: group.id,
    kind: "solution",
    stage: "solution",
    round: group.proposalRound ?? 1,
    path: `${prototypeIrRoot(group.id)}/sr-dependencies.json`,
    // A supplied dependency document must be inspected as-is, including structural errors.
    content:
      suppliedJson ??
      JSON.stringify(
        {
          srs: rows.map((row) => ({
            srId: row.id,
            estimate: {
              workingDays: row.id === "proposal-sr-booking-notification" ? 2 : 3,
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

export function prototypeSrSolutionAnalysis(
  group: AIReqRequirementGroup,
  srId: string,
): AIReqSrSolutionAnalysis {
  const result = readSrDependencies(group);
  const title = group.snapshot?.srs.find((sr) => sr.id === srId)?.title ?? srId;
  const prerequisites = result.document?.srs.find((row) => row.srId === srId)?.prerequisites ?? [];
  return {
    approach:
      srId === "proposal-sr-resource-booking"
        ? "复用现有资源查询与预约接口，在提交前校验时段冲突，并统一展示冲突与失败反馈。"
        : srId === "proposal-sr-booking-notification"
          ? "订阅预约成功与取消结果，复用通知通道展示状态；对重复事件去重，并保留投递失败反馈。"
          : `围绕「${title}」复用既有模块，按验收条件补齐正常、异常与恢复路径；接口和数据边界以项目代码核对结果为准。`,
    dependencyReason:
      result.issue ??
      (prerequisites.map((item) => `${item.srId}：${item.reason}`).join("；") ||
        "sr-dependencies.json 记录无前置依赖，可独立安排。"),
    parallelSrIds: parallelSrIds(group, srId),
    uncertainties: [
      ...(result.issue ? [result.issue] : []),
      "尚未完成项目代码核验；接口复用与跨 SR 修改冲突待人工确认",
    ],
  };
}
