import { execFile } from "node:child_process";
import { z } from "zod";
import { businessRule } from "./errors.js";

const projectId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const project = z.object({ id: projectId, name: z.string() });
const domainId = z.string().regex(/^[0-9]+$/);
const domainResponse = z.object({
  project: projectId,
  count: z.number().int().nonnegative(),
  domains: z.array(z.object({ id: domainId })),
});
const requirement = z.object({
  businessNo: z.string().regex(/^IR[0-9]+$/),
  name: z.string(),
  description: z.string(),
  creator: z.string(),
  submitter: z.string(),
  createDate: z.string(),
  domain: domainId,
  pi: z.string().nullish(),
  piName: z.string().nullish(),
});
const domainPage = z.object({
  id: domainId,
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  irs: z.array(requirement),
});
const requirementResponse = z.object({
  project: projectId,
  domains: z.array(domainPage),
});
export type CloudDragonProject = z.infer<typeof project>;
type CloudDragonRequirement = z.infer<typeof requirement>;

const failure = z.object({
  ok: z.literal(false),
  error: z.object({ type: z.string(), message: z.string() }),
});

function parseJson(output: string): unknown {
  try {
    return JSON.parse(output.trim());
  } catch {
    return undefined;
  }
}

function runCloudDragon<T extends { project: string }>(
  args: string[],
  data: z.ZodType<T>,
  selectedProjectId?: string,
): Promise<T> {
  const response = z.object({ ok: z.literal(true), data });
  const projectArgs = selectedProjectId ? ["--project", selectedProjectId] : [];
  return new Promise((resolve, reject) => {
    execFile(
      "clouddragon",
      [...projectArgs, ...args],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 60_000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const result = failure.safeParse(parseJson(stderr));
          if (error.code === "ENOENT")
            reject(businessRule("服务端找不到 clouddragon，请检查安装和 PATH。"));
          else if (result.success && result.data.error.type === "AuthenticationError")
            reject(businessRule("云龙鉴权失败，请检查服务端的云龙登录状态。"));
          else reject(businessRule("云龙读取失败，请检查 clouddragon 后重试。"));
          return;
        }
        const result = response.safeParse(parseJson(stdout));
        if (!result.success) {
          reject(businessRule("云龙返回了无法读取的数据。"));
          return;
        }
        if (selectedProjectId && result.data.data.project !== selectedProjectId) {
          reject(businessRule("云龙返回的项目与请求项目不匹配。"));
          return;
        }
        resolve(result.data.data);
      },
    );
  });
}

export async function readCloudDragonProjects(): Promise<CloudDragonProject[]> {
  const { projects } = await runCloudDragon(
    ["projects"],
    z.object({ project: projectId, projects: z.array(project) }),
  );
  return projects.filter(({ name }) => name.includes("开发"));
}

function readRequirementPage(project: string, domain: string, page: number, size: number) {
  return runCloudDragon(
    ["irs", "--domain", domain, "--page", String(page), "--page-size", String(size)],
    requirementResponse,
    project,
  );
}

export async function readCloudDragonRequirements(
  project: string,
): Promise<CloudDragonRequirement[]> {
  const directory = await runCloudDragon(["domains"], domainResponse, project);
  const [domain] = directory.domains;
  if (directory.count !== 1 || directory.domains.length !== 1 || !domain)
    throw businessRule("云龙项目应对应一个需求域，请检查需求域配置。");

  const requirements = new Map<string, CloudDragonRequirement>();
  let pageSize = 200;
  let pageCount = 1;
  for (let page = 1; page <= pageCount; page++) {
    const result = await readRequirementPage(project, domain.id, page, pageSize);
    const [group] = result.domains;
    if (page === 1 && result.domains.length === 0) return [];
    if (
      result.domains.length !== 1 ||
      !group ||
      group.id !== domain.id ||
      group.page !== page ||
      (page > 1 && group.page_size !== pageSize) ||
      group.count !== group.irs.length ||
      group.irs.some((item) => item.domain !== domain.id)
    )
      throw businessRule("云龙返回的需求页与请求范围不匹配，请重试。");
    if (page === 1) {
      pageSize = group.page_size;
      pageCount = Math.ceil(group.total / pageSize);
    }
    for (const item of group.irs) requirements.set(item.businessNo, item);
  }
  return [...requirements.values()];
}
