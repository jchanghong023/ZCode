import { confirmDocumentVersion, saveDocumentChanges } from "./document-versions.js";
import { group, systemRequirement } from "./fixture-builders.js";
import { prototypeRequirementDetails } from "./fixture-content.js";
import { emptyDocumentFormats, prototypeMaterial, requirementMaterials } from "./materials.js";
import { prototypeProposalDependencies } from "./proposal-flow.js";
import { readPrototypeProjectSettings } from "./project-settings.js";
import { prototypeRecoveryScenario } from "./recovery.js";
import type { WorkflowState } from "./workflow-state.js";

const prototypeRoleEmployees = ["y00519437", "j00808874"];
const prototypeRoles = ["development", "testing"] as const;

const samples = [
  {
    projectId: "demo-aurora",
    id: "ir-auth",
    title: "账号与权限体验",
    documents: true,
    confirmed: true,
    specifications: [
      ["sr-auth", "统一登录与会话管理"],
      ["sr-permissions", "角色权限与访问边界"],
    ],
  },
  {
    projectId: "demo-aurora",
    id: "ir-dashboard",
    title: "团队数据总览",
    documents: true,
    confirmed: true,
    specifications: [["sr-dashboard", "指标概览与趋势卡片"]],
  },
  {
    projectId: "demo-aurora",
    id: "ir-export",
    title: "报表导出",
    documents: true,
    confirmed: true,
    specifications: [["sr-export", "导出任务与下载"]],
  },
  { projectId: "demo-aurora", id: "draft-automation", title: "自动化工作流探索", documents: true },
  {
    projectId: "demo-aurora",
    id: "draft-notification",
    title: "团队通知与提醒",
    documents: true,
    specifications: [["sr-notification", "通知范围与阅读状态"]],
  },
  { projectId: "demo-aurora", id: "draft-feedback-intake", title: "客户反馈归集" },
  {
    projectId: "demo-mobile",
    id: "ir-mobile",
    title: "移动协作工作台",
    documents: true,
    confirmed: true,
    specifications: [["sr-mobile-navigation", "移动导航与项目切换"]],
  },
  { projectId: "demo-mobile", id: "ir-mobile-offline", title: "移动端离线体验", documents: true },
  { projectId: "demo-mobile", id: "draft-mobile-search", title: "移动搜索体验" },
  { projectId: "demo-mobile", id: "ir-mobile-tasks", title: "跨项目待办汇总", documents: true },
  { projectId: "demo-atlas", id: "ir-atlas-progress", title: "客户需求进度查询", documents: true },
] as const;

export function createPrototypeWorkflow(): WorkflowState {
  const { projects } = readPrototypeProjectSettings();
  const state: WorkflowState = {
    revision: 12,
    documentFormats: emptyDocumentFormats(),
    projects,
    projectRoleMembers: projects.flatMap(({ id: projectId }) =>
      prototypeRoles.flatMap((role) =>
        prototypeRoleEmployees.map((employeeId) => ({ projectId, employeeId, role })),
      ),
    ),
    requirements: [],
    srs: [],
    materials: [],
    ideas: [
      {
        id: "idea-backlog-intake",
        originalText:
          "收集客户反馈时，希望能一次粘贴多条原始诉求，逐条确认后进入想法池，并保留反馈来源，减少人工拆分和遗漏。",
        submittedBy: "j00808874",
        createdAt: "2026-11-10T02:20:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-related-needs",
        originalText:
          "新增需求前，希望能检索已有想法和需求中的相似内容，查看原文及当前处理情况，由提交人决定继续新增还是补充已有需求。",
        submittedBy: "j00808875",
        createdAt: "2026-11-10T07:45:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-discussion-summary",
        originalText:
          "需求讨论较长时，希望能查看已确认结论、尚未解决的问题和对应讨论位置，便于新加入的业务、开发与测试人员快速接续讨论。",
        submittedBy: "j00808876",
        createdAt: "2026-11-11T01:15:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-release-capacity",
        originalText:
          "安排版本需求时，希望集中查看候选需求的工作量、负责人和依赖，识别资源冲突后再确认排期，不直接改变已有版本计划。",
        submittedBy: "j00808874",
        createdAt: "2026-11-12T06:30:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-delivery-digest",
        originalText:
          "希望按项目订阅交付摘要，集中了解本周完成的需求、待处理的阻塞和需要本人确认的事项，避免逐个页面查找进展。",
        submittedBy: "j00808877",
        createdAt: "2026-11-13T03:10:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-acceptance-evidence",
        originalText:
          "测试验收时，希望按验收条件整理结果与证明材料，明确区分通过、未通过和未执行，方便业务人员核对后作出验收结论。",
        submittedBy: "j00808876",
        createdAt: "2026-11-14T08:00:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-decision-history",
        originalText:
          "需求发生变更时，希望能查看变更前后的业务规则、调整原因和确认人，并定位受影响的方案与验收条件，减少跨角色理解偏差。",
        submittedBy: "j00808875",
        createdAt: "2026-11-16T02:40:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-knowledge-reuse",
        originalText:
          "创建相似需求时，希望能查阅过往已交付需求的业务背景、方案取舍和验收经验，选择需要引用的材料，同时保持新需求独立管理。",
        submittedBy: "j00808877",
        createdAt: "2026-11-17T01:00:00.000Z",
        revision: 1,
      },
    ],
  };
  if (!projects.length) {
    state.ideas = [];
    return state;
  }
  for (const sample of samples) {
    const { projectId, id, title } = sample;
    if (!projects.some((project) => project.id === projectId)) continue;
    if (
      projectId === "demo-aurora" &&
      (prototypeRecoveryScenario === "empty-releases" ||
        prototypeRecoveryScenario === "empty-requirements")
    )
      continue;
    const details = prototypeRequirementDetails[id]!;
    const requirement = {
      ...group(projectId, id, details.releaseId, title, "j00808874"),
      ...details,
    };
    state.requirements.push(requirement);
    if (!("documents" in sample)) continue;
    const rows =
      "specifications" in sample
        ? sample.specifications.map(([srId, name]) => systemRequirement(projectId, id, srId, name))
        : [];
    const materials = requirementMaterials(projectId, id, title, rows, requirement.originalText);
    if (rows.length) materials.push(prototypeProposalDependencies(requirement, rows));
    saveDocumentChanges(state, requirement, { agent: "requirements", materials, srs: rows });
    if ("confirmed" in sample) {
      confirmDocumentVersion(
        state,
        requirement,
        requirement.submittedBy,
        "2026-11-19T09:00:00.000Z",
      );
    }
    if (id === "ir-auth") {
      const original = materials[0]!;
      saveDocumentChanges(state, requirement, {
        agent: "requirements",
        materials: [
          prototypeMaterial({
            ...original,
            content:
              original.content +
              "\n\n## 管理员操作记录\n\n管理员撤销会话时记录另一个设备的登录状态。",
          }),
        ],
      });
    }
  }
  return state;
}
