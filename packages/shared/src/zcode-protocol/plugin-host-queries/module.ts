/**
 * plugin-host-queries 模块清单（architecture-governance managed 模块）。
 * 范围：插件宿主只读查询协议、官方插件身份／可见性纯规则与安装请求载荷校验。
 * 保留原源码入口与 schema，不提供插件发现、推荐、安装或执行能力。
 * 层：app。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const pluginHostQueriesModule = {
  id: "plugin-host-queries",
  requires: ["shared"],
  provides: ["plugin-host-queries", "plugin-official-identity", "plugin-install-payload"],
  publicEntrypoints: [
    "contract.ts",
    "../../plugin-store-visibility.ts",
    "../../zcode-protocol-v4/pluginInstall.ts",
  ],
} as const;
