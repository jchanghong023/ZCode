import {
  DEFAULT_ZCODE_ENDPOINT_ORIGIN,
  ZCODE_VERSION,
  buildHelpAppConfigUrl,
  createHelpAppConfigReader,
  resolveHelpAppConfig,
  toZhOrEnLocale,
  type Locale,
} from "@zcode/shared";
import localDefaultAppConfig from "../../../config/default.json" with { type: "json" };

interface ResolveWebCommunityUrlOptions {
  fetchImpl?: typeof fetch;
  localConfig?: unknown;
  endpointOrigin?: string;
}

const readHelpConfig = createHelpAppConfigReader({
  fetchImpl: (input, init) => fetch(input, init),
});

export async function resolveWebHelpConfig(options: ResolveWebCommunityUrlOptions = {}) {
  const env = import.meta.env;
  // 纯 Web 应用是自洽站点：help/community 配置来自站点自己的后端（HTTP/HTTPS 均可）。
  // 浏览器内一律取当前 origin 同源请求（dev 由 vite 把 /api 代理到 mock server，
  // 生产部署是同源 SPA+后端）；不再默认指向生产 endpoint，避免 HTTP 站点发起跨域
  // HTTPS 请求被 CORS/403 拦截，控制台出现启动期错误。
  const locationOrigin =
    typeof globalThis.location?.origin === "string" && globalThis.location.origin.startsWith("http")
      ? globalThis.location.origin
      : undefined;
  const endpoint =
    options.endpointOrigin ??
    locationOrigin ??
    (env?.VITE_ZCODE_BASE_URL?.trim() ||
      env?.VITE_ZCODE_ENDPOINT_ORIGIN?.trim() ||
      DEFAULT_ZCODE_ENDPOINT_ORIGIN);
  // 服务端拒绝 platform=web；浏览器省略可选平台参数，避免伪装桌面系统。
  const url = buildHelpAppConfigUrl(endpoint, ZCODE_VERSION);
  let remote: unknown;
  try {
    remote = await (
      options.fetchImpl
        ? createHelpAppConfigReader({ fetchImpl: options.fetchImpl })
        : readHelpConfig
    )(url);
  } catch {
    // 远端不可用时保留内置入口，不使用旧 CDN 作为第二个远端配置源。
  }
  return resolveHelpAppConfig(remote, options.localConfig ?? localDefaultAppConfig);
}

export async function resolveWebCommunityUrl(
  locale: Locale,
  options: ResolveWebCommunityUrlOptions = {},
): Promise<string | undefined> {
  // 社区链接只配置中英；非中文界面语言走英文链接。
  return (await resolveWebHelpConfig(options)).community_urls?.[toZhOrEnLocale(locale)];
}
