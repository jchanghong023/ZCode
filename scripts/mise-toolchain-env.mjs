import { delimiter, dirname } from "node:path";

/**
 * 让子 shell 优先使用启动器相同的 Bun；包管理器仍由调用方通过 Bun 显式执行。
 * 不依赖用户 home 布局，也不把系统 Node 或包管理器 shim 设为运行时入口。
 */
export function withPinnedBunPath(env, bunExecutablePath) {
  const bunDirectory = dirname(bunExecutablePath);
  // Windows 环境可能使用 `Path`；保留原有键及包管理器所在目录。
  const pathKey = typeof env.PATH === "string" ? "PATH" : "Path";
  const existingPath = typeof env[pathKey] === "string" ? env[pathKey] : "";
  const pathEntries = existingPath
    .split(delimiter)
    .filter(Boolean)
    .filter((entry) => entry !== bunDirectory);

  return {
    ...env,
    [pathKey]: [bunDirectory, ...pathEntries].join(delimiter),
  };
}
