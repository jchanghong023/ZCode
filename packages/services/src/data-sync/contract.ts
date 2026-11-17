import type {
  DataSyncContentHashesResult,
  DataSyncImportItem,
  DataSyncImportResult,
  DataSyncListResult,
  DataSyncWorkspaceMapping,
  RemoteSyncWriteAccessResult,
} from "@zcode/shared";

/**
 * 数据同步分类服务的统一形状。
 * 两端注册同一实现：本机作为 source，远端作为 target；方向由调用方决定，服务不写死。
 */
export interface IDataSyncCategoryService<TPayload> {
  listSyncItems(): Promise<DataSyncListResult>;
  /**
   * `targetHomeDir`：作为来源端计算时由调用方传入目标端 home。需要路径改写的分类（MCP）
   * 先把来源配置改写成目标端路径再计算，使两端可以直接比较；其他分类忽略。
   * `workspace`：带项目上下文的入口传入，MCP 先做 workspace 改写；其他分类忽略。
   */
  getSyncContentHashes(params: {
    keys: string[];
    targetHomeDir?: string;
    workspace?: DataSyncWorkspaceMapping;
  }): Promise<DataSyncContentHashesResult>;
  checkSyncWriteAccess(): Promise<RemoteSyncWriteAccessResult>;
  /** `workspace`：同 getSyncContentHashes；MCP 把它带进 payload，由目标端改写。 */
  exportSyncItems(params: {
    keys: string[];
    workspace?: DataSyncWorkspaceMapping;
  }): Promise<TPayload>;
  importSyncItems(params: {
    payload: TPayload;
    items: DataSyncImportItem[];
  }): Promise<DataSyncImportResult>;
}
