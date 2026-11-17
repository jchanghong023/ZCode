/**
 * plugin-host-queries 模块清单（architecture-governance managed 模块）。
 * 范围：插件宿主只读查询的纯线格式 schema、类型、限额与稳定错误码（本目录）。
 * 规格：相邻实现「Sensitive Option Storage」「Composer Mention Items」。
 * 层：app。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const pluginHostQueriesModule = {
  id: "plugin-host-queries",
  requires: [],
  provides: ["plugin-host-queries"],
  publicEntrypoints: ["contract.ts"],
} as const;
