import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "@zcode/shared";
import { UI_MESSAGES } from "./localeMessages.js";

/** 简易 intl 工具：根据 id 查找翻译，支持 {key} 占位符替换 */
export interface IntlInstance {
  formatMessage(descriptor: { id: string }, values?: Record<string, string | number>): string;
}

function createIntl(): IntlInstance {
  return {
    formatMessage({ id }, values) {
      let msg = UI_MESSAGES[id] ?? id;
      if (values) {
        for (const [key, val] of Object.entries(values)) {
          msg = msg.replaceAll(`{${key}}`, String(val));
        }
      }
      return msg;
    },
  };
}

interface IntlContextValue {
  intl: IntlInstance;
  /** 界面语言固定为中文；保留该字段供 X-Client-Language、扩展页面等消费方读取。 */
  locale: Locale;
  /** 单语产品里界面语言在挂载时即已确定，保留该字段供启动期副作用判断。 */
  localeResolved: true;
}

const IntlContext = createContext<IntlContextValue | null>(null);

/**
 * 国际化 Provider —— 应用 UI 只有中文一种语言。
 *
 * 不再支持语言切换、跟随系统语言、跨窗口语言广播或 setting.json 语言偏好：
 * 这些能力在单语产品里没有消费方，删掉后首屏不再加载 en/ja/ko/ru 文案表。
 * 协议层的 `Locale` 仍由 `@zcode/shared` 定义，插件/服务端数据继续使用。
 */
export function ZCodeIntlProvider({ children }: { children: ReactNode }) {
  const locale = DEFAULT_LOCALE;

  // <html lang> 供字体回退、读屏与 Web 端只拿得到 document 的平台方法使用。
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const value = useMemo<IntlContextValue>(
    () => ({ intl: createIntl(), locale, localeResolved: true }),
    [locale],
  );

  return <IntlContext value={value}>{children}</IntlContext>;
}

/** 获取 intl 上下文 */
export function useZCodeIntl(): IntlContextValue {
  const ctx = useContext(IntlContext);
  if (!ctx) {
    throw new Error("useZCodeIntl 必须在 ZCodeIntlProvider 内使用");
  }
  return ctx;
}
