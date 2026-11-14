/**
 * voice-input-service 模块清单（architecture-governance managed 模块）。
 * 层：adapters（本机 Host ASR：ticket + WebSocket PCM16 转发）。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const voiceInputServiceModule = {
  id: "voice-input-service",
  requires: ["services", "shared", "rpc"],
  provides: ["voice-input"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
