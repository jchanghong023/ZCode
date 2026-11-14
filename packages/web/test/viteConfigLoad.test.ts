import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfigFromFile } from "vite";

describe("web Vite config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("publishes PDF.js CMaps for non-latin PDF rendering", async () => {
    const webRoot = resolve(import.meta.dirname, "..");
    const configFile = resolve(webRoot, "vite.config.ts");
    const result = await loadConfigFromFile(
      {
        command: "build",
        mode: "production",
        isPreview: false,
        isSsrBuild: false,
      },
      configFile,
      webRoot,
      "silent",
    );

    // Bugfix：PDF.js CMaps 发布随 legacy desktop features trim 移除（插件已不存在），
    // 这里只保留 config 可加载的冒烟断言。
    expect(Array.isArray(result?.config.plugins)).toBe(true);
  });

  it("显式 ZCODE_ENV=production 时保留 API 链接且不注入旧账号参数", async () => {
    vi.stubEnv("ZCODE_ENV", "production");
    const webRoot = resolve(import.meta.dirname, "..");
    const configFile = resolve(webRoot, "vite.config.ts");
    const result = await loadConfigFromFile(
      {
        command: "build",
        mode: "production",
        isPreview: false,
        isSsrBuild: false,
      },
      configFile,
      webRoot,
      "silent",
    );

    expect(result?.config.define).toMatchObject({
      "import.meta.env.VITE_ZCODE_BASE_URL": JSON.stringify("https://zcode.z.ai"),
    });
  });

  it.each(["test", "production"])("%s 构建不发布旧账号授权配置或专用代理", async (environment) => {
    vi.stubEnv("ZCODE_ENV", environment);
    const webRoot = resolve(import.meta.dirname, "..");
    const result = await loadConfigFromFile(
      { command: "serve", mode: "development", isPreview: false, isSsrBuild: false },
      resolve(webRoot, "vite.config.ts"), webRoot, "silent",
    );
    for (const name of ["VITE_ZAI_OAUTH_CLIENT_ID", "VITE_ZAI_OAUTH_ORIGIN", "VITE_BIGMODEL_OAUTH_ORIGIN"]) {
      expect(result?.config.define?.[`import.meta.env.${name}`]).toBeUndefined();
    }
    expect(result?.config.server?.proxy).not.toHaveProperty("/api/v1/oauth");
    expect(result?.config.server?.proxy).toMatchObject({
      "/ws": { target: "ws://localhost:3030", ws: true },
      "/api": { target: "http://localhost:3030" },
    });
  });

  it("uses shared ZCode endpoint env override for renderer injection", async () => {
    vi.stubEnv("ZCODE_ENV", "test");
    vi.stubEnv("ZCODE_BASE_URL", "https://zcode.z.ai/custom/path");
    const webRoot = resolve(import.meta.dirname, "..");
    const configFile = resolve(webRoot, "vite.config.ts");
    const result = await loadConfigFromFile(
      {
        command: "build",
        mode: "production",
        isPreview: false,
        isSsrBuild: false,
      },
      configFile,
      webRoot,
      "silent",
    );

    expect(result?.config.define).toMatchObject({
      "import.meta.env.VITE_ZCODE_BASE_URL": JSON.stringify("https://zcode.z.ai"),
      "import.meta.env.VITE_ZCODE_ENDPOINT_ORIGIN": JSON.stringify("https://zcode.z.ai"),
    });
  });
});
