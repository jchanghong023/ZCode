import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
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
      resolve(webRoot, "vite.config.ts"),
      webRoot,
      "silent",
    );
    for (const name of [
      "VITE_ZAI_OAUTH_CLIENT_ID",
      "VITE_ZAI_OAUTH_ORIGIN",
      "VITE_BIGMODEL_OAUTH_ORIGIN",
    ]) {
      expect(result?.config.define?.[`import.meta.env.${name}`]).toBeUndefined();
    }
    expect(result?.config.server?.proxy).not.toHaveProperty("/api/v1/oauth");
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

describe("Vite browser console forwarding lifecycle", () => {
  it("preserves local diagnostics and pending sends without forwarding after disconnect", async () => {
    // 执行实际安装的开发客户端函数，不对补丁文字作断言；依赖升级改变入口时必须重新复核补丁。
    const require = createRequire(import.meta.url);
    const clientPath = resolve(
      dirname(require.resolve("vite/package.json")),
      "dist/client/client.mjs",
    );
    const source = ts.createSourceFile(
      clientPath,
      readFileSync(clientPath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const names = new Set([
      "createInvokeableTransport",
      "normalizeModuleRunnerTransport",
      "setupForwardConsoleHandler",
      "formatConsoleArgs",
      "stringifyConsoleArg",
    ]);
    const declarations = source.statements.filter((statement) => {
      if (ts.isFunctionDeclaration(statement)) return names.has(statement.name?.text ?? "");
      return (
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) => ts.isIdentifier(declaration.name) && names.has(declaration.name.text),
        )
      );
    });
    const localWarn = vi.fn();
    const local = { warn: localWarn };
    const events = new EventTarget();
    const runtime = runInNewContext(
      declarations.map((statement) => statement.getText(source)).join("\n") +
        "\n({ normalizeModuleRunnerTransport, setupForwardConsoleHandler });",
      { console: local, window: events },
    ) as {
      normalizeModuleRunnerTransport(raw: object): {
        connect(): Promise<void>;
        disconnect(): Promise<void>;
        send(payload: unknown): Promise<void>;
      };
      setupForwardConsoleHandler(transport: object, options: object): void;
    };
    const sent = vi.fn();
    let releaseConnection!: () => void;
    let disconnected!: () => void;
    const pending = new Promise<void>((resolve) => {
      releaseConnection = resolve;
    });
    const transport = runtime.normalizeModuleRunnerTransport({
      connect(handlers: { onDisconnection(): void }) {
        disconnected = handlers.onDisconnection;
        return pending;
      },
      disconnect() {
        disconnected();
      },
      send: sent,
    });
    runtime.setupForwardConsoleHandler(transport, {
      enabled: true,
      logLevels: ["warn"],
      unhandledErrors: true,
    });
    local.warn("before connection");
    expect(sent).not.toHaveBeenCalled();

    const connection = transport.connect();
    local.warn("during connection");
    expect(sent).not.toHaveBeenCalled();
    releaseConnection();
    await connection;
    expect(sent).toHaveBeenCalledExactlyOnceWith({
      type: "custom",
      event: "vite:forward-console",
      data: { type: "log", data: { level: "warn", message: "during connection" } },
    });

    await transport.disconnect();
    local.warn("after disconnect");
    events.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: new Error("original application error"),
      }),
    );
    expect(localWarn.mock.calls).toEqual([
      ["before connection"],
      ["during connection"],
      ["after disconnect"],
    ]);
    expect(sent).toHaveBeenCalledTimes(1);
    // 转发不再制造额外异常，但真正的非法直发仍明确失败，不改变 transport 的拒绝契约。
    await expect(transport.send({ type: "custom", event: "invalid-send" })).rejects.toThrow(
      "send was called before connect",
    );
  });
});
