import { afterEach, describe, expect, it, vi } from "vitest";
import { AIREQ_THEMES, appSettingsPatchSchema, appSettingsSchema, DEFAULT_AIREQ_THEME } from "@zcode/shared";
import type { WebBroadcastMessage, WebBroadcastService } from "@zcode/services";
import { createZCodeStore } from "../../packages/ui/src/store/index.js";

// AIReq 网页入口显式传入钴蓝日间，不使用通用 store 的默认动效主题。
const AIREQ_STORE_OPTIONS = {
  initialTheme: DEFAULT_AIREQ_THEME,
  allowedThemes: AIREQ_THEMES,
};

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
  expectRootTheme(browser, "light", "theme-aireq-cobalt");
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
        theme === "zai-motion" ? "dark" : "light",
        `theme-${theme}`,
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
    client.receiveTheme("zai-motion");
    expect(store.getState().theme).toBe("zai-motion");
    expectRootTheme(browser, "dark", "theme-zai-motion");
    expect(browser.localStorage.setItem).not.toHaveBeenCalledWith("zcode-theme", expect.anything());
    expect(client.service.send).not.toHaveBeenCalled();
    disconnect();
    expectCobaltDay(createZCodeStore(connection().service, AIREQ_STORE_OPTIONS), browser);
  });

  it("ignores themes outside AIReq in local updates and incoming broadcasts", () => {
    const browser = openBrowser();
    const client = connection();
    const store = createZCodeStore(client.service, AIREQ_STORE_OPTIONS);
    const disconnect = store.connectBroadcastService(client.service);

    store.getState().setTheme("zai-dark");
    for (const theme of ["light", "system", "aireq-aurora"]) client.receiveTheme(theme);

    expectCobaltDay(store, browser);
    expect(client.service.send).not.toHaveBeenCalled();
    disconnect();
  });

  it.each(["aireq-slate", "aireq-violet", "aireq-aurora"])(
    "restores other settings when the saved theme %s has been removed",
    (theme) => {
      expect(appSettingsSchema.parse({ theme, uiFontSizePx: 18 })).toMatchObject({
        theme: DEFAULT_AIREQ_THEME,
        uiFontSizePx: 18,
      });
      expect(appSettingsPatchSchema.safeParse({ theme }).success).toBe(false);
    },
  );

  it.each([
    ["zai-motion", "dark", "aireq-cobalt", "light"],
    ["aireq-cobalt", "light", "zai-motion", "dark"],
  ] as const)(
    "keeps AIReq's %s choice on reconnect and resets on a new load",
    (theme, scheme, otherTheme, otherScheme) => {
      const browser = openBrowser("light");
      const initial = connection();
      const store = createZCodeStore(initial.service, AIREQ_STORE_OPTIONS);
      expectCobaltDay(store, browser);
      const disconnect = store.connectBroadcastService(initial.service);
      initial.receiveTheme(otherTheme);
      store.getState().setTheme(theme);
      expect(store.getState().theme).toBe(theme);
      expectRootTheme(browser, scheme, `theme-${theme}`);
      expect(initial.service.send.mock.calls).toEqual([
        [{ channel: "state:theme", payload: theme }],
      ]);
      disconnect();
      const reconnected = connection();
      const disconnectReconnected = store.connectBroadcastService(reconnected.service);
      reconnected.receiveTheme(otherTheme);
      expect(store.getState().theme).toBe(theme);
      expectRootTheme(browser, scheme, `theme-${theme}`);
      expect(reconnected.service.send).not.toHaveBeenCalled();
      store.getState().setTheme(otherTheme);
      expect(store.getState().theme).toBe(otherTheme);
      expectRootTheme(browser, otherScheme, `theme-${otherTheme}`);
      expect(reconnected.service.send.mock.calls).toEqual([
        [{ channel: "state:theme", payload: otherTheme }],
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
