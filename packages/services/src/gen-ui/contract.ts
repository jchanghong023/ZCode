import type { GenUiScope, GenUiStateEntry } from "@zcode/shared/gen-ui";
import { createServiceDescriptor } from "../descriptors.js";

/** 当前发送链只读取已有状态投影，不发布片段、沙箱、写入或事件能力。 */
export interface IGenUiService {
  listState(scope: GenUiScope): Promise<GenUiStateEntry[]>;
}
export const IGenUiService = createServiceDescriptor<IGenUiService>("gen-ui");
