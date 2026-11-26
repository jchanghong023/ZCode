import { watchFile, unwatchFile } from "node:fs";
import { join } from "node:path";
import { createServiceLogger } from "@zcode/services/logger";
import { digestValue } from "./content-digest.js";
import { mergeRedSnapshot, projectionForRed, type PrototypeCatalogue } from "./catalogue-source.js";
import {
  catalogueFromTransfer,
  readNewTransfer,
  transferFilename,
  type ReceivedCatalogue,
} from "./file-exchange.js";
import { syncPrototypeProjectNames } from "./project-settings.js";
import type { ProductionStore } from "./production-store.js";
import type { RequirementGroup, WorkflowState } from "./workflow-state.js";

const logger = createServiceLogger("aireq.exchange");

interface WorkflowOwner {
  current(): WorkflowState;
  install(next: WorkflowState): void;
  queueShared(store: ProductionStore, next: WorkflowState, row: RequirementGroup): void;
  notify(store: ProductionStore): void;
}

export function createRedZoneReceiver(owner: WorkflowOwner) {
  let received: ReceivedCatalogue | undefined;
  let projection: PrototypeCatalogue | undefined;

  function synchronize(store: ProductionStore): PrototypeCatalogue {
    if (!projection) {
      received = store.get<ReceivedCatalogue>("received-catalogue");
      projection = projectionForRed(received, owner.current());
      syncPrototypeProjectNames(projection.projects);
    }
    const packet = readNewTransfer(store, received);
    if (!packet) return projection;
    const source = catalogueFromTransfer(packet);
    const { next, changedDocuments, activityChanged } = mergeRedSnapshot(owner.current(), packet);
    // 同样的全量数据可能每五分钟抵达；只推进传输水位，保留无变化的工作流版本。
    if (
      received &&
      !changedDocuments.length &&
      !activityChanged &&
      digestValue(source.projects) === digestValue(received.projects)
    ) {
      store.set("received-catalogue", source);
      received = source;
      return projection;
    }
    next.revision++;
    store.db.transaction(() => {
      store.set("workflow", next);
      store.set("received-catalogue", source);
      for (const row of changedDocuments) owner.queueShared(store, next, row);
    })();
    owner.install(next);
    received = source;
    projection = projectionForRed(source, next);
    syncPrototypeProjectNames(projection.projects);
    owner.notify(store);
    return projection;
  }

  return {
    start(store: ProductionStore): () => void {
      if (store.zone !== "red") throw new Error("只有红区可接收交接包。");
      const path = join(store.exchange, transferFilename);
      const receive = () => {
        try {
          synchronize(store);
        } catch (error) {
          logger.warn(undefined, "跨区交接未接纳，保留现有目录与材料。", { error });
        }
      };
      // 网络挂载的原子替换未必产生本机文件事件，按状态轮询观察最终文件。
      watchFile(path, { persistent: false, interval: 1000 }, receive);
      receive();
      return () => unwatchFile(path, receive);
    },
    async read(store: ProductionStore, explicitRefresh: boolean): Promise<PrototypeCatalogue> {
      if (!explicitRefresh && projection) return projection;
      try {
        return synchronize(store);
      } catch (error) {
        if (!explicitRefresh && projection) return projection;
        throw error;
      }
    },
  };
}
