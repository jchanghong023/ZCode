import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebBroadcastMessage, WebBroadcastService } from "@zcode/services";
import { createZCodeStore } from "../../packages/ui/src/store/index.js";

const html = readFileSync(new URL("../../packages/web/index.html", import.meta.url), "utf8");
function openBrowser(saved: string | null = null) {
  const localStorage = {
    getItem: vi.fn((key: string) => (key === "zcode-theme" ? saved : null)),
    setItem: vi.fn(),
  };
  const classes = new Set<string>();
  const attributes = new Map([["data-zcode-browser-theme-surface", "dark"]]);
  const root = {
    classList: {
      toggle: (name: string, enabled: boolean) => {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    style: { colorScheme: "" },
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    hasAttribute: (name: string) => attributes.has(name),
  };
  const meta = { content: "" };
  const document = { documentElement: root, querySelector: () => meta };
  const window = {
    localStorage,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
  return {
    localStorage,
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
  it("starts the browser surface in the motion theme before React loads", () => {
    const root = html.match(/<html\b[^>]*>/)?.[0];
    expect(root).toContain('class="dark theme-zai-dark theme-zai-motion"');
    expect(root).toContain('data-zcode-browser-theme-surface="dark"');
    expect(root).toContain('style="color-scheme: dark');
  });

  it.each([null, "light", "zai-dark", "system"])(
    "ignores the old browser preference %s",
    (saved) => {
      const browser = openBrowser(saved);
      const store = createZCodeStore(connection().service);
      expect(store.getState().theme).toBe("zai-motion");
      expect(browser.appearance()).toEqual({ scheme: "dark", motion: true });
      expect(browser.localStorage.getItem).not.toHaveBeenCalledWith("zcode-theme");
    },
  );

  it("mirrors a session theme without saving or rebroadcasting it", () => {
    const browser = openBrowser();
    const client = connection();
    const store = createZCodeStore(client.service);
    const disconnect = store.connectBroadcastService(client.service);
    client.receiveTheme("light");
    expect(browser.appearance()).toEqual({ scheme: "light", motion: false });
    expect(client.service.send).not.toHaveBeenCalled();
    disconnect();
    expect(createZCodeStore(connection().service).getState().theme).toBe("zai-motion");
    expect(browser.appearance()).toEqual({ scheme: "dark", motion: true });
  });

  it.each([
    ["zai-light", "light"],
    ["zai-dark", "dark"],
    ["system", "light"],
  ] as const)(
    "keeps the current page's %s choice on reconnect and resets on a new load",
    (theme, scheme) => {
      const browser = openBrowser("light");
      const initial = connection();
      const store = createZCodeStore(initial.service);
      const disconnect = store.connectBroadcastService(initial.service);
      store.getState().setTheme(theme);
      expect(browser.appearance()).toEqual({ scheme, motion: false });
      expect(browser.localStorage.setItem).not.toHaveBeenCalledWith("zcode-theme", theme);
      disconnect();
      const reconnected = connection();
      const disconnectReconnected = store.connectBroadcastService(reconnected.service);
      reconnected.receiveTheme("zai-motion");
      expect(store.getState().theme).toBe(theme);
      expect(browser.appearance()).toEqual({ scheme, motion: false });
      disconnectReconnected();
      expect(createZCodeStore(connection().service).getState().theme).toBe("zai-motion");
      expect(browser.appearance()).toEqual({ scheme: "dark", motion: true });
    },
  );
});
