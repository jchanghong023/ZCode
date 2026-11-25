import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  AIREQ_CLOUD_PROPOSAL_COLUMNS,
  type AIReqCloudProposalFields,
  type AIReqRequirementComment,
  type AIReqObjectRef,
  type AIReqRequirementDetails,
} from "@zcode/services/aireq";
import { createServiceLogger } from "@zcode/services/logger";
import { z } from "zod";
import { businessRule } from "./errors.js";
import { getEmployeeId } from "./identity.js";

const logger = createServiceLogger("clouddragon");
const projectId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const project = z.object({ id: projectId, name: z.string() });
const projectResponse = z.object({
  project: projectId,
  items: z.array(project.extend({ id: projectId.nullable() })),
});
const domainId = z.string().regex(/^[0-9]+$/);
const businessNo = z.string().regex(/^IR[0-9]+$/);
const person = z.string().trim().nullish();
const requirement = z
  .object({
    businessNo,
    name: z.string().nullish(),
    description: z.string(),
    creator: z.string(),
    submitter: z.string(),
    delivererOwner: person,
    owner: person,
    seId: person,
    de: person,
    te: person,
    createDate: z.string(),
    domain: domainId,
    process: z.string().trim().nullish(),
    pi: z.string().nullish(),
    piName: z.string().nullish(),
  })
  .catchall(z.json());
const requirementResponse = z.object({
  project: projectId,
  domains: z.array(
    z.object({
      id: domainId,
      name: z.string().nullish(),
      count: z.number().int().nonnegative(),
      items: z.array(requirement),
    }),
  ),
});
const cloudComment = z.record(z.string(), z.json());
const commentListResponse = z.object({
  project: projectId.optional(),
  items: z.array(cloudComment),
});
const commentAddResponse = z.object({ project: projectId.optional(), comment: cloudComment });
const commentDeleteResponse = z.object({ project: projectId.optional() });
export type CloudDragonProject = z.infer<typeof project>;
export type CloudDragonRequirement = z.infer<typeof requirement>;

const useMockCloudDragon = process.env["ZCODE_CLOUDDRAGON_MODE"] === "mock";
const mockProjects = [
  { id: "gmockdev01", name: "协作平台开发" },
  { id: "gmockdev02", name: "工作台开发" },
] satisfies CloudDragonProject[];
const mockDomainNames = new Map([
  ["900001", mockProjects[0]!.name],
  ["900002", mockProjects[1]!.name],
]);

const mockRequirements = [
  {
    projectId: "gmockdev01",
    domain: "900001",
    businessNo: "IR20990101000001",
    name: "按需求域筛选需求列表",
    description: [
      "## 背景\n\n项目成员需要快速定位自己负责的需求。切换需求域后保留已选择的进展筛选。",
      ...Array.from(
        { length: 12 },
        (_, index) =>
          `### 验收场景 ${index + 1}\n\n从项目总览进入需求列表，选择需求域并设置进展筛选。返回列表时，仍可查看筛选结果和打开过的需求。无匹配项时可以清空筛选条件，再次查看全部需求。`,
      ),
    ].join("\n\n"),
    process: "开发",
    delivererOwner: "a00000003",
    owner: null,
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
    delivererOwner: "a00000002",
    owner: "a00000004",
    seId: "a00000005",
    de: "a00000006",
    te: "a00000007",
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
    owner: "a00000008",
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

function runCloudDragon<T extends { project?: string | undefined }>(
  args: string[],
  data: z.ZodType<T>,
  selectedProjectId?: string,
): Promise<T> {
  const response = z.object({ ok: z.literal(true), data });
  const writingComment = args[0] === "comment" && args[1] !== "list";
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
                : writingComment
                  ? "云龙评论操作未确认，请先重新读取评论。"
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
        if (
          selectedProjectId &&
          result.data.data.project !== undefined &&
          result.data.data.project !== selectedProjectId
        ) {
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
): Promise<{
  items: CloudDragonRequirement[];
  domainNames: ReadonlyMap<string, string | undefined>;
}> {
  if (useMockCloudDragon)
    return {
      domainNames: mockDomainNames,
      items: mockRequirements
        .filter(({ projectId }) => projectId === project)
        .map(({ projectId: _projectId, ...item }) =>
          requirement.parse({
            ...item,
            creator: "a00000001",
            submitter: "a00000001",
            createDate: "2026-11-01 09:00:00",
            customProps: [{ name: "来源", value: "需求共创" }],
            labels:
              item.businessNo === "IR20990101000001"
                ? [{ name: "体验优化" }, { name: "需求域" }]
                : item.businessNo === "IR20990101000002"
                  ? [{ name: "体验优化" }]
                  : [],
            estimatedWorkloadManday: item.businessNo === "IR20990101000001" ? 3 : 8,
            sumWorkloadManday: item.businessNo === "IR20990101000001" ? 5 : 9,
            priorityLevel: item.businessNo === "IR20990101000001" ? "高" : "中",
            needBreak: false,
            ...(item.businessNo === "IR20990101000001" && {
              rrBusinessNo: "RR20990101000001",
              completedAnalysisTime: "2026-11-02 08:00:00",
            }),
            archived: false,
          }),
        ),
    };
  const { domains } = await runCloudDragon(["ir", "list", "--all"], requirementResponse, project);
  const items: CloudDragonRequirement[] = [];
  const domainNames = new Map<string, string | undefined>();
  const businessNumbers = new Set<string>();
  // --all 会返回同一项目的多个需求域；不能按首组取名或通过覆盖记录来消解有歧义的归属。
  for (const group of domains) {
    if (domainNames.has(group.id)) throw businessRule("云龙返回了重复的需求域，请重试。");
    if (group.count !== group.items.length)
      throw businessRule("云龙返回的需求域条数不一致，请重试。");
    domainNames.set(group.id, group.name?.trim() || undefined);
    for (const item of group.items) {
      if (item.domain !== group.id)
        throw businessRule("云龙返回的需求与项目需求域不匹配，请重试。");
      if (businessNumbers.has(item.businessNo))
        throw businessRule("云龙在同一项目返回了重复的 IR 业务号，请重试。");
      businessNumbers.add(item.businessNo);
      items.push(item);
    }
  }
  return { items, domainNames };
}

function displayField(value: z.infer<ReturnType<typeof z.json>>): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function cloudDragonProposalFields(
  item: CloudDragonRequirement,
  domainName?: string,
): AIReqCloudProposalFields {
  const fields: AIReqCloudProposalFields = {};
  for (const key of [...AIREQ_CLOUD_PROPOSAL_COLUMNS, "sumWorkloadManday"] as const) {
    const value = key === "domain" ? (domainName ?? item.domain) : item[key];
    if (value == null || (typeof value === "string" && !value.trim())) continue;
    if (Array.isArray(value)) {
      const names = value.flatMap((entry) => {
        if (entry == null) return [];
        if (typeof entry === "object" && !Array.isArray(entry) && typeof entry["name"] === "string")
          return entry["name"].trim() ? [entry["name"]] : [displayField(entry)];
        return [displayField(entry)];
      });
      if (names.length) fields[key] = names;
    } else {
      fields[key] = typeof value === "object" ? displayField(value) : value;
    }
  }
  return fields;
}

export function cloudDragonRequirementDetails(ir: CloudDragonRequirement): AIReqRequirementDetails {
  const { description, comments: _comments, ...fields } = ir;
  return {
    description: description == null ? "" : displayField(description),
    fields: Object.entries(fields).flatMap(([name, value]) =>
      value === undefined ? [] : [{ name, value: displayField(value) }],
    ),
  };
}

const mockComments: AIReqRequirementComment[] = [
  {
    id: "00000000000040008000000000000001",
    author: "a00000002",
    createdAt: "2026-11-02 14:00:00",
    body: [
      "## 需求澄清记录\n\n讨论后补充以下验收要点。",
      ...Array.from(
        { length: 12 },
        (_, index) =>
          `### 验收要点 ${index + 1}\n\n检查有结果、无结果和切换需求域三种场景。记录实际显示的条目数，确认重新进入列表后仍可读取需求。`,
      ),
    ].join("\n\n"),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    author: "a00000003",
    createdAt: "2026-11-03 09:00:00",
    body: "请补充一个无权限需求域的验收场景。\n确认筛选项只包含当前账号可见的需求域。",
  },
];

type CommentTarget = AIReqObjectRef & { domain: string };

const commentIdentifier = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;
const mockCommentsByTarget = new Map<string, AIReqRequirementComment[]>([
  [JSON.stringify(["gmockdev01", "900001", "IR20990101000001"]), mockComments],
]);
const pendingCommentLists = new Map<string, Promise<AIReqRequirementComment[]>>();

function commentKey({ projectId, domain, irId }: CommentTarget) {
  // 同一 IR 在新旧页面快照中可能分属不同的域，不能复用另一域的评论请求。
  return JSON.stringify([projectId, domain, irId]);
}

function projectComment(
  item: z.infer<typeof cloudComment>,
  fallbackBody = "",
): AIReqRequirementComment {
  const id = item.id;
  const body = item.detail ?? item.content ?? item.body ?? item.text;
  const author = item.display_author || item.displayAuthor || item.author;
  const createdAt = item.createDate ?? item.createTime ?? item.created_at ?? item.createdAt;
  return {
    id: typeof id === "string" && commentIdentifier.test(id) ? id : null,
    body: body == null ? fallbackBody : displayField(body),
    ...(typeof author === "string" && { author }),
    ...(typeof createdAt === "string" && { createdAt }),
  };
}

export function readCloudDragonComments(target: CommentTarget): Promise<AIReqRequirementComment[]> {
  const key = commentKey(target);
  if (useMockCloudDragon) return Promise.resolve(mockCommentsByTarget.get(key) ?? []);
  const pending = pendingCommentLists.get(key);
  if (pending) return pending;
  const request = runCloudDragon(
    ["comment", "list", target.irId, "--domain", target.domain],
    commentListResponse,
    target.projectId,
  )
    .then(({ items }) => items.map((item) => projectComment(item)))
    .finally(() => {
      if (pendingCommentLists.get(key) === request) pendingCommentLists.delete(key);
    });
  pendingCommentLists.set(key, request);
  return request;
}

export async function addCloudDragonComment(
  target: CommentTarget,
  body: string,
): Promise<AIReqRequirementComment> {
  const key = commentKey(target);
  if (useMockCloudDragon) {
    const comment = {
      id: randomUUID(),
      body,
      author: getEmployeeId(),
      createdAt: new Date().toISOString(),
    };
    mockCommentsByTarget.set(key, [...(mockCommentsByTarget.get(key) ?? []), comment]);
    return comment;
  }
  // 用户正文作为单个位置参数传入，允许多行以及以短横线开头的文本。
  const { comment } = await runCloudDragon(
    ["comment", "add", "--domain", target.domain, "--", target.irId, body],
    commentAddResponse,
    target.projectId,
  );
  pendingCommentLists.delete(key);
  return projectComment(comment, body);
}

export async function deleteCloudDragonComment(
  target: CommentTarget,
  commentId: string,
): Promise<null> {
  if (!commentIdentifier.test(commentId)) throw businessRule("评论 ID 无效，请重新加载评论。");
  const key = commentKey(target);
  if (useMockCloudDragon) {
    const current = mockCommentsByTarget.get(key) ?? [];
    const remaining = current.filter(({ id }) => id !== commentId);
    if (current.length === remaining.length) throw businessRule("该需求下没有这条评论。");
    mockCommentsByTarget.set(key, remaining);
  } else {
    await runCloudDragon(
      ["comment", "delete", target.irId, commentId, "--domain", target.domain],
      commentDeleteResponse,
      target.projectId,
    );
    pendingCommentLists.delete(key);
  }
  return null;
}
