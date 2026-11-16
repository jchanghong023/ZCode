/**
 * context-composition 模块清单（architecture-governance managed 模块）。
 * 范围：context 组成的纯 v4 线格式、类型与投影函数（本目录）。
 * 规格：apps/zcode-cli/docs/design/v2/model/context-composition.md。
 * 层：app。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const contextCompositionModule = {
  id: "context-composition",
  requires: ["shared"],
  provides: ["context-composition"],
  publicEntrypoints: ["contract.ts"],
} as const;
