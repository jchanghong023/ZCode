import { ProxyChannel, type IChannelServer } from "@zcode/rpc";
import type { ServiceDescriptor } from "./descriptors.js";

export interface ServiceExposurePolicy {
  readonly allowedChannels?: ReadonlySet<string>;
  /** 设置后只有逐 channel 登记的方法／事件可以暴露；未登记的服务一律不发布。 */
  readonly allowedMembers?: ReadonlyMap<string, ProxyChannel.ServiceExposurePolicy>;
}

/**
 * ServiceCollection — 服务注册中心
 *
 * 服务端用来注册服务实例，并自动暴露到 ChannelServer。
 */
export class ServiceCollection {
  private readonly _services = new Map<string, unknown>();

  register<T>(descriptor: ServiceDescriptor<T>, instance: T): this {
    this._services.set(descriptor.channelName, instance);
    return this;
  }

  get<T>(descriptor: ServiceDescriptor<T>): T {
    const instance = this._services.get(descriptor.channelName);
    if (!instance) {
      throw new Error(`Service not registered: ${descriptor.channelName}`);
    }
    return instance as T;
  }

  getOptional<T>(descriptor: ServiceDescriptor<T>): T | undefined {
    return this._services.get(descriptor.channelName) as T | undefined;
  }

  /** 将所有已注册的服务自动暴露为 channel */
  exposeOnChannelServer(
    server: IChannelServer,
    overrides: ReadonlyMap<string, unknown> = new Map(),
    exposurePolicy?: ServiceExposurePolicy,
  ): void {
    for (const [channelName, instance] of this._services) {
      if (exposurePolicy?.allowedChannels && !exposurePolicy.allowedChannels.has(channelName))
        continue;
      const members = exposurePolicy?.allowedMembers?.get(channelName);
      if (exposurePolicy?.allowedMembers && !members) continue;
      const selected = overrides.get(channelName) ?? instance;
      server.registerChannel(
        channelName,
        ProxyChannel.fromService(selected as Record<string, unknown>, undefined, members),
      );
    }
  }
}
