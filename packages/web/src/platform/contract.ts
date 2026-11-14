/**
 * web-platform 契约：浏览器平台实现的公开入口。
 * 平台能力契约（IPlatformService）定义在 @zcode/shared；本模块只提供浏览器侧实现，
 * 消费方通过 `createWebPlatform()` 获得 IPlatformService，不再感知实现细节。
 */
import type { IPlatformService } from "@zcode/shared";

export type { IPlatformService };

/** 契约边界示例：web 端平台服务只有一个入口。 */
export interface WebPlatformContract {
  /** 创建浏览器平台实现；所有宿主相关能力按 Web fallback 返回空/拒绝。 */
  createWebPlatform(): IPlatformService;
}
