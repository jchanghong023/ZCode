import type { AIReqWorkflowView, AIReqMaterialView } from "@zcode/services/aireq";
import { proposalVersion } from "@zcode/services/aireq";
import { readPrototypeProjectSettings } from "./project-settings.js";
import { readPrototypeProjectReleases } from "./project-releases.js";
import { prototypeRecoveryScenario } from "./recovery.js";
import {
  createdAt,
  DEFAULT_SELECTION,
  group,
  systemRequirement,
  sessionRef,
  receipt,
} from "./fixture-builders.js";
import { prototypeProposalDependencies, prototypeProposalSolution } from "./proposal-flow.js";
import { requirementMaterials } from "./materials.js";
import {
  createPrototypeRequirementsReview,
  prototypeReviewSessions,
} from "./requirements-review.js";
import { freezePrototypeRequirement } from "./requirement-freeze.js";
export function createPrototypeWorkflow(): AIReqWorkflowView {
  const sharedSettings = readPrototypeProjectSettings();
  if (!sharedSettings.projects.length)
    return {
      version: 1,
      revision: 0,
      projects: [],
      releases: [],
      groups: [],
      drafts: [],
      srs: [],
      materials: [],
      operations: [],
      sessions: [],
      running: [],
      changes: [],
    };
  const srs = [
    systemRequirement(
      "demo-aurora",
      "ir-auth",
      "sr-auth",
      "统一登录与会话管理",
      "planning",
      false,
      false,
    ),
    systemRequirement(
      "demo-aurora",
      "ir-auth",
      "sr-session",
      "会话恢复与设备管理",
      "planning",
      false,
      true,
    ),
    systemRequirement("demo-aurora", "ir-auth", "sr-permissions", "角色权限与访问边界"),
    systemRequirement("demo-aurora", "ir-auth", "sr-audit", "操作审计与交付"),
    systemRequirement("demo-aurora", "ir-auth", "sr-onboarding", "首次登录引导", undefined, true),
    systemRequirement("demo-aurora", "ir-dashboard", "sr-dashboard", "指标概览与趋势卡片"),
    systemRequirement("demo-aurora", "ir-dashboard", "sr-dashboard-filters", "筛选器与空态"),
    systemRequirement(
      "demo-mobile",
      "ir-mobile",
      "sr-mobile-navigation",
      "移动导航与项目切换",
      "planning",
    ),
    systemRequirement(
      "demo-mobile",
      "ir-mobile",
      "sr-mobile-notifications",
      "通知列表与阅读状态",
      "executing",
    ),
    systemRequirement(
      "demo-mobile",
      "ir-mobile",
      "sr-mobile-profile",
      "个人资料卡片",
      undefined,
      true,
    ),
    systemRequirement("demo-aurora", "ir-export", "sr-export", "导出任务与下载", undefined, true),
    systemRequirement(
      "demo-aurora",
      "ir-notifications",
      "sr-notification-inbox",
      "通知列表与阅读状态",
      undefined,
      true,
    ),
    systemRequirement(
      "demo-aurora",
      "ir-audit-archive",
      "sr-audit-retention",
      "审计查询与留存",
      undefined,
      true,
    ),
    systemRequirement(
      "demo-aurora",
      "draft-automation",
      "proposal-sr-trigger",
      "触发条件与执行范围",
    ),
    systemRequirement(
      "demo-aurora",
      "draft-automation",
      "proposal-sr-history",
      "执行记录与结果查看",
    ),
    systemRequirement(
      "demo-aurora",
      "draft-notification",
      "proposal-sr-notification",
      "通知范围与阅读状态",
    ),
    systemRequirement(
      "demo-aurora",
      "draft-report-export",
      "proposal-sr-report-export",
      "报表导出范围与下载反馈",
    ),
    systemRequirement(
      "demo-aurora",
      "draft-resource-booking",
      "proposal-sr-resource-booking",
      "资源预约时段与冲突提示",
    ),
    systemRequirement(
      "demo-aurora",
      "draft-resource-booking",
      "proposal-sr-booking-notification",
      "预约结果通知与失败反馈",
    ),
    systemRequirement(
      "demo-aurora",
      "draft-audit-subscription",
      "proposal-sr-audit-subscription",
      "审计订阅条件与投递记录",
    ),
    systemRequirement(
      "demo-mobile",
      "draft-mobile-search",
      "proposal-sr-search",
      "搜索条件与结果展示",
    ),
    systemRequirement(
      "demo-mobile",
      "ir-mobile-offline",
      "sr-mobile-offline",
      "离线提示与重新进入",
    ),
  ];
  for (const sr of srs)
    sr.dependencySrIds =
      sr.id === "sr-permissions"
        ? ["sr-auth"]
        : sr.id === "sr-audit"
          ? ["sr-permissions", "sr-session"]
          : sr.id === "proposal-sr-booking-notification"
            ? ["proposal-sr-resource-booking"]
            : [];
  for (const sr of srs.filter((item) => item.status === "completed"))
    sr.codeMerge = {
      commit: `sample-merged-${sr.id}`,
      branch: "main",
      checkedAt: createdAt,
      files: [],
    };
  const groups = [
    group(
      "demo-aurora",
      "ir-auth",
      "账号与权限体验",
      srs.filter((sr) => sr.irId === "ir-auth"),
    ),
    group(
      "demo-aurora",
      "ir-dashboard",
      "团队数据总览",
      srs.filter((sr) => sr.irId === "ir-dashboard"),
    ),
    group(
      "demo-aurora",
      "ir-export",
      "报表导出",
      srs.filter((sr) => sr.irId === "ir-export"),
    ),
    group(
      "demo-aurora",
      "ir-notifications",
      "通知中心",
      srs.filter((sr) => sr.irId === "ir-notifications"),
    ),
    group(
      "demo-aurora",
      "ir-audit-archive",
      "操作审计",
      srs.filter((sr) => sr.irId === "ir-audit-archive"),
    ),
    group(
      "demo-mobile",
      "ir-mobile",
      "移动协作工作台",
      srs.filter((sr) => sr.irId === "ir-mobile"),
    ),
    group(
      "demo-mobile",
      "ir-mobile-offline",
      "移动端离线体验",
      srs.filter((sr) => sr.irId === "ir-mobile-offline"),
    ),
  ];
  const reviewProposal = group(
    "demo-aurora",
    "draft-report-export",
    "团队报表导出",
    srs.filter((sr) => sr.irId === "draft-report-export"),
    true,
    "j00808875",
  );
  const readyProposal = group(
    "demo-aurora",
    "draft-resource-booking",
    "共享资源预约",
    srs.filter((sr) => sr.irId === "draft-resource-booking"),
    true,
    "j00808877",
  );
  const intakeProposal = group(
    "demo-aurora",
    "draft-audit-subscription",
    "审计事件订阅",
    srs.filter((sr) => sr.irId === "draft-audit-subscription"),
    true,
    "j00808875",
  );
  const drafts = [
    group(
      "demo-aurora",
      "draft-automation",
      "自动化工作流探索",
      srs.filter((sr) => sr.irId === "draft-automation"),
      true,
    ),
    group(
      "demo-aurora",
      "draft-notification",
      "团队通知与提醒",
      srs.filter((sr) => sr.irId === "draft-notification"),
      true,
      "j00808876",
    ),
    group(
      "demo-mobile",
      "draft-mobile-search",
      "移动搜索体验",
      srs.filter((sr) => sr.irId === "draft-mobile-search"),
      true,
      "j00808875",
    ),
    reviewProposal,
    readyProposal,
    intakeProposal,
  ];
  drafts[1]!.proposalStage = "solution";
  readyProposal.proposalStage = "solution";
  intakeProposal.proposalStage = "solution";
  readyProposal.status = "solution-ready";
  intakeProposal.status = "requirements-pr";
  // 业务澄清样例不预先拆 SR；只有历史上已通过前置评审的方案样例保留独立 SR。
  for (const proposal of drafts.filter((item) => item.proposalStage !== "solution")) {
    for (let index = srs.length - 1; index >= 0; index--)
      if (srs[index]!.projectId === proposal.projectId && srs[index]!.irId === proposal.id) srs.splice(index, 1);
    proposal.srIds = [];
  }
  const materials: AIReqMaterialView[] = [];
  for (const item of [...groups, ...drafts]) {
    item.releaseId = readPrototypeProjectReleases(item.projectId)[0]?.id ?? "";
    item.contacts = { business: item.submittedBy ?? "j00808874", development: "j00808874", testing: "j00808875" };
    const rows = srs.filter((sr) => sr.projectId === item.projectId && sr.irId === item.id);
    for (const sr of rows) {
      sr.developerEmployeeId = item.contacts.development;
      sr.testingEmployeeId = item.contacts.testing;
    }
    const bundle = requirementMaterials(item.projectId, item.id, item.title, rows);
    if (rows.length) {
      item.srDependencyFile = prototypeProposalDependencies(item, rows);
      const summary = prototypeProposalSolution(item);
      const summaryIndex = bundle.findIndex((material) => material.path === summary.path);
      if (summaryIndex >= 0) bundle.splice(summaryIndex, 1);
      bundle.push(summary, item.srDependencyFile);
      item.proposalSolution = { path: summary.path, employeeId: "j00808874", generatedAt: createdAt,
        round: item.proposalRound ?? 1, valid: true, requirementsDigest: `sample-digest:${item.projectId}:${item.id}` };
    }
    item.files = bundle.map(({ path, sha256, size }) => ({ path, sha256, size }));
    item.snapshot = { version: 1, projectId: item.projectId, irId: item.id, title: item.title,
      documentPath: item.documentPath, files: structuredClone(item.files),
      srs: rows.map(({ id, title, documentPath }) => ({ id, title, documentPath })),
      digest: `sample-digest:${item.projectId}:${item.id}` };
    materials.push(...bundle);
    if (rows.length || item === reviewProposal) {
      item.originalReview = createPrototypeRequirementsReview(item, "j00808874", rows.length > 0);
      item.sessions.push(...prototypeReviewSessions(item.originalReview));
    }
    if (rows.length && item.proposalStage === "solution") {
      item.sessions.push(sessionRef(item.projectId, item.id, "solution"));
      item.developerAcceptance = { employeeId: "j00808874", acceptedAt: createdAt, round: 1 };
    }
    if (groups.includes(item) || item === readyProposal || item === intakeProposal) {
      item.review = createPrototypeRequirementsReview(item, "j00808874", true, "full");
      item.sessions.push(...prototypeReviewSessions(item.review));
      if (groups.includes(item) || item === intakeProposal) {
        item.alignment = (["business", "development", "testing"] as const).map((perspective) => ({
          perspective, version: proposalVersion(item), employeeId: "j00808874", confirmedAt: createdAt,
        }));
      }
    }
    if (groups.includes(item)) {
      item.merge = { commit: `sample-merged-${item.id}`, branch: sharedSettings.projects.find((project) =>
        project.id === item.projectId)!.defaultBranch, checkedAt: createdAt, files: structuredClone(item.files) };
      freezePrototypeRequirement(item, "j00808874", createdAt);
    }
  }
  for (const sr of srs.filter((row) => row.status === "completed")) {
    const project = sharedSettings.projects.find((item) => item.id === sr.projectId)!;
    sr.codeMerge = { commit: `${sr.id}-head`, branch: project.defaultBranch,
      checkedAt: "2026-11-11T01:30:00.000Z", files: [] };
    if (["sr-onboarding", "sr-notification-inbox", "sr-audit-retention", "sr-mobile-profile"].includes(sr.id)) {
      sr.testAcceptance = { operationId: `sample-test-${sr.id}`, outcome: "passed", employeeId: "j00808874",
        at: "2026-11-11T01:30:00.000Z", reason: "历史模拟样例测试通过", codeVersion: `${sr.id}-head` };
      sr.acceptanceHistory = [structuredClone(sr.testAcceptance)];
    } else sr.status = "developing";
  }
  if (prototypeRecoveryScenario === "proposal-feedback") {
    drafts[1]!.proposalStage = "requirements";
    drafts[1]!.returnFeedback = { employeeId: "j00808875", returnedAt: createdAt,
      reason: "【模拟】请补充通知失败后的业务恢复规则及验收依据。" };
  }
  const result: AIReqWorkflowView = {
    version: 1,
    revision: 12,
    ...sharedSettings,
    releases: readPrototypeProjectReleases(),
    currentProjectId: DEFAULT_SELECTION.projectId,
    groups,
    drafts,
    srs,
    materials,
    repositoryHeads: Object.fromEntries(
      sharedSettings.projects.map((project) => [
        project.repositoryId,
        `sample-default-${project.repositoryId}`,
      ]),
    ),
    operations: [
      receipt("需求样例整理", 1, "ir-auth"),
      receipt("提案方案已随需求合入（样例）", 2, "ir-auth"),
      receipt("计划样例准备", 3, "ir-auth", "sr-session"),
      receipt("验证报告展示", 4, "ir-auth", "sr-permissions"),
      receipt("交付信息展示", 5, "ir-auth", "sr-audit"),
      receipt("完成状态展示", 6, "ir-auth", "sr-onboarding"),
      receipt("需求样例整理", 7, "ir-dashboard"),
      receipt("草稿样例创建", 8, "draft-automation"),
      receipt("移动工作台样例", 9, "ir-mobile", "sr-mobile-navigation"),
      receipt("离线体验草稿", 10, "ir-mobile-offline"),
    ],
    sessions: [...groups, ...drafts]
      .flatMap((item) => item.sessions)
      .concat(srs.flatMap((sr) => sr.sessions)),
    selected: { projectId: "demo-aurora", irId: "ir-auth" },
    running: [],
    changes: materials.map((item) => ({
      path: item.path,
      sha256: item.sha256,
      size: item.size,
      projectId: item.projectId,
      irId: item.irId,
      srId: item.srId,
      status: "M（样例）",
    })),
  };
  if (
    prototypeRecoveryScenario === "empty-releases" ||
    prototypeRecoveryScenario === "empty-requirements"
  ) {
    result.groups = result.groups.filter((item) => item.projectId !== "demo-aurora");
    result.drafts = result.drafts.filter((item) => item.projectId !== "demo-aurora");
    result.srs = result.srs.filter((item) => item.projectId !== "demo-aurora");
    result.materials = result.materials.filter((item) => item.projectId !== "demo-aurora");
    result.sessions = result.sessions.filter((item) => item.projectId !== "demo-aurora");
    result.operations = [];
    result.changes = result.changes?.filter((item) => item.projectId !== "demo-aurora");
  }
  return result;
}
