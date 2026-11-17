import type { STClient } from "./client.js";
import { unique } from "./client.js";
import { recordCreated } from "./resources.js";
import { config, requireConfig } from "./config.js";
export async function createProject(client: STClient) {
  const repositoryUrl = requireConfig(config.repositoryUrl, "ST_REPOSITORY_URL（专用测试仓库）");
  const name = unique("ST-project");
  await client.call("projects.saveRepository", [
    {
      name,
      repositoryUrl,
      defaultBranch: config.branch,
      expectedRevision: 0,
      operationId: unique("repository"),
    },
  ]);
  const remote = await client.read();
  const project = remote.view.projects.find((project) => project.name === name);
  if (!project) throw new Error("新建项目未通过公开读取返回");
  recordCreated(project.id);
  const selection = { projectId: project.id };
  const title = unique("ST-release");
  await client.command({ type: "createRelease", title, projectId: project.id }, selection);
  const next = await client.read(selection);
  const release = next.view.releases.find(
    (release) => release.projectId === project.id && release.title === title,
  );
  if (!release) throw new Error("新建 Release 未通过公开读取返回");
  return { projectId: project.id, releaseId: release.id, selection };
}
export async function createProposal(
  client: STClient,
  text = "支持导出 CSV，并提供明确的完成与失败提示。",
) {
  const project = await createProject(client);
  const result = await client.command(
    {
      type: "createProposal",
      originalText: `${text}\n${unique("ST")}`,
      releaseId: project.releaseId,
      projectId: project.projectId,
    },
    project.selection,
  );
  if (!result.irId) throw new Error("创建提案未返回 IR 标识");
  recordCreated(project.projectId, result.irId);
  const selection = { projectId: project.projectId, irId: result.irId };
  return { ...project, irId: result.irId, selection, remote: await client.read(selection) };
}
