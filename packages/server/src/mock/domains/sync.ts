// 模拟 MCP 配置领域：保留原生会话使用的 MCP 目录契约。
// 同步清单是只读投影；不支持写入时按契约返回不可写，不伪造成功。
import { IMcpSyncService } from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

// ── MCP / 插件 / 技能 / 用户配置同步 ──

function emptySyncList() {
  return { items: [], categories: [] };
}

export class MockMcpSyncService implements IMcpSyncService {
  async loadMcpFromUserDirectory(
    _params: P<IMcpSyncService["loadMcpFromUserDirectory"]>,
  ): Promise<AR<IMcpSyncService["loadMcpFromUserDirectory"]>> {
    return { servers: [] } as unknown as AR<IMcpSyncService["loadMcpFromUserDirectory"]>;
  }

  async listWorkspaceMcpServerStatuses(
    _params: P<IMcpSyncService["listWorkspaceMcpServerStatuses"]>,
  ): Promise<AR<IMcpSyncService["listWorkspaceMcpServerStatuses"]>> {
    return { servers: [], mode: "all" as const } as unknown as AR<
      IMcpSyncService["listWorkspaceMcpServerStatuses"]
    >;
  }

  async setWorkspaceMcpTrust(
    _params: P<NonNullable<IMcpSyncService["setWorkspaceMcpTrust"]>>,
  ): Promise<AR<NonNullable<IMcpSyncService["setWorkspaceMcpTrust"]>>> {
    return { applied: false as const } as unknown as AR<
      NonNullable<IMcpSyncService["setWorkspaceMcpTrust"]>
    >;
  }

  async saveMcpToUserDirectory(
    _params: P<IMcpSyncService["saveMcpToUserDirectory"]>,
  ): Promise<void> {}

  async listSyncItems(): Promise<AR<IMcpSyncService["listSyncItems"]>> {
    return emptySyncList() as unknown as AR<IMcpSyncService["listSyncItems"]>;
  }

  async getSyncContentHashes(
    _params: P<IMcpSyncService["getSyncContentHashes"]>,
  ): Promise<AR<IMcpSyncService["getSyncContentHashes"]>> {
    return { hashes: {} } as unknown as AR<IMcpSyncService["getSyncContentHashes"]>;
  }

  async checkSyncWriteAccess(): Promise<AR<IMcpSyncService["checkSyncWriteAccess"]>> {
    return { writable: false as const, reason: "mock" as const } as unknown as AR<
      IMcpSyncService["checkSyncWriteAccess"]
    >;
  }

  async exportSyncItems(
    _params: P<IMcpSyncService["exportSyncItems"]>,
  ): Promise<AR<IMcpSyncService["exportSyncItems"]>> {
    return { items: [] } as unknown as AR<IMcpSyncService["exportSyncItems"]>;
  }

  async importSyncItems(
    _params: P<IMcpSyncService["importSyncItems"]>,
  ): Promise<AR<IMcpSyncService["importSyncItems"]>> {
    return { imported: 0, failed: 0 } as unknown as AR<IMcpSyncService["importSyncItems"]>;
  }
}

export function registerSyncMockServices(services: MockServiceRegistrar): void {
  services.register(IMcpSyncService, new MockMcpSyncService());
}
