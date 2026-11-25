import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { businessRule } from "./errors.js";
import type { ProductionStore } from "./production-store.js";
import { readPrototypeProjectSetting } from "./project-settings.js";

export interface ResearchTool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    callId: string,
    args: unknown,
    onUpdate: unknown,
    context: unknown,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

interface McpTool extends ResearchTool {
  mcpServerName: string;
  mcpToolName: string;
}
interface KnowledgeManager {
  connectServers(
    configs: Record<string, { enabled?: boolean }>,
    sources: Record<string, never>,
    onStatus: undefined,
    startupTimeoutMs: number,
  ): Promise<{
    tools: McpTool[];
    errors: Map<string, string>;
    connectedServers: string[];
  }>;
  getConnection(server: string):
    | {
        capabilities: { resources?: object };
        tools?: {
          name: string;
          annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
        }[];
      }
    | undefined;
  refreshServerResources(server: string): Promise<void>;
  getServerResources(server: string):
    | {
        resources: { name: string; uri: string }[];
        templates: { name: string; uriTemplate: string }[];
      }
    | undefined;
  readServerResource(
    server: string,
    uri: string,
    options?: { signal: AbortSignal },
  ): Promise<{ contents: unknown[] } | undefined>;
  disconnectAll(): Promise<void>;
}

export interface KnowledgeMcpSdk {
  MCPManager: new (cwd: string) => KnowledgeManager;
  readMCPConfigFile(path: string): Promise<{
    mcpServers?: Record<string, { enabled?: boolean }>;
    enabledServers?: string[];
    disabledServers?: string[];
  }>;
}

const exec = promisify(execFile);
const pendingFetches = new Map<string, Promise<unknown>>();
const filePath = z
  .string()
  .refine(
    (p) =>
      !p.includes("\\") &&
      !Array.from(p).some((character) => character.charCodeAt(0) < 32) &&
      !p.startsWith("/") &&
      !/^[A-Za-z]:/.test(p) &&
      p.split("/").every((part) => !!part && part !== "." && part !== ".."),
    "需要 Git 仓库内使用 / 分隔的相对路径。",
  );

async function git(args: string[], signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  try {
    const { stdout } = await exec("git", args, {
      encoding: "buffer",
      windowsHide: true,
      signal,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_LITERAL_PATHSPECS: "1",
        GIT_ALLOW_PROTOCOL: "http:https:ssh:git",
      },
    });
    return stdout;
  } catch {
    signal?.throwIfAborted();
    throw businessRule("读取 Git 失败，请核对项目仓库、默认分支、访问权限及仓库内路径。");
  }
}

function textResult(text: string) {
  return { content: [{ type: "text", text }], details: {} };
}
function tool(
  name: string,
  description: string,
  parameters: z.ZodObject,
  run: (input: Record<string, unknown>, signal?: AbortSignal) => Promise<string>,
): ResearchTool {
  return {
    name,
    label: name,
    description,
    parameters: z.toJSONSchema(parameters),
    async execute(_id, args, _onUpdate, _context, signal) {
      signal?.throwIfAborted();
      return textResult(await run(parameters.parse(args), signal));
    },
  };
}

function projectCodeTools(projectId: string, store: ProductionStore): ResearchTool[] {
  let snapshot: Promise<{ dir: string; sha: string }> | undefined;
  async function open(signal?: AbortSignal) {
    const config = readPrototypeProjectSetting(projectId);
    const url = config?.repositoryUrl;
    if (!url || !config.defaultBranch) throw businessRule("请先为本项目配置代码仓库和默认分支。");
    const branch = config.defaultBranch;
    await git(["check-ref-format", "refs/heads/" + branch], signal);
    const dir = join(
      store.root,
      "git",
      createHash("sha256")
        .update(JSON.stringify([projectId, url, branch]))
        .digest("hex"),
    );
    const preceding = pendingFetches.get(dir);
    const next = Promise.resolve(preceding)
      .catch(() => {})
      .then(async () => {
        signal?.throwIfAborted();
        await mkdir(dir, { recursive: true });
        await git(["init", "--bare", "--quiet", dir], signal);
        // 按仓库和分支串行刷新缓存，再固定提交；其他回合刷新不会改变本次读取的版本。
        await git(
          [
            "--git-dir=" + dir,
            "fetch",
            "--depth=1",
            "--no-tags",
            "--no-recurse-submodules",
            "--",
            url,
            "+refs/heads/" + branch + ":refs/heads/aireq-source",
          ],
          signal,
        );
        const sha = (
          await git(
            ["--git-dir=" + dir, "rev-parse", "--verify", "refs/heads/aireq-source^{commit}"],
            signal,
          )
        )
          .toString()
          .trim();
        if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) throw businessRule("Git 提交标识无效。");
        return { dir, sha };
      });
    pendingFetches.set(dir, next);
    try {
      return await next;
    } finally {
      if (pendingFetches.get(dir) === next) pendingFetches.delete(dir);
    }
  }
  function pinned(signal?: AbortSignal) {
    snapshot ??= open(signal).catch((error) => {
      snapshot = undefined;
      throw error;
    });
    return snapshot;
  }
  const entries = z.strictObject({
    directory: filePath.optional(),
    offset: z.number().int().min(0).optional(),
  });
  const file = z.strictObject({ path: filePath, startLine: z.number().int().min(1).optional() });
  return [
    tool(
      "aireq_list_code",
      "列出本项目固定提交中某个目录的直接子项。省略 directory 列出仓库根；使用 nextOffset 继续。",
      entries,
      async (args, signal) => {
        const { directory, offset = 0 } = entries.parse(args);
        const { dir, sha } = await pinned(signal);
        const tree = await git(
          ["--git-dir=" + dir, "ls-tree", "-z", directory ? sha + ":" + directory : sha],
          signal,
        );
        const items = tree.toString("utf8").split("\0").filter(Boolean);
        const batch = items.slice(offset, offset + 200).map((row) => {
          const sep = row.indexOf("\t");
          const [mode, type] = row.slice(0, sep).split(" ");
          return { name: row.slice(sep + 1), type: mode === "120000" ? "symlink" : type };
        });
        return JSON.stringify({
          commit: sha,
          directory: directory ?? "",
          items: batch,
          nextOffset: offset + batch.length < items.length ? offset + batch.length : null,
        });
      },
    ),
    tool(
      "aireq_read_code",
      "读取本项目固定提交内 UTF-8 文本文件，行号从 1 开始。",
      file,
      async (args, signal) => {
        const { path, startLine = 1 } = file.parse(args);
        const { dir, sha } = await pinned(signal);
        const attr = (
          await git(["--git-dir=" + dir, "ls-tree", "-z", sha, "--", path], signal)
        ).toString();
        const head = /^(?:100644|100755) blob ([a-f0-9]+)\t/.exec(attr);
        if (!head || attr.slice(head[0].length, -1) !== path)
          throw businessRule("请选择仓库中的普通文件。");
        const size = Number(
          (await git(["--git-dir=" + dir, "cat-file", "-s", head[1]!], signal)).toString(),
        );
        if (!Number.isSafeInteger(size) || size > 8 * 1024 * 1024)
          throw businessRule("该文件超出单次源码读取的 8 MiB 上限。");
        const blob = await git(["--git-dir=" + dir, "cat-file", "blob", head[1]!], signal);
        if (blob.includes(0)) throw businessRule("文件包含二进制内容。");
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(blob);
        } catch {
          throw businessRule("文件不是 UTF-8 文本。");
        }
        const lines = text.split(/\r?\n/);
        const selected = lines.slice(startLine - 1, startLine - 1 + 200);
        return JSON.stringify({
          commit: sha,
          path,
          startLine,
          totalLines: lines.length,
          text: selected.join("\n"),
          nextLine:
            startLine + selected.length <= lines.length ? startLine + selected.length : null,
        });
      },
    ),
  ];
}

/** 只接入部署区数据目录里的知识库配置，Git 仓库内容不会被作为 MCP 启动配置。 */
export async function createResearchTools(
  projectId: string,
  store: ProductionStore,
  sdk: KnowledgeMcpSdk,
  signal?: AbortSignal,
) {
  if (store.zone !== "red") throw businessRule("源码和知识库只在红区可用。");
  signal?.throwIfAborted();
  const tools = projectCodeTools(projectId, store);
  const config = await sdk.readMCPConfigFile(join(store.root, ".mcp.json"));
  const servers = Object.fromEntries(
    Object.entries(config.mcpServers ?? {}).filter(
      ([name, server]) =>
        !config.disabledServers?.includes(name) &&
        (server.enabled !== false || config.enabledServers?.includes(name)),
    ),
  );
  const manager = new sdk.MCPManager(store.root);
  let closing: Promise<void> | undefined;
  const onAbort = () => {
    void dispose().catch(() => {});
  };
  const dispose = () => {
    signal?.removeEventListener("abort", onAbort);
    return (closing ??= manager.disconnectAll());
  };
  try {
    signal?.throwIfAborted();
    signal?.addEventListener("abort", onAbort, { once: true });
    const result = await manager.connectServers(servers, {}, undefined, 0);
    signal?.throwIfAborted();
    const unavailable = Object.keys(servers).filter(
      (server) => !result.connectedServers.includes(server),
    );
    function isReadOnly(server: string, name: string) {
      const annotations = manager
        .getConnection(server)
        ?.tools?.find((t) => t.name === name)?.annotations;
      return annotations?.readOnlyHint === true && annotations.destructiveHint !== true;
    }
    for (const remote of result.tools) {
      if (!isReadOnly(remote.mcpServerName, remote.mcpToolName)) continue;
      tools.push({
        name: remote.name,
        label: remote.label,
        description: remote.description,
        parameters: remote.parameters,
        execute(id, args, onUpdate, ctx, signal) {
          if (!isReadOnly(remote.mcpServerName, remote.mcpToolName))
            throw businessRule("该知识库工具已不在只读目录中。");
          return remote.execute(id, args, onUpdate, ctx, signal);
        },
      });
    }
    const catalogs = result.connectedServers.filter(
      (server) => manager.getConnection(server)?.capabilities.resources,
    );
    const list = z.strictObject({});
    tools.push(
      tool(
        "aireq_knowledge_catalog",
        "列出本区知识库服务器及已发布的 MCP 资源。",
        list,
        async () => {
          const resources = await Promise.all(
            catalogs.map(async (server) => {
              await manager.refreshServerResources(server);
              return { server, ...manager.getServerResources(server) };
            }),
          );
          return JSON.stringify({ servers: result.connectedServers, unavailable, resources });
        },
      ),
    );
    if (catalogs.length) {
      const read = z.strictObject({ server: z.enum(catalogs), uri: z.string().min(1) });
      tools.push(
        tool(
          "aireq_read_knowledge",
          "读取指定知识库服务器上的 MCP 资源 URI。",
          read,
          async (args, signal) => {
            const { server, uri } = read.parse(args);
            const resource = await manager.readServerResource(
              server,
              uri,
              signal ? { signal } : undefined,
            );
            if (!resource) throw businessRule("MCP 资源不可用。");
            return JSON.stringify(resource.contents);
          },
        ),
      );
    }
    return { tools, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
