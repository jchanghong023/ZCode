import type {
  LoadCliMcpFromUserDirectoryRequest,
  NativeMcpServerRecord,
  SaveCliMcpToUserDirectoryRequest,
} from "@zcode/shared";
import type { IMcpSyncService } from "@zcode/services";
import { logger } from "@/logger.js";

/**
 * MCP 用户目录读写的唯一来源是后端 workspace 服务。
 * 浏览器没有宿主 ~/.zcode 目录，也不再有平台端口兜底：服务未绑定时显式失败/返回 false。
 */
export type McpDirectoryService = Pick<
  IMcpSyncService,
  "loadMcpFromUserDirectory" | "saveMcpToUserDirectory"
>;

export async function persistCliMcpToUserDirectory(
  directoryService: McpDirectoryService | null,
  payload: SaveCliMcpToUserDirectoryRequest,
): Promise<boolean> {
  if (!directoryService) {
    logger.warn("[mcpStore] MCP directory service unavailable, skip persisting CLI MCP");
    return false;
  }
  await directoryService.saveMcpToUserDirectory(payload);
  return true;
}

export async function fetchNativeMcpServers(
  directoryService: McpDirectoryService | null,
  payload?: LoadCliMcpFromUserDirectoryRequest,
): Promise<NativeMcpServerRecord[]> {
  if (!directoryService) {
    // 读取失败不是“配置为空”：调用方据此保持 not-ready，不能下发空列表覆盖运行态。
    throw new Error("MCP directory service is not ready");
  }
  const result = await directoryService.loadMcpFromUserDirectory(payload);
  return result.servers ?? [];
}
