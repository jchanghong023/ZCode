import { execFile } from "node:child_process";
import { createServiceLogger } from "@zcode/services/logger";
import { z } from "zod";
import { businessRule } from "./errors.js";

const logger = createServiceLogger("clouddragon");
const projectId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const project = z.object({ id: projectId, name: z.string() });
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
      irs: z.array(requirement),
    }),
  ),
});
export type CloudDragonProject = z.infer<typeof project>;
type CloudDragonRequirement = z.infer<typeof requirement>;

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
  const nameFilter = "开发";
  const { projects } = await runCloudDragon(
    ["projects", "--name", nameFilter],
    z.object({ project: projectId, projects: z.array(project) }),
  );
  const visible = projects.filter(({ name }) => name.includes(nameFilter));
  logger.info(undefined, "云龙项目读取完成", {
    returned: projects.length,
    matched: visible.length,
    namesWithReplacementCharacters: projects.filter(({ name }) => name.includes("\ufffd")).length,
  });
  return visible;
}

export async function readCloudDragonRequirements(
  project: string,
): Promise<CloudDragonRequirement[]> {
  const { domains } = await runCloudDragon(["irs"], requirementResponse, project);
  const [group] = domains;
  if (!group) return [];
  if (
    domains.length !== 1 ||
    (group.count !== undefined && group.count !== group.irs.length) ||
    group.irs.some((item) => item.domain !== group.id)
  )
    throw businessRule("云龙返回的需求与项目需求域不匹配，请重试。");
  const requirements = new Map(group.irs.map((item) => [item.businessNo, item]));
  return [...requirements.values()];
}
