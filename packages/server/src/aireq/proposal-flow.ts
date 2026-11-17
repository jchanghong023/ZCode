import type {
  AIReqRequirementGroup,
  AIReqMaterialView,
  AIReqSrSolutionAnalysis,
  AIReqSystemRequirement,
} from "@zcode/services/aireq";
import { parallelSrIds, readSrDependencies } from "@zcode/services/aireq";
import { prototypeMaterial } from "./materials.js";
import { prototypeIrRoot } from "./proposal-storage.js";
const solution =
  "每个 SR 是独立 OpenSpec change，包含 proposal、design、tasks、specs 和 test-plan。IR 共享材料保存业务需求、整体验收与依赖 JSON。任务清单尚未实施或验证，代码与接口仍需核对。所有材料作为同一完整版本审查、人工放行和三方确认后进入一个文档 PR。";

/** 依赖 JSON 是预估假设的唯一来源；写业务投入与范围条件，不把私有样例身份带入用户材料。 */
export function prototypeProposalDependencies(
  group: AIReqRequirementGroup,
  rows: AIReqSystemRequirement[],
  discussion?: string,
): AIReqMaterialView {
  return prototypeMaterial({
    projectId: group.projectId,
    irId: group.id,
    kind: "solution",
    stage: "solution",
    round: group.proposalRound ?? 1,
    path: `${prototypeIrRoot(group.id)}/sr-dependencies.json`,
    content: JSON.stringify(
      {
        srs: group.srIds.map((srId) => ({
          srId,
          estimate: {
            workingDays: srId === "proposal-sr-booking-notification" ? 2 : 3,
            assumptions:
              "按单个开发人员投入估算，假设复用现有接口；不含等待前置 SR、评审和外部联调时间，实际排期需结合接口核对和联调范围确认。" +
              (discussion ? `本轮方案讨论：${discussion}` : ""),
          },
          prerequisites: (rows.find((row) => row.id === srId)?.dependencySrIds ?? []).map((id) => ({
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

export function prototypeProposalSolution(
  group: AIReqRequirementGroup,
  discussion?: string,
): AIReqMaterialView {
  const name = (id: string) =>
    `${id} · ${group.snapshot?.srs.find((sr) => sr.id === id)?.title ?? id}`;
  return prototypeMaterial({
    projectId: group.projectId,
    irId: group.id,
    kind: "solution",
    stage: "solution",
    round: group.proposalRound ?? 1,
    path: `${prototypeIrRoot(group.id)}/acceptance.md`,
    content: `# ${group.title} · 技术方案\n\n${solution}${discussion ? `\n\n## 本轮方案讨论\n\n${discussion}` : ""}\n\n## SR 实现思路\n${group.srIds
      .map((id) => {
        const analysis = prototypeSrSolutionAnalysis(group, id);
        return `### ${name(id)}\n\n实现思路：${analysis.approach}\n\n待确认事项：${analysis.uncertainties.join("；")}`;
      })
      .join(
        "\n\n",
      )}\n\n## 业务整体验收\n\n追溯 requirements.md 的 AC-1 正常结果与 AC-2 异常恢复；逐 SR 验证后检查跨 SR 协作与一致性。开发依赖、预估与原因唯一见 [sr-dependencies.json](./sr-dependencies.json)，不在这里维护第二份依赖。`,
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
