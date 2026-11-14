/**
 * plugin-ui-bridge 模块清单（architecture-governance managed 模块）。
 * 层：app（UI 与 Agent MCP 之间的桥；不缓存执行结果与工具输出）。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const pluginUiBridgeModule = {
  id: "plugin-ui-bridge",
  requires: ["services", "shared", "mcp-apps-protocol"],
  provides: ["plugin-ui-bridge", "plugin-ui-sampling", "plugin-ui-app-tools"],
  publicEntrypoints: ["index.ts", "contract.ts", "appToolsContract.ts", "samplingContract.ts"],
} as const;
