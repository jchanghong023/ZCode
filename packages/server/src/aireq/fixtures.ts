import { createRequirementSnapshot } from "./content-digest.js";
import type { AIReqWorkflowView, AIReqMaterialView } from "@zcode/services/aireq";
import { proposalVersion } from "@zcode/services/aireq";
import { readPrototypeProjectSettings } from "./project-settings.js";
import { readPrototypeProjectReleases } from "./project-releases.js";
import { prototypeRecoveryScenario } from "./recovery.js";
import { prototypeRequirementDetails } from "./fixture-content.js";
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
import {
  createPrototypeReleaseRequirements,
  initializePrototypeReleaseProgress,
} from "./fixture-release.js";
export function createPrototypeWorkflow(): AIReqWorkflowView {
  const sharedSettings = readPrototypeProjectSettings();
  if (!sharedSettings.projects.length)
    return {
      version: 1,
      revision: 0,
      ideas: [],
      availableReleases: [],
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
  const releaseRequirements = createPrototypeReleaseRequirements();
  const srs = [
    ...releaseRequirements.srs,
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
      "ir-export",
      "sr-export-download",
      "导出结果下载与有效期提示",
      undefined,
      true,
    ),
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
    systemRequirement(
      "demo-aurora",
      "draft-delivery-digest",
      "proposal-sr-delivery-digest",
      "交付摘要订阅与业务定位",
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
    ...releaseRequirements.groups,
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
  const untouchedProposal = group(
    "demo-aurora",
    "draft-feedback-intake",
    "客户反馈归集",
    [],
    true,
    "j00808876",
  );
  const solutionProposal = group(
    "demo-mobile",
    "draft-search-filters",
    "搜索结果组合筛选",
    [],
    true,
    "j00808877",
  );
  solutionProposal.proposalStage = "solution";
  const publishProposal = group(
    "demo-aurora",
    "draft-delivery-digest",
    "每周交付摘要",
    srs.filter((sr) => sr.irId === "draft-delivery-digest"),
    true,
    "j00808875",
  );
  publishProposal.proposalStage = "solution";
  publishProposal.status = "solution-ready";
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
    untouchedProposal,
    solutionProposal,
    publishProposal,
  ];
  drafts[1]!.proposalStage = "solution";
  // 完整方案样例须与已生成材料一致，否则后续完整审查的版本及交付门禁无法闭环。
  drafts[1]!.status = "solution-ready";
  readyProposal.proposalStage = "solution";
  intakeProposal.proposalStage = "solution";
  readyProposal.status = "solution-ready";
  intakeProposal.status = "requirements-pr";
  // 业务澄清样例不预先拆 SR；只有历史上已通过前置评审的方案样例保留独立 SR。
  for (const proposal of drafts.filter((item) => item.proposalStage !== "solution")) {
    for (let index = srs.length - 1; index >= 0; index--)
      if (srs[index]!.projectId === proposal.projectId && srs[index]!.irId === proposal.id)
        srs.splice(index, 1);
    proposal.srIds = [];
  }
  const materials: AIReqMaterialView[] = [];
  for (const item of [...groups, ...drafts]) {
    Object.assign(item, structuredClone(prototypeRequirementDetails[item.id]));
    item.contacts = {
      business: item.submittedBy ?? "j00808874",
      development: "j00808874",
      testing: "j00808875",
      ...prototypeRequirementDetails[item.id]?.contacts,
    };
    // 未讨论的已入库原文没有 AI 产物；不能借初始化材料冒充已经开始澄清。
    if (item === untouchedProposal) {
      item.files = [];
      item.snapshot = undefined;
      continue;
    }
    const rows = srs.filter((sr) => sr.projectId === item.projectId && sr.irId === item.id);
    for (const sr of rows) {
      sr.developerEmployeeId = item.contacts.development;
      sr.testingEmployeeId = item.contacts.testing;
    }
    const bundle = requirementMaterials(
      item.projectId,
      item.id,
      item.title,
      rows,
      item.originalText,
    );
    if (rows.length) {
      item.srDependencyFile = prototypeProposalDependencies(item, rows);
      const summary = prototypeProposalSolution(item);
      const summaryIndex = bundle.findIndex((material) => material.path === summary.path);
      if (summaryIndex >= 0) bundle.splice(summaryIndex, 1);
      bundle.push(summary, item.srDependencyFile);
      item.proposalSolution = {
        path: summary.path,
        employeeId: "j00808874",
        generatedAt: createdAt,
        round: item.proposalRound ?? 1,
        valid: true,
        requirementsDigest: "",
      };
    }
    item.files = bundle.map(({ path, sha256, size }) => ({ path, sha256, size }));
    item.snapshot = createRequirementSnapshot({
      version: 1,
      projectId: item.projectId,
      irId: item.id,
      title: item.title,
      documentPath: item.documentPath,
      files: structuredClone(item.files),
      srs: rows.map(({ id, title, documentPath }) => ({ id, title, documentPath })),
    });
    if (item.proposalSolution) item.proposalSolution.requirementsDigest = item.snapshot.digest;
    materials.push(...bundle);
    // review-chat 只初始化所选提案的真实单评审引用，不影响其他启动样例或恢复退役流程。
    if (
      rows.length ||
      item === reviewProposal ||
      item === solutionProposal ||
      (prototypeRecoveryScenario === "review-chat" && item.id === "draft-automation")
    ) {
      item.originalReview = createPrototypeRequirementsReview(
        item,
        "j00808874",
        rows.length > 0 || item === solutionProposal,
      );
      item.originalReview.createdAt = createdAt;
      if (item.originalReview.humanDecision)
        item.originalReview.humanDecision.decidedAt = createdAt;
      item.sessions.push(...prototypeReviewSessions(item.originalReview));
    }
    if (item.proposalStage === "solution") {
      item.sessions.push(sessionRef(item.projectId, item.id, "solution"));
      item.developerAcceptance = { employeeId: "j00808874", acceptedAt: createdAt, round: 1 };
    }
    if (
      groups.includes(item) ||
      item === drafts[1] ||
      item === readyProposal ||
      item === intakeProposal ||
      item === publishProposal
    ) {
      item.review = createPrototypeRequirementsReview(
        item,
        "j00808874",
        item !== drafts[1],
        "full",
      );
      item.review.createdAt = createdAt;
      if (item.review.humanDecision) item.review.humanDecision.decidedAt = createdAt;
      item.sessions.push(...prototypeReviewSessions(item.review));
      if (groups.includes(item) || item === intakeProposal || item === publishProposal) {
        item.alignment = (["business", "development", "testing"] as const).map((perspective) => ({
          perspective,
          version: proposalVersion(item),
          employeeId: "j00808874",
          confirmedAt: createdAt,
        }));
      }
    }
    if (groups.includes(item)) {
      item.merge = {
        commit: `sample-merged-${item.id}`,
        branch: sharedSettings.projects.find((project) => project.id === item.projectId)!
          .defaultBranch,
        checkedAt: createdAt,
        files: structuredClone(item.files),
      };
      freezePrototypeRequirement(item, "j00808874", createdAt);
      // 初始开发分支也必须基于本 IR 的文档合入提交，不能误用项目当前主分支。
      for (const sr of rows) {
        sr.trackingBranch = {
          name: `sr/${sr.id}`,
          baseCommit: item.merge.commit,
          createdAt,
          pushedAt: createdAt,
          status: "ready",
        };
      }
    }
  }
  for (const sr of srs.filter((row) => row.status === "completed")) {
    const project = sharedSettings.projects.find((item) => item.id === sr.projectId)!;
    sr.codeMerge = {
      commit: `${sr.id}-head`,
      branch: project.defaultBranch,
      checkedAt: "2026-11-11T01:30:00.000Z",
      files: [],
    };
    if (
      [
        "sr-onboarding",
        "sr-notification-inbox",
        "sr-audit-retention",
        "sr-mobile-profile",
      ].includes(sr.id)
    ) {
      sr.testAcceptance = {
        operationId: `sample-test-${sr.id}`,
        outcome: "passed",
        employeeId: "j00808874",
        at: "2026-11-11T01:30:00.000Z",
        reason: "测试验收通过。",
        codeVersion: `${sr.id}-head`,
      };
      sr.acceptanceHistory = [structuredClone(sr.testAcceptance)];
    } else sr.status = "developing";
  }
  drafts[2]!.returnFeedback = {
    employeeId: "j00808876",
    returnedAt: "2026-11-11T03:00:00.000Z",
    reason: "请补充跨项目结果隔离、离线搜索的可用范围，以及从结果返回后保留检索条件的验收规则。",
  };
  const unassignedSr = srs.find((sr) => sr.id === "sr-dashboard-filters")!;
  unassignedSr.developerEmployeeId = undefined;
  unassignedSr.testingEmployeeId = undefined;
  unassignedSr.planning = { source: "manual", assumptions: "" };
  for (const [id, start, end] of [
    ["sr-auth", "2026-11-16T09:00", "2026-11-20T18:00"],
    ["sr-session", "2026-11-16T09:00", "2026-11-18T18:00"],
    ["sr-mobile-navigation", "2026-11-17T09:00", "2026-11-23T18:00"],
  ]) {
    const sr = srs.find((item) => item.id === id)!;
    sr.planning = {
      source: "manual",
      assumptions: "按已确认分工安排，依赖变化后由负责人重新核对。",
      plannedStart: start,
      plannedEnd: end,
      updatedBy: "j00808874",
      updatedAt: "2026-11-15T06:00:00.000Z",
    };
  }
  for (const id of ["sr-export", "sr-mobile-notifications"]) {
    const sr = srs.find((item) => item.id === id)!;
    const awaitingRetest = id === "sr-mobile-notifications";
    const failedVersion = awaitingRetest ? `${id}-previous-head` : `${id}-head`;
    sr.codeMerge = {
      commit: `${id}-head`,
      branch: "main",
      checkedAt: awaitingRetest ? "2026-11-12T02:00:00.000Z" : "2026-11-11T02:00:00.000Z",
      files: [],
    };
    sr.testAcceptance = {
      operationId: `sample-test-failed-${id}`,
      outcome: "failed",
      employeeId: sr.testingEmployeeId!,
      at: "2026-11-11T06:00:00.000Z",
      reason: awaitingRetest
        ? "重复通知仍会增加未读数，修复合入后需要重新验证。"
        : "下载链接失效后无法重新获取，筛选条件被清空。",
      codeVersion: failedVersion,
    };
    sr.acceptanceHistory = [structuredClone(sr.testAcceptance)];
    sr.developmentIssues = [
      {
        id: `sample-issue-${id}`,
        detail: sr.testAcceptance.reason,
        failedCodeVersion: failedVersion,
        reportedBy: sr.testAcceptance.employeeId,
        reportedAt: sr.testAcceptance.at,
        status: awaitingRetest ? "awaiting-retest" : "open",
        ...(awaitingRetest ? { fixCodeVersion: sr.codeMerge.commit } : {}),
      },
    ];
    sr.status = "developing";
  }
  const branchFailure = srs.find((sr) => sr.id === "sr-mobile-offline")!;
  branchFailure.trackingBranch = {
    name: `sr/${branchFailure.id}`,
    baseCommit: "sample-merged-ir-mobile-offline",
    createdAt,
    pushedAt: "",
    status: "failed",
    error: "开发分支创建未完成，请核对仓库状态后重试。",
  };
  if (prototypeRecoveryScenario === "proposal-feedback") {
    drafts[1]!.proposalStage = "requirements";
    drafts[1]!.status = "draft";
    drafts[1]!.returnFeedback = {
      employeeId: "j00808875",
      returnedAt: createdAt,
      reason: "请补充通知失败后的业务恢复规则及验收依据。",
    };
  }
  initializePrototypeReleaseProgress(srs);
  const result: AIReqWorkflowView = {
    version: 1,
    revision: 12,
    ideas: [
      {
        id: "idea-backlog-intake",
        originalText:
          "收集客户反馈时，希望能一次粘贴多条原始诉求，逐条确认后进入想法池，并保留反馈来源，减少人工拆分和遗漏。",
        submittedBy: "j00808874",
        createdAt: "2026-11-10T02:20:00.000Z",
        updatedAt: "2026-11-10T02:20:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-related-needs",
        originalText:
          "新增需求前，希望能检索已有想法和需求中的相似内容，查看原文及当前处理情况，由提交人决定继续新增还是补充已有需求。",
        submittedBy: "j00808875",
        createdAt: "2026-11-10T07:45:00.000Z",
        updatedAt: "2026-11-10T07:45:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-discussion-summary",
        originalText:
          "需求讨论较长时，希望能查看已确认结论、尚未解决的问题和对应讨论位置，便于新加入的业务、开发与测试人员快速接续讨论。",
        submittedBy: "j00808876",
        createdAt: "2026-11-11T01:15:00.000Z",
        updatedAt: "2026-11-11T01:15:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-release-capacity",
        originalText:
          "安排版本需求时，希望集中查看候选需求的工作量、负责人和依赖，识别资源冲突后再确认排期，不直接改变已有版本计划。",
        submittedBy: "j00808874",
        createdAt: "2026-11-12T06:30:00.000Z",
        updatedAt: "2026-11-12T06:30:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-delivery-digest",
        originalText:
          "希望按项目订阅交付摘要，集中了解本周完成的需求、待处理的阻塞和需要本人确认的事项，避免逐个页面查找进展。",
        submittedBy: "j00808877",
        createdAt: "2026-11-13T03:10:00.000Z",
        updatedAt: "2026-11-13T03:10:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-acceptance-evidence",
        originalText:
          "测试验收时，希望按验收条件整理结果与证明材料，明确区分通过、未通过和未执行，方便业务人员核对后作出验收结论。",
        submittedBy: "j00808876",
        createdAt: "2026-11-14T08:00:00.000Z",
        updatedAt: "2026-11-14T08:00:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-decision-history",
        originalText:
          "需求发生变更时，希望能查看变更前后的业务规则、调整原因和确认人，并定位受影响的方案与验收条件，减少跨角色理解偏差。",
        submittedBy: "j00808875",
        createdAt: "2026-11-16T02:40:00.000Z",
        updatedAt: "2026-11-16T02:40:00.000Z",
        revision: 1,
      },
      {
        id: "idea-backlog-knowledge-reuse",
        originalText:
          "创建相似需求时，希望能查阅过往已交付需求的业务背景、方案取舍和验收经验，选择需要引用的材料，同时保持新需求独立管理。",
        submittedBy: "j00808877",
        createdAt: "2026-11-17T01:00:00.000Z",
        updatedAt: "2026-11-17T01:00:00.000Z",
        revision: 1,
      },
    ],
    availableReleases: readPrototypeProjectReleases(),
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
      receipt("需求整理", 1, "ir-auth"),
      receipt("提案方案已随需求合入", 2, "ir-auth"),
      receipt("计划准备", 3, "ir-auth", "sr-session"),
      receipt("验证报告展示", 4, "ir-auth", "sr-permissions"),
      receipt("交付信息展示", 5, "ir-auth", "sr-audit"),
      receipt("完成状态展示", 6, "ir-auth", "sr-onboarding"),
      receipt("需求整理", 7, "ir-dashboard"),
      receipt("草稿创建", 8, "draft-automation"),
      receipt("移动工作台需求", 9, "ir-mobile", "sr-mobile-navigation"),
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
      status: "M",
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
