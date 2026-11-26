import { afterEach, describe, expect, it, vi } from "vitest";
import { AIREQ_THEMES, DEFAULT_AIREQ_THEME } from "@zcode/shared";
import type { WebBroadcastMessage, WebBroadcastService } from "@zcode/services";
import { createZCodeStore } from "../../packages/ui/src/store/index.js";

// AIReq 网页入口显式传入钴蓝日间，不使用通用 store 的默认动效主题。
const AIREQ_STORE_OPTIONS = { initialTheme: DEFAULT_AIREQ_THEME };

function openBrowser(saved: string | null = null) {
  const localStorage = {
    getItem: vi.fn((key: string) => (key === "zcode-theme" ? saved : null)),
    setItem: vi.fn(),
  };
  const classes = new Set<string>();
  const surfaceAttribute = "data-zcode-browser-theme-surface";
  const attributes = new Map([[surfaceAttribute, "dark"]]);
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
      surface: attributes.get(surfaceAttribute),
      classes,
    }),
  };
}

function expectRootTheme(
  browser: ReturnType<typeof openBrowser>,
  scheme: "light" | "dark",
  ...themeClasses: string[]
) {
  expect(browser.appearance()).toEqual({
    scheme,
    surface: scheme,
    classes: new Set([
      `theme-zai-${scheme}`,
      ...(scheme === "dark" ? ["dark"] : []),
      ...themeClasses,
    ]),
  });
}

function expectCobaltDay(
  store: ReturnType<typeof createZCodeStore>,
  browser: ReturnType<typeof openBrowser>,
) {
  expect(store.getState().theme).toBe("aireq-cobalt");
  expectRootTheme(browser, "light", "theme-aireq-cobalt", "theme-aireq-color");
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
  it("applies only the chosen AIReq palette and restores the default on a fresh load", () => {
    const browser = openBrowser();
    const store = createZCodeStore(connection().service, AIREQ_STORE_OPTIONS);
    expectCobaltDay(store, browser);
    for (const theme of AIREQ_THEMES) {
      store.getState().setTheme(theme);
      expect(store.getState().theme).toBe(theme);
      expectRootTheme(
        browser,
        theme === "aireq-aurora" ? "dark" : "light",
        `theme-${theme}`,
        "theme-aireq-color",
      );
    }
    expectCobaltDay(createZCodeStore(connection().service, AIREQ_STORE_OPTIONS), browser);
  });

  it.each(["light", "zai-dark", "system"])(
    "starts AIReq in Cobalt Day without reading the old browser preference %s",
    (saved) => {
      const browser = openBrowser(saved);
      const store = createZCodeStore(connection().service, AIREQ_STORE_OPTIONS);
      expectCobaltDay(store, browser);
      expect(browser.localStorage.getItem).not.toHaveBeenCalledWith("zcode-theme");
    },
  );

  it("mirrors an incoming session theme in AIReq without saving or rebroadcasting it", () => {
    const browser = openBrowser();
    const client = connection();
    const store = createZCodeStore(client.service, AIREQ_STORE_OPTIONS);
    expectCobaltDay(store, browser);
    const disconnect = store.connectBroadcastService(client.service);
    client.receiveTheme("light");
    expect(store.getState().theme).toBe("zai-light");
    expectRootTheme(browser, "light");
    expect(browser.localStorage.setItem).not.toHaveBeenCalledWith("zcode-theme", expect.anything());
    expect(client.service.send).not.toHaveBeenCalled();
    disconnect();
    expectCobaltDay(createZCodeStore(connection().service, AIREQ_STORE_OPTIONS), browser);
  });

  it.each([
    ["zai-light", "light"],
    ["zai-dark", "dark"],
    ["system", "light"],
    ["aireq-aurora", "dark", ["theme-aireq-aurora", "theme-aireq-color"]],
  ] as const)(
    "keeps AIReq's %s choice on reconnect and resets on a new load",
    (theme, scheme, themeClasses: readonly string[] = []) => {
      const browser = openBrowser("light");
      const initial = connection();
      const store = createZCodeStore(initial.service, AIREQ_STORE_OPTIONS);
      expectCobaltDay(store, browser);
      const disconnect = store.connectBroadcastService(initial.service);
      store.getState().setTheme(theme);
      expect(store.getState().theme).toBe(theme);
      expectRootTheme(browser, scheme, ...themeClasses);
      expect(initial.service.send.mock.calls).toEqual([
        [{ channel: "state:theme", payload: theme }],
      ]);
      disconnect();
      const reconnected = connection();
      const disconnectReconnected = store.connectBroadcastService(reconnected.service);
      reconnected.receiveTheme("zai-motion");
      expect(store.getState().theme).toBe(theme);
      expectRootTheme(browser, scheme, ...themeClasses);
      expect(reconnected.service.send).not.toHaveBeenCalled();
      store.getState().setTheme("aireq-violet");
      expect(store.getState().theme).toBe("aireq-violet");
      expectRootTheme(browser, "light", "theme-aireq-violet", "theme-aireq-color");
      expect(reconnected.service.send.mock.calls).toEqual([
        [{ channel: "state:theme", payload: "aireq-violet" }],
      ]);
      expect(initial.service.send).toHaveBeenCalledTimes(1);
      expect(browser.localStorage.setItem).not.toHaveBeenCalledWith(
        "zcode-theme",
        expect.anything(),
      );
      disconnectReconnected();
      expectCobaltDay(createZCodeStore(connection().service, AIREQ_STORE_OPTIONS), browser);
    },
  );
});
