import type { AIReqWorkflowView } from "@zcode/services/aireq";
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
import { readPrototypeProposalPrHandoff } from "./proposal-pr-handoff.js";
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
  drafts[1]!.sessions.push(sessionRef("demo-aurora", "draft-notification", "solution"));
  drafts[1]!.developerHandoff = {
    employeeId: "j00808876",
    submittedAt: "2026-11-10T09:30:00.000Z",
  };
  drafts[1]!.developerAcceptance = {
    employeeId: "j00808874",
    acceptedAt: "2026-11-10T09:35:00.000Z",
    round: 1,
  };
  drafts[1]!.createdAt = "2026-11-07T09:00:00.000Z";
  reviewProposal.createdAt = "2026-11-08T10:00:00.000Z";
  readyProposal.createdAt = "2026-11-09T11:00:00.000Z";
  intakeProposal.createdAt = "2026-11-06T08:00:00.000Z";
  for (const [proposal, employeeId, acceptedAt, generatedAt] of [
    [readyProposal, "j00808875", "2026-11-10T12:00:00.000Z", "2026-11-11T08:00:00.000Z"],
    [intakeProposal, "j00808877", "2026-11-10T14:00:00.000Z", "2026-11-10T15:00:00.000Z"],
  ] as const) {
    proposal.proposalStage = "solution";
    proposal.status = "solution-ready";
    proposal.sessions.push(sessionRef(proposal.projectId, proposal.id, "solution"));
    proposal.developerHandoff = {
      employeeId: proposal.proposalLocation!.employeeId,
      submittedAt: acceptedAt,
    };
    proposal.developerAcceptance = { employeeId, acceptedAt, round: proposal.proposalRound! };
    proposal.srDependencyFile = prototypeProposalDependencies(
      proposal,
      srs.filter((sr) => sr.projectId === proposal.projectId && sr.irId === proposal.id),
    );
    const solution = prototypeProposalSolution(proposal);
    proposal.proposalSolution = {
      path: solution.path,
      employeeId,
      generatedAt,
      round: proposal.proposalRound!,
      valid: true,
      requirementsDigest: proposal.snapshot!.digest,
    };
    proposal.files.push({ path: solution.path, sha256: solution.sha256, size: solution.size });
    proposal.files.push({
      path: proposal.srDependencyFile.path,
      sha256: proposal.srDependencyFile.sha256,
      size: proposal.srDependencyFile.size,
    });
  }
  // Match the existing confirm → push → manual PR actions; compute the candidate only
  // after all current requirement and solution file versions have been collected.
  const candidate = "sample-proposal-draft-audit-subscription-round-1";
  intakeProposal.proposalDelivery = {
    candidate,
    version: proposalVersion(intakeProposal),
    files: structuredClone(intakeProposal.files),
    confirmedBy: "j00808874",
    confirmedAt: "2026-11-10T16:00:00.000Z",
    pushedCandidate: candidate,
    pushedAt: "2026-11-10T16:10:00.000Z",
    prCandidate: candidate,
  };
  intakeProposal.confirmation = {
    operationId: "sample-confirm-draft-audit-subscription",
    snapshotDigest: intakeProposal.snapshot!.digest,
    confirmedAt: intakeProposal.proposalDelivery.confirmedAt,
  };
  intakeProposal.requirementsPr = {
    url: "https://example.invalid/demo/pulls/43",
    sourceBranch: readPrototypeProposalPrHandoff(intakeProposal).branch,
    targetBranch: sharedSettings.projects.find(
      (project) => project.id === intakeProposal.projectId,
    )!.defaultBranch,
    recordedAt: "2026-11-11T09:00:00.000Z",
    platformVerified: false,
  };
  intakeProposal.status = "requirements-pr";
  for (const item of [...groups, ...drafts]) {
    const rows = srs.filter((sr) => sr.projectId === item.projectId && sr.irId === item.id);
    if (rows.some((sr) => sr.startedAt)) item.developmentStartedAt = createdAt;
  }
  for (const item of [...groups, ...drafts])
    item.releaseId = readPrototypeProjectReleases(item.projectId)[0]?.id ?? "";
  const materials = [...groups, ...drafts].flatMap((item) =>
    requirementMaterials(
      item.projectId,
      item.id,
      item.title,
      srs.filter((sr) => sr.irId === item.id),
    ),
  );
  for (const item of [...groups, drafts[1]!, reviewProposal, readyProposal, intakeProposal])
    item.review = createPrototypeRequirementsReview(item, "j00808874", true);
  drafts[1]!.review!.createdAt = "2026-11-09T09:00:00.000Z";
  reviewProposal.review!.passed = false;
  reviewProposal.review!.humanDecision = undefined;
  reviewProposal.review!.createdAt = "2026-11-10T11:00:00.000Z";
  readyProposal.review!.createdAt = "2026-11-10T11:30:00.000Z";
  intakeProposal.review!.createdAt = "2026-11-10T13:00:00.000Z";
  for (const item of groups) {
    item.srDependencyFile = prototypeProposalDependencies(
      item,
      srs.filter((sr) => sr.projectId === item.projectId && sr.irId === item.id),
    );
    const solution = prototypeProposalSolution(item);
    item.files.push({ path: solution.path, sha256: solution.sha256, size: solution.size });
    item.files.push({
      path: item.srDependencyFile.path,
      sha256: item.srDependencyFile.sha256,
      size: item.srDependencyFile.size,
    });
    item.merge = {
      commit: `sample-merged-${item.id}`,
      branch: "main",
      checkedAt: createdAt,
      files: structuredClone(item.files),
    };
    if (item.developmentStartedAt)
      freezePrototypeRequirement(item, "j00808874", item.developmentStartedAt);
  }
  if (prototypeRecoveryScenario === "proposal-feedback") {
    const proposal = drafts[1]!;
    proposal.proposalStage = "requirements";
    proposal.proposalRound = 2;
    proposal.developerAcceptance = undefined;
    proposal.developerHandoff = undefined;
    proposal.returnFeedback = {
      employeeId: "j00808875",
      returnedAt: createdAt,
      reason:
        "方案 Agent 提问，开发暂时无法回答：\n1. 通知发送失败后，是否自动重试？重试次数和间隔由谁确定？\n2. 用户取消后，已发送的通知是否保留？\n请业务补充上述规则和验收行为，由业务 Agent 更新 IR／SR。",
    };
    proposal.sessions.push(
      sessionRef(proposal.projectId, proposal.id, "requirements", undefined, undefined, 2),
    );
  }
  if (prototypeRecoveryScenario === "proposal-intake") {
    const proposal = drafts[1]!;
    proposal.srDependencyFile = prototypeProposalDependencies(
      proposal,
      srs.filter((sr) => sr.projectId === proposal.projectId && sr.irId === proposal.id),
    );
    const material = prototypeProposalSolution(proposal);
    proposal.status = "solution-ready";
    proposal.proposalSolution = {
      path: material.path,
      employeeId: "j00808874",
      generatedAt: createdAt,
      round: 1,
      valid: true,
      requirementsDigest: proposal.snapshot!.digest,
    };
    proposal.files.push({ path: material.path, sha256: material.sha256, size: material.size });
    proposal.files.push({
      path: proposal.srDependencyFile.path,
      sha256: proposal.srDependencyFile.sha256,
      size: proposal.srDependencyFile.size,
    });
  }
  for (const proposal of drafts.filter(
    (item) => item.proposalStage === "solution" && !item.srDependencyFile,
  )) {
    proposal.srDependencyFile = prototypeProposalDependencies(
      proposal,
      srs.filter((sr) => sr.projectId === proposal.projectId && sr.irId === proposal.id),
    );
    proposal.srDependencyFile.valid = false;
  }
  materials.push(
    ...groups.map((group) => prototypeProposalSolution(group)),
    ...drafts
      .filter((item) => item.proposalStage === "solution")
      .map((group) => prototypeProposalSolution(group)),
  );
  materials.push(
    ...[...groups, ...drafts].flatMap((item) =>
      item.srDependencyFile ? [item.srDependencyFile] : [],
    ),
  );
  if (prototypeRecoveryScenario === "review-chat")
    drafts[0]!.review = createPrototypeRequirementsReview(drafts[0]!, "j00808876");
  for (const group of [...groups, ...drafts]) {
    if (group.review) group.sessions.push(...prototypeReviewSessions(group.review));
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
