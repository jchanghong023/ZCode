import { BaseSequencer } from "vitest/node";

/** 长流程文件先启动，保留 Vitest 其余排序与分片规则。 */
export default class STSequencer extends BaseSequencer {
  override async sort(files: Parameters<BaseSequencer["sort"]>[0]) {
    const sorted = await super.sort(files);
    const priority = (path: string) =>
      path.endsWith("/formal.test.ts") ? 0 : path.endsWith("/scheduler.test.ts") ? 1 : 2;
    return sorted.sort((a, b) => priority(a.moduleId) - priority(b.moduleId));
  }
}
