import { describe, expect, it } from "vitest";
import { AIREQ_CONTRACT_VERSION, AIREQ_WORKFLOW_VERSION } from "@zcode/services/aireq";
import { connectST, stFetch, unique, waitUntil, wsUrl } from "./client.js";
import { config } from "./config.js";

// 对接规格：contract-design / connection-identity；这些断言不依赖后端实现种类。
describe("ST service readiness and connection boundary", () => {
  it(
    "reads configs and the compatible workflow through the configured HTTP and binary RPC entry",
    async () => {
      const response = await stFetch("/api/v1/client/configs");
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const body = await response.json();
      expect(body).toMatchObject({ code: 0, data: { configs: expect.any(Object) } });
      const c = await connectST();
      try {
        const bootstrap = await c.bootstrap();
        expect(bootstrap.contractVersion).toBe(AIREQ_CONTRACT_VERSION);
        expect(bootstrap.backend.id).toEqual(expect.any(String));
        expect(bootstrap.backend.id.trim()).not.toBe("");
        expect(bootstrap.models.revision).toBeGreaterThanOrEqual(0);
        expect(bootstrap.models.choices).toEqual(expect.any(Array));
        const remote = await c.read();
        expect(remote.view.version).toBe(AIREQ_WORKFLOW_VERSION);
        expect(remote.view.projects).toEqual(expect.any(Array));
        expect(remote.view.releases).toEqual(expect.any(Array));
        expect(remote.workspace.identity.trim()).not.toBe("");
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "rejects a body identity that differs from its connection and rejects unknown paths and malformed tuples",
    async () => {
      const c = await connectST();
      try {
        await expect(
          c.services.aiReqService.bootstrap({ ...c.identity, clientId: unique("wrong-client") }),
        ).rejects.toThrow();
        await expect(
          c.services.aiReqService.bootstrap({
            ...c.identity,
            employeeId: `${c.identity.employeeId[0] === "a" ? "b" : "a"}${c.identity.employeeId.slice(1)}`,
          }),
        ).rejects.toThrow();
        await expect(
          c.services.aiReqService.call(c.identity, "st.unknown-operation" as never, [] as never),
        ).rejects.toThrow();
        await expect(
          c.services.aiReqService.call(c.identity, "readWorkflow", [{}, "extra"] as never),
        ).rejects.toThrow();
        // 拒绝后连接仍能读取正式契约，不以 socket open 代替 RPC 可用性。
        expect((await c.bootstrap()).contractVersion).toBe(AIREQ_CONTRACT_VERSION);
        expect((await c.read()).view.version).toBe(AIREQ_WORKFLOW_VERSION);
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "rejects malformed connection identities before a WebSocket upgrade",
    async () => {
      const healthy = await connectST();
      try {
        expect((await healthy.bootstrap()).contractVersion).toBe(AIREQ_CONTRACT_VERSION);
        const url = wsUrl(
          { employeeId: "INVALID", clientId: unique("invalid-upgrade") },
          config.token,
        );
        const outcome = await new Promise<"opened" | "rejected">((resolve, reject) => {
          const socket = new WebSocket(url);
          const timer = setTimeout(
            () => {
              socket.close();
              reject(new Error("ST连接身份拒绝超时"));
            },
            Math.min(config.timeoutMs, 10_000),
          );
          const finish = (value: "opened" | "rejected") => {
            clearTimeout(timer);
            socket.close();
            resolve(value);
          };
          socket.addEventListener("open", () => finish("opened"), { once: true });
          socket.addEventListener("error", () => finish("rejected"), { once: true });
          socket.addEventListener("close", () => finish("rejected"), { once: true });
        });
        expect(outcome).toBe("rejected");
      } finally {
        await healthy.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "settles a read already in flight when the client disconnects",
    async () => {
      const c = await connectST();
      let outcome: "pending" | "read" | "closed" = "pending";
      const read = c.read().then(
        (remote) => {
          expect(remote.view.version).toBe(AIREQ_WORKFLOW_VERSION);
          outcome = "read";
        },
        (error: unknown) => {
          expect(error).toBeInstanceOf(Error);
          outcome = "closed";
        },
      );
      try {
        await c.close();
        await waitUntil(
          "断开前读取已完成或被明确拒绝",
          async () => outcome,
          (value) => value !== "pending",
        );
        await read;
        expect(["read", "closed"]).toContain(outcome);
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );
});
