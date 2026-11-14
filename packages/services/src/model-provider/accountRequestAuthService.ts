// 修复原因：浏览器可达的鉴权 DTO/端口由契约拥有，不再从 Node 加密实现反向导入。
import type { RequestVerificationReason } from "@zcode/shared";
import type { ZCodeAccountAccess, ZCodeProviderAccountAccess } from "@zcode/shared";

export interface AccountRequestAuthMaterial {
  /** 私有传输字段兼容旧命名；套餐 OAuth 实际传入短期 Project Token。 */
  apiKey?: string;
  apiKeyId?: string;
  headers?: Record<string, string>;
  accountScope?: string;
}

export interface AccountRequestAuthInput {
  providerId: string;
  modelId?: string;
  accountAccess: ZCodeProviderAccountAccess | ZCodeAccountAccess;
  expectedAccountScope?: string;
  rejectedProjectTokenFingerprint?: string;
  reason: RequestVerificationReason | "off-peak" | "usage";
}

export interface AccountAccessIdentityInput {
  providerId: string;
  accountAccess: ZCodeProviderAccountAccess | ZCodeAccountAccess;
}

export interface AccountRequestAuthResolver {
  resolveAccessCurrent(access: ZCodeProviderAccountAccess): Promise<ZCodeAccountAccess | null>;
  resolveCurrent(input: AccountRequestAuthInput): Promise<AccountRequestAuthMaterial>;
  assertCurrent(input: AccountAccessIdentityInput): Promise<void>;
}

/**
 * 请求期 Account 鉴权边界。
 *
 * 服务按 Active Model 的静态 family/mode 约束，从当前账号连接解析请求材料。
 * 它不保存 Provider Config，也不提供 Registry fallback。
 */
export interface IAccountRequestAuthService {
  resolveAccessCurrent(access: ZCodeProviderAccountAccess): Promise<ZCodeAccountAccess | null>;
  resolveCurrent(input: AccountRequestAuthInput): Promise<AccountRequestAuthMaterial>;
  assertCurrent(input: AccountAccessIdentityInput): Promise<void>;
}

export function createAccountRequestAuthService(
  resolver: AccountRequestAuthResolver,
): IAccountRequestAuthService {
  return {
    resolveAccessCurrent(access) {
      return resolver.resolveAccessCurrent(access);
    },
    resolveCurrent(input) {
      return resolver.resolveCurrent(input);
    },
    assertCurrent(input) {
      return resolver.assertCurrent(input);
    },
  };
}
