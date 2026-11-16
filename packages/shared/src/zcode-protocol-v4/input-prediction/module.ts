/**
 * remote-input-prediction 模块清单（architecture-governance managed 模块）。
 * 范围：输入预测的纯 v4 协议线格式（本目录）。
 * 层：app。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const remoteInputPredictionModule = {
  id: "remote-input-prediction",
  requires: ["shared"],
  provides: ["remote-input-prediction"],
  publicEntrypoints: ["contract.ts"],
} as const;
