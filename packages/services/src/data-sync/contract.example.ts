import type { UserConfigSyncCategory } from "@zcode/shared";
import type { IDataSyncCategoryService, IUserConfigSyncService } from "./contract.js";

/**
 * 设置页「数据同步」的真实绑定：子智能体 / 命令 / 钩子共用一个 user-config-sync 通道，
 * 调用方按 category 绑成单个分类服务，比较在 Renderer 纯函数中完成，方向由调用方决定。
 */
export function bindUserConfigSyncCategory(
  channel: IUserConfigSyncService,
  category: UserConfigSyncCategory,
): IDataSyncCategoryService<unknown> {
  return {
    listSyncItems: () => channel.listSyncItems({ category }),
    getSyncContentHashes: ({ keys }) => channel.getSyncContentHashes({ category, keys }),
    checkSyncWriteAccess: () => channel.checkSyncWriteAccess({ category }),
    exportSyncItems: ({ keys }) => channel.exportSyncItems({ category, keys }),
    importSyncItems: ({ payload, items }) =>
      channel.importSyncItems({
        category,
        payload: payload as Parameters<typeof channel.importSyncItems>[0]["payload"],
        items,
      }),
  };
}
