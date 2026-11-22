import type { Project, PrototypeRepositoryTarget, RequirementGroup } from "./workflow-state.js";
import type { AIReqPrHandoff } from "@zcode/services/aireq";
import { hasCurrentProposalSolution, alignmentBlocker } from "@zcode/services/aireq";

export function prototypeProposalBranch(irId: string): string {
  return `ir/${irId}`;
}

export function prototypeProposalRepositoryIssue(
  group: RequirementGroup,
  project: PrototypeRepositoryTarget | undefined,
): string | undefined {
  const delivery = group.proposalDelivery;
  const target = delivery?.repositoryTarget;
  if (!target) {
    if (delivery?.branch || delivery?.pushedAt || group.requirementsPr)
      return "当前文档交付缺少已绑定的 Git 仓库及目标分支。";
    return;
  }
  if (
    !project ||
    target.repositoryId !== project.repositoryId ||
    target.repositoryUrl !== project.repositoryUrl ||
    target.defaultBranch !== project.defaultBranch ||
    (group.requirementsPr && group.requirementsPr.targetBranch !== target.defaultBranch)
  )
    return "项目 Git 仓库或目标分支已变更，当前文档交付仍绑定原目标。";
}

/** 只读取交付信息，不创建分支或访问文件系统。 */
export function readPrototypeProposalPrHandoff(
  group: RequirementGroup,
  project: Project | undefined,
): AIReqPrHandoff {
  const projectDirectory = group.proposalLocation?.directory;
  const sourceDirectory = projectDirectory
    ? `${projectDirectory.replace(/\/$/, "")}/.aireq/proposals/${group.id}`
    : "";
  const branch = prototypeProposalBranch(group.id);
  const blockers: string[] = [];
  const reviewBlocker = alignmentBlocker(group);
  if (reviewBlocker) blockers.push(reviewBlocker);
  if (
    !project ||
    project.id !== group.projectId ||
    !project.repositoryUrl ||
    !project.defaultBranch
  )
    blockers.push("请先配置提案所属项目的 Git 仓库和默认分支。");
  const repositoryIssue = prototypeProposalRepositoryIssue(group, project);
  if (repositoryIssue) blockers.push(repositoryIssue);
  const target = group.proposalDelivery?.repositoryTarget ?? project;
  if (!projectDirectory) blockers.push("提案临时目录记录缺失。");
  else if (project && projectDirectory !== project.root)
    blockers.push("提案记录的 OMP 项目目录与所属项目不匹配。");
  if (!hasCurrentProposalSolution(group))
    blockers.push("请先完成当前需求版本的方案设计，再创建提案分支并提交推送。");
  return {
    blockers,
    sourceDirectory,
    branch,
    repositoryUrl: target?.repositoryUrl,
    targetBranch: target?.defaultBranch ?? "未配置",
  };
}
