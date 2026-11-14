# Credential security contract

公开入口 `@zcode/shared/credential-security` 只提供 `CredentialCipher` 类型及契约示例，不提供系统凭据库或加密实现。

纯 Web 应用的服务实现由模拟后端提供；已裁撤 Desktop/Host/CLI 的系统凭据实现和进程桥没有当前消费者，随本次边界修复移除，不迁入 mock 后端。shared 不再安装原生 keyring。

协议中的凭据请求与错误 schema 仍由 shared 的现存协议文件拥有；本次不改变其格式，不开放系统密钥，不改变浏览器认证行为。
