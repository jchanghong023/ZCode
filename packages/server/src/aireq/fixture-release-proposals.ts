import { aiReqPrFactSchema, type AIReqMaterialView } from "@zcode/services/aireq";
import { createRequirementSnapshot } from "./content-digest.js";
import { createdAt, group, sessionRef, systemRequirement } from "./fixture-builders.js";
import { checkProposalMaterials, emptyDocumentFormats, requirementMaterials } from "./materials.js";
import { prototypeRepositoryTarget, readPrototypeProjectSetting } from "./project-settings.js";
import { prototypeProposalDependencies } from "./proposal-flow.js";
import {
  createPrototypeRequirementsReview,
  prototypeReviewSessions,
} from "./requirements-review.js";
import { preparePrototypeProposalCandidate } from "./proposal-delivery.js";
import { prototypeProposalBranch } from "./proposal-pr-handoff.js";
import type { Project, RequirementGroup, SystemRequirement } from "./workflow-state.js";

interface ProposalSample {
  id: string;
  title: string;
  originalText: string;
  material: "none" | "business" | "solution";
  originalReview?: "failed" | "reviewed" | "confirmed";
  fullReview?: "failed" | "reviewed";
  aligned?: boolean;
  published?: boolean;
  srTitle?: string;
}

// 业务样例只登记实际材料和确认事实，不设置派生状态或按客户端选择数据。
const proposals: ProposalSample[] = [
  {
    id: "draft-team-invitation",
    title: "成员邀请链接管理",
    originalText: "管理员可查看邀请链接的有效期并撤销未使用的邀请，撤销后不能继续加入团队。",
    material: "none",
  },
  {
    id: "draft-notification-mute",
    title: "通知免打扰时段",
    originalText: "成员可设置跨日免打扰时段，时段内停止提醒但保留站内消息，保存失败时保留输入。",
    material: "business",
    originalReview: "failed",
  },
  {
    id: "draft-project-favorites",
    title: "常用项目收藏",
    originalText: "成员可收藏常用项目并取消收藏，收藏仅影响本人，失效项目需说明无法进入的原因。",
    material: "business",
    originalReview: "reviewed",
  },
  {
    id: "draft-search-history",
    title: "个人搜索历史",
    originalText: "成员可复用近期搜索条件并清除本人搜索历史，其他成员看不到这些记录。",
    material: "business",
    originalReview: "confirmed",
  },
  {
    id: "draft-release-calendar",
    title: "版本交付日历",
    originalText:
      "在当前版本按日期查看需求计划，未排期需求单独展示，切换版本后不混入其他版本数据。",
    material: "solution",
    originalReview: "confirmed",
    fullReview: "failed",
    srTitle: "交付日历与未排期需求展示",
  },
  {
    id: "draft-batch-notification-read",
    title: "通知批量已读",
    originalText: "成员可将当前筛选范围的通知标记已读，重复操作无副作用，失败时保留未读状态。",
    material: "solution",
    originalReview: "confirmed",
    fullReview: "reviewed",
    srTitle: "批量已读范围与失败恢复",
  },
  {
    id: "draft-member-activity-export",
    title: "成员活动导出",
    originalText: "管理员可导出当前项目成员活动，保留筛选条件与中文内容，无数据时明确反馈。",
    material: "solution",
    originalReview: "confirmed",
    fullReview: "reviewed",
    aligned: true,
    srTitle: "活动筛选导出与空结果反馈",
  },
  {
    id: "draft-release-change-summary",
    title: "版本变更摘要",
    originalText: "业务成员可阅读当前版本变更摘要并定位原需求，摘要内容与已确认的材料保持一致。",
    material: "solution",
    originalReview: "confirmed",
    fullReview: "reviewed",
    aligned: true,
    published: true,
    srTitle: "变更摘要与需求定位",
  },
];

/** 初始化同一默认版本的独立提案；后续修改仍走正常 workflow owner。 */
export function createPrototypeReleaseProposals() {
  const drafts: RequirementGroup[] = [];
  const srs: SystemRequirement[] = [];
  const materials: AIReqMaterialView[] = [];
  const employeeId = "j00808874";
  const projectId = "demo-aurora";
  const project = readPrototypeProjectSetting(projectId);
  if (!project) return { drafts, srs, materials };
  for (const sample of proposals) {
    const rows = sample.srTitle
      ? [systemRequirement(projectId, sample.id, `sr-${sample.id.slice(6)}`, sample.srTitle)]
      : [];
    const proposal = group(projectId, sample.id, sample.title, rows, true, employeeId);
    proposal.originalText = sample.originalText;
    proposal.contacts = { business: employeeId, development: employeeId, testing: "j00808875" };
    drafts.push(proposal);
    srs.push(...rows);
    if (sample.material === "none") {
      proposal.files = [];
      proposal.snapshot = undefined;
      continue;
    }
    const bundle = requirementMaterials(
      projectId,
      proposal.id,
      proposal.title,
      rows,
      sample.originalText,
    );
    for (const material of bundle) material.round = proposal.proposalRound ?? 1;
    const formats = emptyDocumentFormats();
    proposal.requirementsCheck = checkProposalMaterials(proposal, bundle, "requirements", formats);
    if (rows.length) {
      proposal.srDependencyFile = prototypeProposalDependencies(proposal, rows);
      bundle.push(proposal.srDependencyFile);
      proposal.solutionCheck = checkProposalMaterials(proposal, bundle, "solution", formats);
      proposal.proposalSolution = {
        path: `openspec/changes/${rows[0]!.id}/design.md`,
        employeeId,
        generatedAt: createdAt,
        round: 1,
        valid: proposal.solutionCheck.issues.length === 0,
        requirementsDigest: "",
      };
    }
    proposal.files = bundle.map(({ path, sha256, size }) => ({ path, sha256, size }));
    proposal.snapshot = createRequirementSnapshot({
      projectId,
      irId: proposal.id,
      title: proposal.title,
      documentPath: proposal.documentPath,
      files: structuredClone(proposal.files),
      srs: rows.map(({ id, title, documentPath }) => ({ id, title, documentPath })),
    });
    if (proposal.proposalSolution)
      proposal.proposalSolution.requirementsDigest = proposal.snapshot.digest;
    materials.push(...bundle);
    if (sample.originalReview) {
      proposal.originalReview = createPrototypeRequirementsReview(
        proposal,
        employeeId,
        "original",
        sample.originalReview,
      );
      proposal.originalReview.createdAt = createdAt;
      if (proposal.originalReview.humanDecision)
        proposal.originalReview.humanDecision.decidedAt = createdAt;
      proposal.sessions.push(...prototypeReviewSessions(proposal.originalReview));
    }
    if (sample.originalReview === "confirmed") {
      proposal.proposalStage = "solution";
      proposal.sessions.push(sessionRef(projectId, proposal.id, "solution"));
      proposal.developerAcceptance = { employeeId, acceptedAt: createdAt, round: 1 };
    }
    if (rows.length) proposal.status = "solution-ready";
    if (sample.fullReview) {
      proposal.review = createPrototypeRequirementsReview(
        proposal,
        employeeId,
        "full",
        sample.fullReview,
      );
      proposal.review.createdAt = createdAt;
      proposal.sessions.push(...prototypeReviewSessions(proposal.review));
    }
    if (sample.aligned) {
      proposal.alignment = (["business", "development", "testing"] as const).map((perspective) => ({
        perspective,
        version: proposal.review!.snapshotDigest,
        reviewId: proposal.review!.id,
        snapshotDigest: proposal.review!.snapshotDigest,
        employeeId,
        confirmedAt: createdAt,
      }));
      preparePrototypeProposalCandidate(
        proposal,
        `sample-document-${proposal.id}`,
        employeeId,
        createdAt,
      );
    }
    if (sample.published) seedPrototypePublishedProposal(proposal, project, 98);
  }
  return { drafts, srs, materials };
}

/** An opened seed is an existing business record, not a simulated future merge. */
export function seedPrototypePublishedProposal(
  proposal: RequirementGroup,
  project: Readonly<Project>,
  number: number,
): void {
  const delivery = proposal.proposalDelivery!;
  delivery.repositoryTarget = prototypeRepositoryTarget(project);
  delivery.branch = {
    name: prototypeProposalBranch(proposal.id),
    baseCommit: `sample-default-${project.repositoryId}`,
    createdAt,
    pushedAt: createdAt,
  };
  delivery.pushedCandidate = delivery.candidate;
  delivery.pushedAt = createdAt;
  delivery.prCandidate = delivery.candidate;
  delivery.mergeCheck = {
    status: "untracked",
    message: "文档 PR 已打开，开始跟踪后将自动核验合入与材料完整性。",
  };
  proposal.requirementsPr = aiReqPrFactSchema.parse({
    number,
    title: `[需求] ${proposal.title}`,
    status: "opened",
    sourceBranch: delivery.branch.name,
    targetBranch: project.defaultBranch,
    recordedAt: createdAt,
    platformVerified: false,
  });
  proposal.status = "requirements-pr";
}
