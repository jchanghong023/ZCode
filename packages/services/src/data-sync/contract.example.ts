import type { IDataSyncCategoryService } from "./contract.js";

/** Read the preserved MCP category through its generic category contract. */
export async function readSyncCategory(service: IDataSyncCategoryService<unknown>) {
  return service.listSyncItems();
}
