import type {
  AIReqRequirementGroup,
  AIReqMaterialView,
  AIReqSrSolutionAnalysis,
  AIReqSystemRequirement,
} from "@zcode/services/aireq";
import { parallelSrIds, readSrDependencies } from "@zcode/services/aireq";
import { prototypeMaterial } from "./materials.js";
import { prototypeChangeRoot } from "./proposal-storage.js";
const solution =
  "*技术方案样例 · 未读取真实项目代码。*\n\n## Context\n\n输入是本 change 的 proposal.md、全部 `specs/<capability>/spec.md` 与业务讨论。在所属 OMP 项目的固定 dir 下、对应 Change 目录内生成方案；人确认当前 IR、全部 SR 和方案后，由平台创建提案分支、提交推送，自动创建需求 MR，人工评审合并后由后台定时核验并转正。方案参与记录不构成独占讨论权限。\n\n## Goals / Non-Goals\n\n- 覆盖全部能力规格中的业务规则、异常与验收场景。\n- 复用已有聊天、导航与服务边界。\n- 本方案不授权代码开发、真实文件操作或自动归档。\n\n## Decisions\n\n采用 OpenSpec change 结构，proposal.md 映射 IR，每个能力 spec.md 映射一个 SR，design.md 覆盖整份 change 的实现思路与技术取舍。能力 spec.md 内可以有多条 Requirement 和 Scenario，不维护依赖。工期预估、假设、依赖及原因唯一记录在同目录 sr-dependencies.json；design.md 只引用，不重复清单。\n\n## 材料目录（示意）\n\n```text\nopenspec/changes/<change-id>/\n├── proposal.md           # IR 业务需求\n├── specs/\n│   └── <capability>/spec.md  # SR 规格\n├── design.md             # 当前技术方案\n└── sr-dependencies.json  # SR 依赖、工期预估及假设\n```\n\n## 架构与模块\n\n界面负责选择和展示，Agent 整理业务或方案产物，宿主在后续实现中负责项目及会话管理、版本校验和需求分支管理。项目只配置远程仓库和默认分支，平台按需拉取内部工作副本作为只读参考；无需个人开发目录，各 IR 共用同一 OMP 项目 dir，生成目标是各自 openspec/changes/<change-id>/，切换 IR 仅切换对应 Agent 会话 ID。\n\n## 文件与函数（设计示例，非实际改动清单）\n\n| 模块 | 文件／函数职责 | 需求对应 |\n| --- | --- | --- |\n| 需求展示 | material-pane：按 change 路径独立展示 proposal/spec/design 与 JSON 依赖材料 | 全部 SR 的材料归属 |\n| 版本校验 | validateProposalVersion：比对本轮需求与两个方案产物的绑定版本 | 防止旧方案提交 |\n| PR 交接 | prepareRequirementChange：将确认的 change 文件带入对应仓库需求分支 | PR 提交和默认分支核对 |\n\n具体业务模块、接口和函数签名应由开发人员依据所选项目代码确认；本静态示例不代表已完成真实代码分析。\n\n## Risks / Trade-offs\n\n逐 SR 说明实现思路与待确认事项；前置依赖及原因从 sr-dependencies.json 读取，可并行范围由其依赖图推导。依赖顺序不等于开发者可用性；缺少人员日历、请假、其他项目占用或真实代码依据时，必须明确建议的假设，不声称已完成资源协调。\n\n建议开始和结束时间、人员分配和人工调整在文档外的开发安排卡片展示，目标存储为业务数据库。方案正文与依赖提交仓库，不单列工时；修改人员和时间不改文档版本、不新增入库审批。原型卡片与文档分析来自同一份样例，不代表真实 AI 输出。\n\n业务规则不明时明确列出卡点，由开发人员填写原因并打回业务补充。保留旧 design.md 与 sr-dependencies.json，但一同标记失效；需求更新后需重新确认本轮两个产物。JSON 缺失、无效或过期不得回退旧图，不能沿用确认或提交 PR。\n\n## Migration Plan\n\n需求 PR 包含同一 change 的 proposal.md、全部 `specs/<capability>/spec.md`、有效 design.md 与 sr-dependencies.json。人工逐文件确认当前版本后，平台从最新默认分支创建提案分支、提交并推送，自动创建 MR，人工评审和合并。后台定时查询 MR 并检查提案分支已合入默认分支且上述文档完整、JSON 有效，便自动转正并创建、推送各 SR 分支；不要求个人目录、手填 MR 链接或人工通知。转正保留 JSON 工期预估和依赖，随后再安排负责人、开发人员和起止日期，新 SR 进度为 0%；仍保留在 changes/，不归档、不标记代码完成。AIReq 仅跟踪后续代码证据，不执行开发、测试或修复。\n\n## Open Questions\n\n待业务澄清的问题必须记录并处理后再确认方案。本例无实际项目分析结论，真实阻塞项需后续确认。\n";

/** Fixture inputs seed the JSON once; every dependency consumer reads that material. */
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
    path: `${prototypeChangeRoot(group.id)}/sr-dependencies.json`,
    content: JSON.stringify(
      {
        srs: group.srIds.map((srId) => ({
          srId,
          estimate: {
            workingDays: srId === "proposal-sr-booking-notification" ? 2 : 3,
            assumptions:
              "按单个开发人员投入估算，复用现有接口；不含等待前置 SR、评审和外部联调时间，未核对真实代码，仅为原型样例。" +
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
    path: `${prototypeChangeRoot(group.id)}/design.md`,
    content: `# ${group.title} · 技术方案\n\n${solution}${discussion ? `\n\n## 本轮方案讨论\n\n${discussion}` : ""}\n\n## SR 实现思路（样例）\n${group.srIds
      .map((id) => {
        const analysis = prototypeSrSolutionAnalysis(group, id);
        return `### ${name(id)}\n\n实现思路：${analysis.approach}\n\n待确认事项：${analysis.uncertainties.join("；")}`;
      })
      .join(
        "\n\n",
      )}\n\n## 依赖权威与开发安排\n\n各 SR 工期预估、预估假设与前置依赖及原因仅见同目录 [sr-dependencies.json](./sr-dependencies.json)，可并行关系由该依赖图推导，本文件不重复清单。两个方案产物同轮生成、失效、逐文件确认并随同一提案 PR 评审。提案仅提供工期预估，不分配负责人、开发人员或计划起止时间；预估由方案对话更新，同依赖一起评审。正式需求的人员及起止时间属于数据库元数据。原型材料仅保存在后端场景内存，不写入真实文件。`,
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
      "以上为方案分析样例，未读取真实项目代码；接口复用与跨 SR 修改冲突待人工核对",
    ],
  };
}
