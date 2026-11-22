import { createMemoryDiagnosticsRegistry, type MemoryDiagnosticsRegistry } from "@zcode/shared";
/**
 * renderer 内存诊断计数器注册表。
 * 各缓存/store 模块在模块加载时注册纯读取 provider；`startMemoryDiagnosticsLogger` 每 60 秒
 * 采样一次，经门控后通过 `logger.logMemoryDiagnostics` 写桌面主日志。
 */
export const uiMemoryDiagnosticsRegistry: MemoryDiagnosticsRegistry =
  createMemoryDiagnosticsRegistry();

