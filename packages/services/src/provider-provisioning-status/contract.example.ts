import type { ProviderProvisioningLaneStatus } from "@zcode/shared";
import type { IProviderProvisioningStatusService } from "./contract.js";

/**
 * 数据同步页「模型提供商」的真实调用：等待 lane 空闲后读最近一次结果，只在失败时让用户重试同一条 lane。
 * 没有 lane 时不执行，返回本身就是唯一事实源，本服务不缓存也不持久化。
 */
export async function exampleProviderProvisioningRetry(
  service: IProviderProvisioningStatusService,
  sourceServerId: string,
): Promise<ProviderProvisioningLaneStatus> {
  const current = await service.getStatus({ sourceServerId, waitForIdle: true });
  if (current.lane === "none" || current.running || current.lastResult?.outcome !== "failed") {
    return current;
  }
  return service.retry({ sourceServerId });
}
