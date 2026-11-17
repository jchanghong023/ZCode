import type {
  CodingPlanResetScopeRequest,
  CodingPlanResetStatusSnapshot,
  UsageEntitlementRequest,
  UsageEntitlementSnapshot,
} from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

// 当前产品只消费重置状态与权益投影；旧统计页和写操作不再形成 RPC。
export interface IUsageStatsService {
  getCodingPlanResetStatus(
    request: CodingPlanResetScopeRequest,
  ): Promise<CodingPlanResetStatusSnapshot>;
  getEntitlementSnapshot(request?: UsageEntitlementRequest): Promise<UsageEntitlementSnapshot>;
}

export const IUsageStatsService = createServiceDescriptor<IUsageStatsService>(
  ServiceChannels.UsageStats,
);
