// 修复原因：已裁撤桌面凭据实现没有运行时消费者，公共入口只保留浏览器安全契约。
export type { CredentialCipher } from "./contract.js";
