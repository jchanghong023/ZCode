import { workspaceHooksConfigSchema, type WorkspaceHookBundleSnapshotData } from "./contract.js";

export const workspaceHooksExample = workspaceHooksConfigSchema.parse({
  enabled: true,
  events: {
    SessionStart: [{ hooks: [{ type: "command", command: "echo ready" }] }],
  },
});

export function describeWorkspaceHooks(snapshot: WorkspaceHookBundleSnapshotData): string[] {
  return snapshot.hooks.map((hook) => `${hook.event}: ${hook.command}`);
}
