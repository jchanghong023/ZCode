/**
 * extensions-service 模块清单（architecture-governance managed 模块）。
 * 层：app（扩展门面与能力网关；三个门面共享同一实现与状态）。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const extensionsServiceModule = {
  id: "extensions-service",
  requires: [
    "extension-host-protocol",
    "mcp-apps-protocol",
    "plugin-ui-bridge",
    "plugin-host-queries",
    "session-control",
    "project",
    "rpc",
    "services",
    "shared",
  ],
  provides: ["extensions", "extension-views", "extension-grants"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
