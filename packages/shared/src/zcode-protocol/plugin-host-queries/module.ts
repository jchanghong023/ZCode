/**
 * plugin-host-queries 模块清单（architecture-governance managed 模块）。
 * 范围：扩展进程 P2 的插件宿主查询——敏感选项私有存储与 plugins/readUserOptions（扩展进程 §16.7）、
 * plugins/mentionItems（§16.6）；线格式在本目录，浏览器安全客户端在 services。
 * 规格：apps/zcode-cli/docs/design/v2/plugin-compat.md「Sensitive Option Storage」「Composer Mention Items」。
 * 层：app。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const pluginHostQueriesModule = {
  id: "plugin-host-queries",
  requires: ["services", "shared"],
  provides: ["plugin-host-queries"],
  publicEntrypoints: [
    "contract.ts",
    "../../../../services/src/zcode-agent/pluginHostQueriesClient.ts",
  ],
} as const;
