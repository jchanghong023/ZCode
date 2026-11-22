import { describe, expect, it } from "vitest";
import type { WebBroadcastMessage } from "@zcode/services";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { config } from "./config.js";

// 正向交付通过事件确认；窗口只用于观察不应收到的消息，不是业务完成的 sleep 证据。
const observeQuietWindow = () => new Promise<void>((resolve) => setTimeout(resolve, 250));

describe("ST connection-owned broadcast", () => {
  it(
    "rejects client-supplied origins and delivers only to other active connections",
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
        const forgedMessage = {
          channel,
          payload: { marker: unique("rejected") },
          sourceWindowId: -1,
        };
        await expect(a.services.broadcastService.send(forgedMessage)).rejects.toThrow();
        await a.services.broadcastService.send({ channel, payload: first });
        await waitUntil(
          "B/C 收到 A 的广播",
          async () => received,
          (value) => value.b.length > 0 && value.c.length > 0,
        );
        await observeQuietWindow();
        expect(received.a).toEqual([]);
        expect(received.b).toEqual([{ channel, payload: first }]);
        expect(received.c).toEqual([{ channel, payload: first }]);

        listeners[1]!.dispose();
        const second = { marker: unique("after-unsubscribe") };
        await a.services.broadcastService.send({ channel, payload: second });
        await waitUntil(
          "C 在 B 退订后继续收到消息",
          async () => received.c,
          (messages) =>
            messages.some(
              (message) => (message.payload as { marker?: string }).marker === second.marker,
            ),
        );
        await observeQuietWindow();
        expect(received.b.map((message) => message.payload)).toEqual([first]);
        expect(received.a).toEqual([]);

        await b.close();
        const third = { marker: unique("after-close") };
        await c.services.broadcastService.send({ channel, payload: third });
        await waitUntil(
          "A 在 B 关闭后仍收到 C 消息",
          async () => received.a,
          (messages) =>
            messages.some(
              (message) => (message.payload as { marker?: string }).marker === third.marker,
            ),
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
