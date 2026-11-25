import { execFile } from "node:child_process";
import { createServiceLogger } from "@zcode/services/logger";
import { z } from "zod";
import { businessRule } from "./errors.js";

const logger = createServiceLogger("clouddragon");
const projectId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const project = z.object({ id: projectId, name: z.string() });
const projectResponse = z.object({
  project: projectId,
  items: z.array(project.extend({ id: projectId.nullable() })),
});
const domainId = z.string().regex(/^[0-9]+$/);
const requirement = z.object({
  businessNo: z.string().regex(/^IR[0-9]+$/),
  name: z.string(),
  description: z.string(),
  creator: z.string(),
  submitter: z.string(),
  createDate: z.string(),
  domain: domainId,
  process: z.string().trim().nullish(),
  pi: z.string().nullish(),
  piName: z.string().nullish(),
});
const requirementResponse = z.object({
  project: projectId,
  domains: z.array(
    z.object({
      id: domainId,
      count: z.number().int().nonnegative().optional(),
      items: z.array(requirement),
    }),
  ),
});
export type CloudDragonProject = z.infer<typeof project>;
type CloudDragonRequirement = z.infer<typeof requirement>;

const useMockCloudDragon = process.env["ZCODE_CLOUDDRAGON_MODE"] === "mock";
const mockProjects = [
  { id: "gmockdev01", name: "协作平台开发" },
  { id: "gmockdev02", name: "工作台开发" },
] satisfies CloudDragonProject[];

const mockRequirements = [
  {
    projectId: "gmockdev01",
    domain: "900001",
    businessNo: "IR20990101000001",
    name: "按需求域筛选需求列表",
    description:
      "<p>项目成员需要快速定位自己负责的需求。</p><p>切换需求域后保留已选择的进展筛选。</p>",
    process: "开发",
    pi: "101",
    piName: "体验优化",
  },
  {
    projectId: "gmockdev01",
    domain: "900001",
    businessNo: "IR20990101000002",
    name: "统一需求列表的空状态提示",
    description: "<p>筛选无结果时提示用户调整筛选条件。</p>",
    process: "完成",
    pi: "101",
    piName: "体验优化",
  },
  {
    projectId: "gmockdev01",
    domain: "900001",
    businessNo: "IR20990101000003",
    name: "明确需求延期的通知范围",
    description: "<p>梳理延期时需要通知的项目角色。</p>",
    process: "分析",
    pi: null,
    piName: null,
  },
  {
    projectId: "gmockdev02",
    domain: "900002",
    businessNo: "IR20990101000004",
    name: "展示最近访问的项目",
    description: "<p>从工作台快速打开最近访问的项目。</p>",
    process: "测试",
    pi: "201",
    piName: "工作台导航",
  },
] satisfies (Omit<CloudDragonRequirement, "creator" | "submitter" | "createDate"> & {
  projectId: string;
})[];

const failure = z.object({
  ok: z.literal(false),
  error: z.object({ type: z.string(), message: z.string() }),
});

function decodeOutput(output: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(output);
  } catch {
    if (process.platform !== "win32") return;
    try {
      // Windows 子进程的管道可能使用中文代码页，宽松的 UTF-8 解码会破坏项目名称。
      return new TextDecoder("gb18030", { fatal: true }).decode(output);
    } catch {
      return undefined;
    }
  }
}

function parseJson(output: string | undefined): unknown {
  if (output === undefined) return;
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
      {
        encoding: "buffer",
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        maxBuffer: 32 * 1024 * 1024,
        timeout: 60_000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const result = failure.safeParse(parseJson(decodeOutput(stderr)));
          const message =
            error.code === "ENOENT"
              ? "服务端找不到 clouddragon，请检查安装和 PATH。"
              : result.success && result.data.error.type === "AuthenticationError"
                ? "云龙鉴权失败，请检查服务端的云龙登录状态。"
                : "云龙读取失败，请检查 clouddragon 后重试。";
          logger.warn(undefined, message, {
            command: args[0],
            exitCode: typeof error.code === "number" ? error.code : undefined,
            timedOutOrKilled: error.killed === true,
          });
          reject(businessRule(message));
          return;
        }
        const output = decodeOutput(stdout);
        if (output === undefined) {
          logger.warn(undefined, "云龙输出编码无法识别。", { command: args[0] });
          reject(businessRule("无法解码 clouddragon 输出，请检查 CLI 的输出编码。"));
          return;
        }
        const result = response.safeParse(parseJson(output));
        if (!result.success) {
          logger.warn(undefined, "云龙返回格式无法解析。", { command: args[0] });
          reject(businessRule("云龙返回了无法读取的数据。"));
          return;
        }
        if (selectedProjectId && result.data.data.project !== selectedProjectId) {
          logger.warn(undefined, "云龙返回的项目与请求项目不匹配。", { command: args[0] });
          reject(businessRule("云龙返回的项目与请求项目不匹配。"));
          return;
        }
        resolve(result.data.data);
      },
    );
  });
}

export async function readCloudDragonProjects(): Promise<CloudDragonProject[]> {
  if (useMockCloudDragon) return mockProjects;
  const nameFilter = "开发";
  const { items } = await runCloudDragon(
    ["project", "list", "--name", nameFilter],
    projectResponse,
  );
  const visible = items.filter(
    (item): item is CloudDragonProject => item.id !== null && item.name.includes(nameFilter),
  );
  logger.info(undefined, "云龙项目读取完成", {
    returned: items.length,
    matched: visible.length,
    namesWithReplacementCharacters: items.filter(({ name }) => name.includes("\ufffd")).length,
  });
  return visible;
}

export async function readCloudDragonRequirements(
  project: string,
): Promise<CloudDragonRequirement[]> {
  if (useMockCloudDragon)
    return mockRequirements
      .filter(({ projectId }) => projectId === project)
      .map(({ projectId: _projectId, ...item }) => ({
        ...item,
        creator: "a00000001",
        submitter: "a00000001",
        createDate: "2026-11-01 09:00:00",
      }));
  const { domains } = await runCloudDragon(["ir", "list", "--all"], requirementResponse, project);
  const [group] = domains;
  if (!group) return [];
  if (
    domains.length !== 1 ||
    (group.count !== undefined && group.count !== group.items.length) ||
    group.items.some((item) => item.domain !== group.id)
  )
    throw businessRule("云龙返回的需求与项目需求域不匹配，请重试。");
  const requirements = new Map(group.items.map((item) => [item.businessNo, item]));
  return [...requirements.values()];
}
