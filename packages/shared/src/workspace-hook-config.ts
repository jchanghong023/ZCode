import { existsSync, statSync } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  workspaceHooksConfigSchema,
  type WorkspaceHookSourceInput,
  type WorkspaceHooksConfig,
} from "./workspace-hooks/contract.js";

export interface WorkspaceHookConfigPathRef {
  path: string;
  explicitProjectConfig: boolean;
}

export interface WorkspaceHookSourceReadError {
  path: string;
  error: unknown;
}

/**
 * 从已发现的配置目录列表生成 workspace hook 候选文件路径。
 * 纯函数，sync/async discovery 共享，确保候选文件名与顺序规则只在此处维护一次
 * （sync/async 共享同一份 flatMap，避免候选路径的生成规则出现分歧）。
 */
function buildWorkspaceHookCandidatePaths(directories: readonly string[]): string[] {
  return directories.flatMap((directory) => [
    join(directory, "zcode.json"),
    join(directory, ".zcode", "config.json"),
  ]);
}

/**
 * 对已发现的 config refs 按规范化路径去重，保留首次出现的条目。
 *
 * 当 explicit projectConfigPath 恰好指向 auto-discovery 已发现的文件时，
 * 同一文件会以不同 explicitProjectConfig 标记出现两次，进入 snapshot 后产生重复
 * sourceFile 与重复 declaration，导致 bundleDigest 分叉。
 *
 * 去重策略：保留首次出现者（auto-discovered 条目在前、explicit 在后），丢弃后续重复。
 * 不得改变剩余条目的相对顺序——discoveryOrder 和 explicitProjectConfig 均为 digest 输入，
 * 任何重排都会使既有 trust 记录失效（用户被重新提示全部 Hook）。对于无 explicit path
 * 的 workspace，auto-discovery 本身不会产生重复，此函数为 no-op，bundleDigest 不变。
 */
function deduplicateWorkspaceHookConfigRefs(
  refs: readonly WorkspaceHookConfigPathRef[],
): WorkspaceHookConfigPathRef[] {
  const seen = new Set<string>();
  const result: WorkspaceHookConfigPathRef[] = [];
  for (const ref of refs) {
    const resolved = resolve(ref.path);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(ref);
  }
  return result;
}

export function discoverWorkspaceHookConfigPaths(input: {
  workingDirectory: string;
  explicitProjectConfigPath?: string;
}): WorkspaceHookConfigPathRef[] {
  const start = resolve(input.workingDirectory);
  const refs = buildWorkspaceHookCandidatePaths(getProjectConfigDirectories(start))
    .filter((path) => existsSync(path))
    .map((path) => ({ path, explicitProjectConfig: false }));

  if (input.explicitProjectConfigPath) {
    const explicitPath = resolve(input.explicitProjectConfigPath);
    if (existsSync(explicitPath)) refs.push({ path: explicitPath, explicitProjectConfig: true });
  }
  return deduplicateWorkspaceHookConfigRefs(refs);
}

export function createWorkspaceHookSourceInput(input: {
  path: string;
  workingDirectory: string;
  hooks: WorkspaceHooksConfig;
  discoveryOrder: number;
  explicitProjectConfig?: boolean;
}): WorkspaceHookSourceInput {
  const canonicalPath = resolve(input.path);
  const explicitProjectConfig = input.explicitProjectConfig === true;
  const configDirectory = dirname(canonicalPath);
  return {
    canonicalPath,
    baseDir: basename(configDirectory) === ".zcode" ? dirname(configDirectory) : configDirectory,
    discoveryOrder: input.discoveryOrder,
    configFileKind: explicitProjectConfig
      ? "explicit"
      : basename(canonicalPath) === "zcode.json"
        ? "zcode.json"
        : ".zcode/config.json",
    explicitProjectConfig,
    editable:
      !explicitProjectConfig &&
      canonicalPath === resolve(input.workingDirectory, ".zcode", "config.json"),
    hooks: input.hooks,
  };
}

export async function readWorkspaceHookProjectSources(input: {
  workingDirectory: string;
  explicitProjectConfigPath?: string;
}): Promise<{ sources: WorkspaceHookSourceInput[]; errors: WorkspaceHookSourceReadError[] }> {
  const refs = await discoverWorkspaceHookConfigPathsAsync(input);
  const sources: WorkspaceHookSourceInput[] = [];
  const errors: WorkspaceHookSourceReadError[] = [];

  for (const [discoveryOrder, ref] of refs.entries()) {
    try {
      const value = JSON.parse(await readFile(ref.path, "utf8")) as unknown;
      if (!isRecord(value) || value.hooks === undefined) continue;
      sources.push(
        createWorkspaceHookSourceInput({
          path: ref.path,
          workingDirectory: input.workingDirectory,
          hooks: workspaceHooksConfigSchema.parse(value.hooks),
          discoveryOrder,
          explicitProjectConfig: ref.explicitProjectConfig,
        }),
      );
    } catch (error) {
      errors.push({ path: ref.path, error });
    }
  }
  return { sources, errors };
}

async function discoverWorkspaceHookConfigPathsAsync(input: {
  workingDirectory: string;
  explicitProjectConfigPath?: string;
}): Promise<WorkspaceHookConfigPathRef[]> {
  const start = resolve(input.workingDirectory);
  const candidates = buildWorkspaceHookCandidatePaths(
    await getProjectConfigDirectoriesAsync(start),
  );
  const refs: WorkspaceHookConfigPathRef[] = [];
  for (const path of candidates) {
    if (await pathExists(path)) refs.push({ path, explicitProjectConfig: false });
  }
  if (input.explicitProjectConfigPath) {
    const explicitPath = resolve(input.explicitProjectConfigPath);
    if (await pathExists(explicitPath)) {
      refs.push({ path: explicitPath, explicitProjectConfig: true });
    }
  }
  return deduplicateWorkspaceHookConfigRefs(refs);
}

async function getProjectConfigDirectoriesAsync(start: string): Promise<string[]> {
  const directories: string[] = [];
  let current = start;
  while (true) {
    directories.push(current);
    if (await hasWorktreeMarkerAsync(current)) return directories.reverse();
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return [start];
}

async function hasWorktreeMarkerAsync(directory: string): Promise<boolean> {
  try {
    const stats = await stat(join(directory, ".git"));
    return stats.isDirectory() || stats.isFile();
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function getProjectConfigDirectories(start: string): string[] {
  const directories: string[] = [];
  let current = start;
  while (true) {
    directories.push(current);
    if (hasWorktreeMarker(current)) return directories.reverse();
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return [start];
}

function hasWorktreeMarker(directory: string): boolean {
  const marker = join(directory, ".git");
  try {
    if (!existsSync(marker)) return false;
    const stats = statSync(marker);
    return stats.isDirectory() || stats.isFile();
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
