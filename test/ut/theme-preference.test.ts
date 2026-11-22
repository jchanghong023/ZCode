import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebBroadcastMessage, WebBroadcastService } from "@zcode/services";
import { createZCodeStore } from "../../packages/ui/src/store/index.js";

const html = readFileSync(new URL("../../packages/web/index.html", import.meta.url), "utf8");
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!bootstrap) throw new Error("Theme bootstrap script is missing");

function openBrowser(saved: string | null, systemDark = false, storageBlocked = false) {
  const preferences = new Map(saved === null ? [] : [["zcode-theme", saved]]);
  const localStorage = {
    getItem(key: string) {
      if (storageBlocked) throw new Error("Storage blocked");
      return preferences.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (storageBlocked) throw new Error("Storage blocked");
      preferences.set(key, value);
    },
  };
  const classes = new Set<string>();
  const attributes = new Map<string, string>();
  const root = {
    classList: {
      add: (name: string) => classes.add(name),
      toggle: (name: string, enabled: boolean) => {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    style: { colorScheme: "" },
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    hasAttribute: (name: string) => attributes.has(name),
  };
  const meta = {
    content: "",
    setAttribute: (_name: string, value: string) => (meta.content = value),
  };
  const document = { documentElement: root, querySelector: () => meta };
  const window = {
    localStorage,
    matchMedia: () => ({ matches: systemDark, addEventListener() {}, removeEventListener() {} }),
  };
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
  return {
    paint() {
      classes.clear();
      runInNewContext(bootstrap!, { window, document, localStorage });
    },
    appearance: () => ({
      scheme: root.style.colorScheme,
      motion: classes.has("theme-zai-motion"),
    }),
  };
}

function connection() {
  const listeners = new Set<(message: WebBroadcastMessage) => void>();
  const service = {
    onMessage(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    send: vi.fn(async (_message: WebBroadcastMessage) => {}),
  } satisfies WebBroadcastService;
  return {
    service,
    receiveTheme: (payload: string) =>
      listeners.forEach((listener) => listener({ channel: "state:theme", payload })),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("browser theme preference", () => {
  it.each([
    [null, false, "zai-motion", "dark"],
    ["invalid", false, "zai-motion", "dark"],
    ["zai-motion", false, "zai-motion", "dark"],
    ["light", true, "zai-light", "light"],
    ["zai-light", true, "zai-light", "light"],
    ["dark", false, "zai-dark", "dark"],
    ["zai-dark", false, "zai-dark", "dark"],
    ["system", false, "system", "light"],
    ["system", true, "system", "dark"],
  ] as const)(
    "keeps first paint and the workspace in agreement for %s (system dark: %s)",
    (saved, systemDark, preference, scheme) => {
      const browser = openBrowser(saved, systemDark);
      const expected = { scheme, motion: preference === "zai-motion" };
      browser.paint();
      expect(browser.appearance()).toEqual(expected);
      const store = createZCodeStore(connection().service);
      expect(store.getState().theme).toBe(preference);
      expect(browser.appearance()).toEqual(expected);
    },
  );

  it("mirrors a session theme without saving or rebroadcasting it", () => {
    const browser = openBrowser(null);
    browser.paint();
    const client = connection();
    const store = createZCodeStore(client.service);
    const disconnect = store.connectBroadcastService(client.service);
    client.receiveTheme("light");
    expect(browser.appearance()).toEqual({ scheme: "light", motion: false });
    expect(client.service.send).not.toHaveBeenCalled();
    disconnect();
    browser.paint();
    expect(browser.appearance()).toEqual({ scheme: "dark", motion: true });
  });

  it.each([false, true])(
    "keeps a local choice on reconnect when storage is blocked: %s",
    (blocked) => {
      const browser = openBrowser(null, false, blocked);
      browser.paint();
      expect(browser.appearance()).toEqual({ scheme: "dark", motion: true });
      const initial = connection();
      const store = createZCodeStore(initial.service);
      const disconnect = store.connectBroadcastService(initial.service);
      store.getState().setTheme("zai-light");
      expect(browser.appearance()).toEqual({ scheme: "light", motion: false });
      disconnect();
      const reconnected = connection();
      const disconnectReconnected = store.connectBroadcastService(reconnected.service);
      reconnected.receiveTheme("zai-dark");
      expect(browser.appearance()).toEqual({ scheme: "light", motion: false });
      disconnectReconnected();
      browser.paint();
      expect(browser.appearance()).toEqual({
        scheme: blocked ? "dark" : "light",
        motion: blocked,
      });
    },
  );
});
