/**
 * conversation-telemetry-service 模块清单（architecture-governance managed 模块）。
 * 层：app（只包装已完成鉴权的 connection-scoped agent service）。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const conversationTelemetryServiceModule = {
  id: "conversation-telemetry-service",
  requires: ["shared", "services", "rpc", "conversation-telemetry-engine"],
  provides: ["conversation-telemetry"],
  publicEntrypoints: ["contract.ts"],
} as const;
