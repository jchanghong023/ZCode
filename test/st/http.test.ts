import { describe, expect, it } from "vitest";
import { stFetch, unique, wsUrl } from "./client.js";
import { config } from "./config.js";

function expectSafeError(body: string): void {
  expect(body).not.toMatch(/\bat\s+\S+\s*\([^\n]+:\d+:\d+\)|"stack"\s*:/u);
  expect(body).not.toContain("node_modules/");
  if (config.token) expect(body).not.toContain(config.token);
}

describe("ST public HTTP contract", () => {
  it(
    "serves structured non-cacheable configs rather than an HTML fallback",
    async () => {
      const response = await stFetch("/api/v1/client/configs");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("cache-control")).toContain("no-store");
      const body = await response.json();
      expect(body).toMatchObject({ code: 0, data: { configs: expect.any(Object) } });
      const feedbackUrl: unknown = body.data.configs.feedbackUrl;
      // HelpAppConfig 契约中 feedbackUrl 是配置对象；反馈链接是其中的 feedback_url。
      // 旧断言把容器误当 URL 字符串，会拒绝合法响应，也会放过缺失配置对象。
      expect(feedbackUrl).toEqual(expect.any(Object));
      expect(Array.isArray(feedbackUrl)).toBe(false);
      const helpConfig = feedbackUrl as Record<string, unknown>;
      if (helpConfig.feedback_url !== undefined)
        expect(typeof helpConfig.feedback_url).toBe("string");
      if (helpConfig.feedback_use_external_form !== undefined)
        expect(typeof helpConfig.feedback_use_external_form).toBe("boolean");
      if (helpConfig.community_urls !== undefined) {
        expect(helpConfig.community_urls).toEqual(expect.any(Object));
        expect(Array.isArray(helpConfig.community_urls)).toBe(false);
        const communities = helpConfig.community_urls as Record<string, unknown>;
        for (const locale of ["zh-CN", "en-US"] as const)
          if (communities[locale] !== undefined) expect(typeof communities[locale]).toBe("string");
      }
    },
    config.timeoutMs,
  );

  it.each(["ui", "arms"] as const)(
    "accepts a valid %s telemetry envelope as 202 with no response body",
    async (kind) => {
      const envelope =
        kind === "ui"
          ? {
              kind,
              payload: {
                elementName: "st-contract",
                eventRegion: "st",
                eventType: "validation",
                eventExtraDetail: { correlation: unique("telemetry") },
                context: {
                  uiMode: "unknown",
                  clientTimezone: "Asia/Shanghai",
                  clientLanguage: "zh-CN",
                  screenResolution: "0x0",
                },
              },
            }
          : {
              kind,
              payload: {
                name: unique("st-contract"),
                group: "st",
                value: 1,
                properties: { purpose: "contract-validation" },
              },
            };
      const response = await stFetch("/api/v1/telemetry/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(envelope),
      });
      expect(response.status).toBe(202);
      expect(await response.text()).toBe("");
    },
    config.timeoutMs,
  );

  it.each([
    "{",
    JSON.stringify({ kind: "unknown", payload: {} }),
    JSON.stringify({
      kind: "arms",
      payload: { name: "st-invalid", group: "st", extra: "not-public" },
    }),
    JSON.stringify({ kind: "arms", payload: { name: "st-invalid", group: "st" }, extra: true }),
  ])(
    "rejects malformed or non-contract telemetry without leaking server diagnostics",
    async (body) => {
      const response = await stFetch("/api/v1/telemetry/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      expect(response.status).toBe(400);
      expectSafeError(await response.text());
    },
    config.timeoutMs,
  );

  it(
    "enforces configured deployment credentials without confusing employee identity with authentication",
    async () => {
      if (!config.token) {
        // 未声明部署 token 时验证正常公开读取；不能把无 token 部署当成认证测试通过。
        const response = await stFetch("/api/v1/client/configs");
        expect(response.status).toBe(200);
        return;
      }
      const allowed = await stFetch("/api/v1/client/configs");
      expect(allowed.status).toBe(200);
      for (const authorization of ["", `Bearer ${unique("invalid-token")}`]) {
        const response = await stFetch("/api/v1/client/configs", {
          headers: { Authorization: authorization },
        });
        expect(response.status).toBe(401);
        expectSafeError(await response.text());
      }
    },
    config.timeoutMs,
  );

  it(
    "closes a valid WebSocket with 1003 when a client sends a text frame",
    async () => {
      const url = wsUrl(
        { employeeId: config.employeeId, clientId: unique("text-frame") },
        config.token,
      );
      const code = await new Promise<number>((resolve, reject) => {
        const socket = new WebSocket(url);
        const timer = setTimeout(
          () => {
            socket.close();
            reject(new Error("ST文本帧拒绝超时"));
          },
          Math.min(config.timeoutMs, 10_000),
        );
        socket.addEventListener("open", () => socket.send("st-text-is-not-binary-rpc"), {
          once: true,
        });
        socket.addEventListener(
          "close",
          (event) => {
            clearTimeout(timer);
            resolve(event.code);
          },
          { once: true },
        );
        socket.addEventListener(
          "error",
          () => {
            clearTimeout(timer);
            socket.close();
            reject(new Error("ST文本帧验证连接失败"));
          },
          { once: true },
        );
      });
      expect(code).toBe(1003);
    },
    config.timeoutMs,
  );
});
