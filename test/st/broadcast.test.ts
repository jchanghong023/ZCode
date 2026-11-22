import { describe, expect, it } from "vitest";
import { IBroadcastService, type WebBroadcastMessage } from "@zcode/services";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { config } from "./config.js";

// 正向交付通过事件确认；窗口只用于观察不应收到的消息，不是业务完成的 sleep 证据。
const observeQuietWindow = () => new Promise<void>((resolve) => setTimeout(resolve, 250));

describe("ST connection-owned broadcast", () => {
  it(
    "rejects malformed requests and delivers valid messages only to other active connections",
    async () => {
      const clients: STClient[] = [];
      const listeners: { dispose(): void }[] = [];
      try {
        const a = await connectST();
        clients.push(a);
        const b = await connectST();
        clients.push(b);
        const c = await connectST();
        clients.push(c);
        const channel = unique("st:broadcast");
        const received = {
          a: [] as WebBroadcastMessage[],
          b: [] as WebBroadcastMessage[],
          c: [] as WebBroadcastMessage[],
        };
        listeners.push(
          a.services.broadcastService.onMessage((message) => {
            if (message.channel === channel) received.a.push(message);
          }),
          b.services.broadcastService.onMessage((message) => {
            if (message.channel === channel) received.b.push(message);
          }),
          c.services.broadcastService.onMessage((message) => {
            if (message.channel === channel) received.c.push(message);
          }),
        );
        // 首次回读确认订阅客户端的 RPC 已可用，发送后由真实 onMessage 验证交付。
        await Promise.all([a.bootstrap(), b.bootstrap(), c.bootstrap()]);
        const first = { marker: unique("first"), value: { theme: "st-only" } };
        // 无效请求必须拒绝，且不能进入任何连接的事件流。
        const payload = { marker: unique("rejected") };
        const invalidCalls = [
          ["no arguments", []],
          ["non-array arguments", { channel, payload }],
          ["null message", [null]],
          ["primitive message", [channel]],
          ["array message", [[{ channel, payload }]]],
          ["binary message", [new Uint8Array([42])]],
          ["missing channel", [{ payload }]],
          ["non-string channel", [{ channel: 42, payload }]],
          ["missing payload", [{ channel }]],
          ["forged source", [{ channel, payload, sourceWindowId: -1 }]],
          ["unknown field", [{ channel, payload, extra: true }]],
          ["extra argument", [{ channel, payload }, undefined]],
        ] as const;
        for (const [reason, args] of invalidCalls) {
          expect(
            await a.probeRpc("call", IBroadcastService.channelName, "send", args),
            reason,
          ).toMatchObject({ code: "INVALID_ARGUMENT" });
        }
        await expect(
          a.services.broadcastService.send({ channel, payload: first }),
        ).resolves.toBeUndefined();
        await waitUntil(
          "B/C 收到 A 的广播",
          async () => received,
          (value) => value.b.length > 0 && value.c.length > 0,
        );
        await observeQuietWindow();
        expect(received.a).toEqual([]);
        expect(received.b).toStrictEqual([{ channel, payload: first }]);
        expect(received.c).toStrictEqual([{ channel, payload: first }]);

        listeners[1]!.dispose();
        const second = null;
        await expect(
          a.services.broadcastService.send({ channel, payload: second }),
        ).resolves.toBeUndefined();
        await waitUntil(
          "C 在 B 退订后继续收到消息",
          async () => received.c,
          (messages) => messages.length >= 2,
        );
        await observeQuietWindow();
        expect(received.b.map((message) => message.payload)).toEqual([first]);
        expect(received.a).toEqual([]);

        await b.close();
        const third = false;
        await expect(
          c.services.broadcastService.send({ channel, payload: third }),
        ).resolves.toBeUndefined();
        await waitUntil(
          "A 在 B 关闭后仍收到 C 消息",
          async () => received.a,
          (messages) => messages.length > 0,
        );
        await observeQuietWindow();
        expect(received.a.map((message) => message.payload)).toEqual([third]);
        expect(received.b.map((message) => message.payload)).toEqual([first]);
        expect(received.c.map((message) => message.payload)).toEqual([first, second]);
      } finally {
        for (const listener of listeners) listener.dispose();
        await Promise.all(clients.map((client) => client.close()));
      }
    },
    config.timeoutMs,
  );
});
