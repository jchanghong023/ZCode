import type {
  AIReqDiscussionAgent,
  AIReqProject,
  AIReqRemoteWorkflow,
  AIReqRequirementGroup,
} from "@zcode/services/aireq";
import { posix, win32 } from "node:path";
import { unique, type STClient } from "./client.js";
import { config, requireConfig } from "./config.js";
import { occupyRequirement, readOccupiedRequirements, requirementKey } from "./resources.js";

type RequirementFixture = NonNullable<typeof config.fixtures.requirements>[number];
type RequirementScope = {
  projectId?: string;
  releaseId?: string;
  requireRelease?: boolean;
  requireSibling?: boolean;
  configuredProject?: boolean;
  unboundPhase?: AIReqDiscussionAgent;
};

function blocked(message: string, cause?: unknown): Error {
  return new Error(`ST 前置阻塞：${message}`, { cause });
}

function publicFixture(remote: AIReqRemoteWorkflow, fixture: RequirementFixture) {
  const { projectId, irId, releaseId } = fixture;
  const key = requirementKey(fixture);
  const { projects, requirements, releases } = remote.view;
  if (!projects.some(({ id }) => id === projectId))
    throw blocked(`云龙项目不在公开目录中：${projectId}`);
  const requirement = requirements.find((item) => item.projectId === projectId && item.id === irId);
  if (!requirement) throw blocked(`IR 不属于清单指定的云龙项目：${key}`);
  if (releaseId !== undefined && requirement.releaseId !== releaseId)
    throw blocked(`IR ${key} 不属于清单指定的 Release ${releaseId}`);
  if (
    requirement.releaseId &&
    !releases.some(
      (release) => release.projectId === projectId && release.id === requirement.releaseId,
    )
  ) {
    throw blocked(
      `IR ${key} 的 Release ${requirement.releaseId} 不属于公开目录中的项目 ${projectId}`,
    );
  }
  return requirement;
}

function hasDocumentState(remote: AIReqRemoteWorkflow, requirement: AIReqRequirementGroup) {
  const { id, projectId, documentVersion, documentHistory, documentReviews, srIds } = requirement;
  return (
    documentVersion !== undefined ||
    documentHistory.length > 0 ||
    documentReviews.length > 0 ||
    srIds.length > 0 ||
    remote.view.materials.some((file) => file.projectId === projectId && file.irId === id)
  );
}

function selectedRequirement(remote: AIReqRemoteWorkflow, requirement: AIReqRequirementGroup) {
  const { projectId, id: irId, releaseId } = requirement;
  return { projectId, irId, releaseId, selection: { projectId, irId }, remote };
}

export async function takeRequirement(client: STClient, scope: RequirementScope = {}) {
  const rows = config.fixtures.requirements;
  if (!rows?.length) throw blocked("ST_FIXTURES_FILE 未提供 requirements 夹具");
  if (scope.configuredProject && !config.fixtures.projects?.length)
    throw blocked("ST_FIXTURES_FILE 未提供 projects 夹具");
  const declaredProjects = new Set(config.fixtures.projects?.map(({ projectId }) => projectId));
  const occupied = readOccupiedRequirements();
  const projectViews = new Map<string, AIReqRemoteWorkflow>();
  const rejected = new Set<string>();

  function eligible(remote: AIReqRemoteWorkflow, row: RequirementFixture, releaseId?: string) {
    const requirement = publicFixture(remote, row);
    if (releaseId !== undefined && requirement.releaseId !== releaseId) return;
    if ((scope.requireRelease || scope.requireSibling) && !requirement.releaseId) {
      rejected.add(`${requirementKey(row)} 未分配 Release`);
      return;
    }
    if (hasDocumentState(remote, requirement)) {
      rejected.add(`${requirementKey(row)} 已有本地文档状态，不能从干净的 V1 开始`);
      return;
    }
    if (
      scope.unboundPhase !== undefined &&
      requirement.sessions.some(
        ({ phase, modelConfig }) => phase === scope.unboundPhase && modelConfig !== undefined,
      )
    ) {
      rejected.add(`${requirementKey(row)} 已绑定 ${scope.unboundPhase} 阶段的模型`);
      return;
    }
    return requirement;
  }

  for (const row of rows) {
    const { projectId, irId, releaseId } = row;
    if (scope.projectId !== undefined && projectId !== scope.projectId) continue;
    if (scope.configuredProject && !declaredProjects.has(projectId)) continue;
    if (scope.releaseId !== undefined && releaseId !== undefined && releaseId !== scope.releaseId)
      continue;
    if (occupied.has(requirementKey(row))) continue;

    // 项目投影可核对同项目的全部夹具，但不会提前绑定未选中 IR 的会话模型。
    const cached = projectViews.get(projectId);
    const directory =
      cached ??
      (await client.read({ projectId }).catch((error: unknown) => {
        throw blocked(`无法读取夹具项目 ${projectId} 的公开工作流`, error);
      }));
    if (!cached) projectViews.set(projectId, directory);
    const candidate = eligible(directory, row, scope.releaseId);
    if (!candidate) continue;
    if (
      scope.requireSibling &&
      !rows.some(
        (sibling) =>
          sibling.projectId === projectId &&
          sibling.irId !== irId &&
          (sibling.releaseId === undefined || sibling.releaseId === candidate.releaseId) &&
          !occupied.has(requirementKey(sibling)) &&
          eligible(directory, sibling, candidate.releaseId),
      )
    ) {
      rejected.add(`${requirementKey(row)} 的同项目同 Release 没有第二条干净且未占用的夹具 IR`);
      continue;
    }

    const remote = await client
      .read({
        projectId,
        irId,
        ...(scope.unboundPhase === undefined ? {} : { discussionPhase: scope.unboundPhase }),
      })
      .catch((error: unknown) => {
        throw blocked(`无法读取夹具 IR ${requirementKey(row)} 的公开工作流`, error);
      });
    const selected = publicFixture(remote, row);
    if (selected.releaseId !== candidate.releaseId || hasDocumentState(remote, selected))
      throw blocked(`核验后 IR ${requirementKey(row)} 的 Release 或本地文档状态已变化`);
    occupyRequirement(row);
    return selectedRequirement(remote, selected);
  }

  const detail = rejected.size ? `；${[...rejected].join("；")}` : "";
  throw blocked(`没有符合范围 ${JSON.stringify(scope)} 的未占用 requirements 夹具${detail}`);
}

export async function readRequirement(client: STClient) {
  const { projects } = (await client.read()).view;
  const failures: unknown[] = [];
  // 只读及拒绝路径可使用公开目录；变更用例不得从这里补位，也不登记占用。
  for (const { id: projectId } of projects) {
    try {
      const { requirements } = (await client.read({ projectId })).view;
      for (const item of requirements) {
        if (item.projectId !== projectId) continue;
        try {
          const remote = await client.read({ projectId, irId: item.id });
          const requirement = publicFixture(remote, { projectId, irId: item.id });
          if (
            remote.session?.projectId === projectId &&
            remote.session.irId === item.id &&
            remote.session.phase === "requirements" &&
            remote.workspace.kind !== "unavailable" &&
            remote.workspace.path
          ) {
            return selectedRequirement(remote, requirement);
          }
        } catch (error) {
          failures.push(error);
        }
      }
    } catch (error) {
      failures.push(error);
    }
  }
  throw blocked(
    "公开目录中没有具备可用需求会话和工作区的 IR",
    failures.length ? new AggregateError(failures) : undefined,
  );
}

function requireProjectFixture(projectId: string) {
  const fixture = config.fixtures.projects?.find((project) => project.projectId === projectId);
  if (!fixture) throw blocked(`项目 ${projectId} 未列入 ST_FIXTURES_FILE 的专用 projects`);
  return fixture;
}

async function readProject(client: STClient, projectId: string): Promise<AIReqProject> {
  const project = (await client.read()).view.projects.find(({ id }) => id === projectId);
  if (!project) throw blocked(`专用项目 ${projectId} 不在云龙公开目录中`);
  return project;
}

export async function requireTestProject(client: STClient, excludeProjectId?: string) {
  const fixture = config.fixtures.projects?.find(({ projectId }) => projectId !== excludeProjectId);
  if (!fixture)
    throw blocked(
      excludeProjectId === undefined
        ? "ST_FIXTURES_FILE 未提供专用 projects"
        : `ST_FIXTURES_FILE 未提供 ${excludeProjectId} 之外的第二个专用项目`,
    );
  return readProject(client, fixture.projectId);
}

type RepositorySettings = { repositoryUrl: string; defaultBranch: string; workDirectory: string };

export function setTestProjectRepository(
  client: STClient,
  projectId: string,
  input: RepositorySettings & { expectedRevision: number; operationId: string },
) {
  requireProjectFixture(projectId);
  return client.call("projects.saveRepository", [{ ...input, projectId }]);
}

function uniqueWorkDirectory(): string {
  const root = config.workDirectoryRoot.trim();
  const name = unique("st-project");
  // 路径由服务端解析，不能用测试进程的系统路径规则改写对端的绝对挂载路径。
  if (!root.startsWith("//") && posix.isAbsolute(root)) return posix.join(root, name);
  if (win32.isAbsolute(root) && win32.parse(root).root.length > 1) return win32.join(root, name);
  if (posix.isAbsolute(root)) return posix.join(root, name);
  throw blocked("ST_WORK_DIRECTORY_ROOT 必须为服务端和测试进程共享挂载的绝对路径");
}

function matchesRepository(
  project: AIReqProject,
  revision: number,
  { repositoryUrl, defaultBranch, workDirectory }: RepositorySettings,
) {
  return (
    project.revision === revision &&
    project.repositoryUrl === repositoryUrl &&
    project.defaultBranch === defaultBranch &&
    project.workDirectory === workDirectory
  );
}

export async function withProjectRepository<T>(
  client: STClient,
  projectId: string,
  run: (project: AIReqProject) => Promise<T>,
): Promise<T> {
  const fixture = requireProjectFixture(projectId);
  const original = await readProject(client, projectId);
  const { repositoryUrl, defaultBranch, workDirectory } = original;
  const baseline =
    repositoryUrl && defaultBranch && workDirectory
      ? { repositoryUrl, defaultBranch, workDirectory }
      : undefined;
  if (!baseline && (repositoryUrl !== undefined || workDirectory !== undefined))
    throw blocked(`专用项目 ${projectId} 的仓库配置基线不完整，不能安全恢复`);
  if (!baseline && fixture.allowUnconfigured !== true)
    throw blocked(`专用项目 ${projectId} 未配置仓库，未明确允许保留变更终态`);

  const next: RepositorySettings = {
    repositoryUrl: requireConfig(config.repositoryUrl.trim(), "ST_REPOSITORY_URL"),
    defaultBranch: requireConfig(config.branch.trim(), "ST_REPOSITORY_BRANCH"),
    // 非空旧目录在切换后失去归属，公开接口不能切回；有基线时只能改可回写字段。
    workDirectory: baseline?.workDirectory ?? uniqueWorkDirectory(),
  };
  if (
    baseline &&
    baseline.repositoryUrl === next.repositoryUrl &&
    baseline.defaultBranch === next.defaultBranch
  ) {
    next.defaultBranch = unique("st-config");
  }

  await setTestProjectRepository(client, projectId, {
    ...next,
    expectedRevision: original.revision,
    operationId: unique("st-save-repository"),
  });
  const revision = original.revision + 1;
  let result: { value: T } | { error: unknown };
  try {
    const applied = await readProject(client, projectId);
    if (!matchesRepository(applied, revision, next))
      throw new Error(`项目 ${projectId} 的 ST 配置写入未返回预期 revision 与值`);
    result = { value: await run(applied) };
  } catch (error) {
    result = { error };
  }
  if (baseline) {
    try {
      const current = await readProject(client, projectId);
      if (!matchesRepository(current, revision, next))
        throw new Error(`项目 ${projectId} 的仓库配置已被修改，拒绝覆盖其他写入；请核对 ST 终态`);
      await setTestProjectRepository(client, projectId, {
        ...baseline,
        expectedRevision: current.revision,
        operationId: unique("st-restore-repository"),
      });
      if (!matchesRepository(await readProject(client, projectId), current.revision + 1, baseline))
        throw new Error(`项目 ${projectId} 的仓库配置恢复后与预期 revision 或原值不符`);
    } catch (error) {
      if ("error" in result) {
        throw new AggregateError(
          [result.error, error],
          `项目 ${projectId} 的 ST 主体和仓库配置恢复均失败`,
        );
      }
      throw error;
    }
  }
  // 无基线的隔离项目保留明确允许的配置终态；服务端共享目录不由 ST 删除。
  if ("error" in result) throw result.error;
  return result.value;
}
