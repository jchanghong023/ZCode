export const workspaceHooksModule = {
  id: "workspace-hooks",
  requires: [],
  provides: ["workspace-hook-contract"],
  publicEntrypoints: ["contract.ts"],
} as const;
