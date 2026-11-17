import type { MockDomainRegistrar, MockServiceRegistrar } from "./contract.js";

/**
 * 契约示例：领域注册函数只注册自己的服务，不读取其它领域的私有状态。
 * 真正的领域见 settings/models/assets/...；示例只演示装配形状。
 */
export const exampleMockDomain: MockDomainRegistrar = (services: MockServiceRegistrar): void => {
  services.register<{ readonly readiness: "mock" }>(
    { channelName: "mock.domainExample" },
    { readiness: "mock" },
  );
};
