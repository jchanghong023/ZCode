# 凭据加密类型

公开入口 `@zcode/shared/credential-security` 仅提供 `CredentialCipher` 类型与契约示例，没有系统凭据库、原生 keyring 或加密实现。

协议凭据请求与错误 schema 由对应 shared 协议拥有；保留这些类型不开放系统密钥，不构成账号认证服务或浏览器可调用的凭据 RPC。
