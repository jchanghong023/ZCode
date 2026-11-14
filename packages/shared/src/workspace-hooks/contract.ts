// 修复原因：浏览器只共享 Hook schema 与快照 DTO，不再经类型引用依赖 Node discovery/digest 实现。
import { z } from "zod";

export const WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION = 1 as const;
export const DEFAULT_WORKSPACE_HOOK_TIMEOUT_MS = 60_000;
export const DEFAULT_WORKSPACE_HOOK_MAX_OUTPUT_BYTES = 32_768;
export const WORKSPACE_HOOK_EVENT_NAMES = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
] as const;

export type WorkspaceHookEventName = (typeof WORKSPACE_HOOK_EVENT_NAMES)[number];
export type WorkspaceHookConfigFileKind = "zcode.json" | ".zcode/config.json" | "explicit";

const positiveNumberSchema = z.number().finite().positive();

export const workspaceHookProcessConfigSchema = z
  .object({
    type: z.literal("process"),
    command: z.string().min(1),
    enabled: z.boolean().optional(),
    args: z.array(z.string()).optional(),
    timeoutMs: positiveNumberSchema.optional(),
    statusMessage: z.string().min(1).optional(),
    // hook 自身出错时放行还是拦截（contracts 的 HookOnError）；只对 PreToolUse 生效。
    onError: z.enum(["allow", "deny"]).optional(),
  })
  .passthrough();

export const workspaceHookCommandConfigSchema = z
  .object({
    type: z.literal("command"),
    command: z.string().min(1),
    enabled: z.boolean().optional(),
    async: z.boolean().optional(),
    shell: z.union([z.literal(true), z.string().min(1)]).optional(),
    timeout: positiveNumberSchema.optional(),
    timeoutMs: positiveNumberSchema.optional(),
    statusMessage: z.string().min(1).optional(),
    // hook 自身出错时放行还是拦截（contracts 的 HookOnError）；只对 PreToolUse 生效。
    onError: z.enum(["allow", "deny"]).optional(),
  })
  .passthrough();

export const workspaceHookMatcherConfigSchema = z
  .object({
    matcher: z.string().min(1).optional(),
    hooks: z
      .array(
        z.discriminatedUnion("type", [
          workspaceHookProcessConfigSchema,
          workspaceHookCommandConfigSchema,
        ]),
      )
      .min(1),
  })
  .strict();

export const workspaceHooksConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    timeoutMs: positiveNumberSchema.optional(),
    maxOutputBytes: positiveNumberSchema.optional(),
    events: z
      .object({
        SessionStart: z.array(workspaceHookMatcherConfigSchema).optional(),
        UserPromptSubmit: z.array(workspaceHookMatcherConfigSchema).optional(),
        PreToolUse: z.array(workspaceHookMatcherConfigSchema).optional(),
        PermissionRequest: z.array(workspaceHookMatcherConfigSchema).optional(),
        PostToolUse: z.array(workspaceHookMatcherConfigSchema).optional(),
        PostToolUseFailure: z.array(workspaceHookMatcherConfigSchema).optional(),
        Stop: z.array(workspaceHookMatcherConfigSchema).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type WorkspaceHookDefinition =
  | z.infer<typeof workspaceHookCommandConfigSchema>
  | z.infer<typeof workspaceHookProcessConfigSchema>;
export type WorkspaceHooksConfig = z.infer<typeof workspaceHooksConfigSchema>;

export interface WorkspaceHookSourceInput {
  canonicalPath: string;
  baseDir: string;
  discoveryOrder: number;
  configFileKind: WorkspaceHookConfigFileKind;
  explicitProjectConfig: boolean;
  editable: boolean;
  hooks: WorkspaceHooksConfig;
}

export interface WorkspaceHookRuntimeRoot {
  enabled: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
}

export function resolveWorkspaceHookTimeoutMs(
  hook: Pick<WorkspaceHookDefinition, "type" | "timeoutMs"> & { timeout?: number },
  defaultTimeoutMs: number,
): number {
  const timeoutMs =
    hook.timeoutMs ??
    (hook.type === "command" && hook.timeout !== undefined
      ? hook.timeout * 1000
      : defaultTimeoutMs);
  return Math.max(1, Math.round(timeoutMs));
}

export function resolveWorkspaceHookMaxOutputBytes(maxOutputBytes: number): number {
  return Math.max(1, Math.round(maxOutputBytes));
}

/** Mirrors config-merger's hooks root semantics without materializing any callback. */
export function resolveWorkspaceHookRuntimeRoot(
  roots: readonly (
    | Partial<Pick<WorkspaceHooksConfig, "enabled" | "timeoutMs" | "maxOutputBytes">>
    | undefined
  )[],
): WorkspaceHookRuntimeRoot {
  let enabled = false;
  let timeoutMs = DEFAULT_WORKSPACE_HOOK_TIMEOUT_MS;
  let maxOutputBytes = DEFAULT_WORKSPACE_HOOK_MAX_OUTPUT_BYTES;

  for (const root of roots) {
    if (!root) continue;
    if (root.enabled === true) enabled = true;
    if (root.timeoutMs !== undefined) timeoutMs = root.timeoutMs;
    if (root.maxOutputBytes !== undefined) maxOutputBytes = root.maxOutputBytes;
  }

  return {
    enabled,
    timeoutMs: Math.max(1, Math.round(timeoutMs)),
    maxOutputBytes: resolveWorkspaceHookMaxOutputBytes(maxOutputBytes),
  };
}

export function resolveWorkspaceHookConfiguredGates(input: {
  sourceEnabled?: boolean;
  declarationEnabled?: boolean;
  runtimeHooksEnabled: boolean;
}) {
  const sourceRootEnabled = input.sourceEnabled !== false;
  const declarationEnabled = input.declarationEnabled !== false;
  return {
    sourceRootEnabled,
    declarationEnabled,
    runtimeHooksEnabled: input.runtimeHooksEnabled,
    configuredEnabled: sourceRootEnabled && declarationEnabled && input.runtimeHooksEnabled,
  };
}

export interface CanonicalWorkspaceHookEntryData {
  reviewItemId: string;
  event: WorkspaceHookEventName;
  matcherIndex: number;
  hookIndex: number;
  sourceFileIndex: number;
  sourceRelativePath: string;
  matcher: string | null;
  type: "command" | "process";
  command: string;
  args?: string[];
  async?: boolean;
  shell?: true | string;
  resolvedTimeoutMs: number;
  resolvedMaxOutputBytes: number;
  statusMessage?: string;
  /** 只在声明写成 `deny` 时在场：`allow` 与缺省同义，不进条目也不进摘要。 */
  onError?: "deny";
  sourceRootEnabled: boolean;
  declarationEnabled: boolean;
  runtimeHooksEnabled: boolean;
  configuredEnabled: boolean;
  editable: boolean;
  declarationDigestAlgorithm: "sha256";
  hookDeclarationDigest: string;
}

export interface WorkspaceHookBundleSnapshotData {
  schemaVersion: typeof WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION;
  workspaceIdentity: string;
  discoveredAt: string;
  sourceFiles: Array<{
    canonicalPath: string;
    baseDir: string;
    discoveryOrder: number;
    configFileKind: WorkspaceHookConfigFileKind;
    explicitProjectConfig: boolean;
    editable: boolean;
    hooksRoot: {
      enabled?: boolean;
      timeoutMs?: number;
      maxOutputBytes?: number;
    };
  }>;
  hooks: CanonicalWorkspaceHookEntryData[];
  digestAlgorithm: "sha256";
  bundleDigest: string;
}
