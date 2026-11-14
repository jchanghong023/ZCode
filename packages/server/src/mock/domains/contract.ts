// mock 领域模块契约：领域模块只负责注册本域服务，权威状态仍集中在 MockRuntime。
// 依赖方向固定为 domains → runtime/协议契约，禁止领域之间互相读取或写入内存态。
import type { ServiceDescriptor } from "@zcode/services";
import type { MockRuntime } from "../runtime.js";

/** ServiceCollection 的最小注册面：领域模块不依赖注册中心的实现细节。 */
export interface MockServiceRegistrar {
  register<T>(descriptor: ServiceDescriptor<T>, instance: T): void;
}

/** 一个领域的装配入口；集中装配 index.ts 逐个调用。 */
export type MockDomainRegistrar = (services: MockServiceRegistrar, runtime: MockRuntime) => void;
