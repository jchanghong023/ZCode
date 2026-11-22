/**
 * 快捷键执行内核 —— 匹配、录制、生效表与冲突检测的唯一实现。
 *
 * - 键位知识（格式解析、平台修饰键语义、保留键）只允许存在于此模块与 shared/shortcutCommands.ts；
 * - 全部为纯函数，DOM 事件以结构化参数传入，便于单测覆盖组合键边界；
 * - IME 组合中（isComposing / Process / Dead / keyCode 229）与长按 repeat 一律不匹配、不录制。
 */
import {
  type ParsedShortcutBinding,
  type ShortcutCommandId,
  parseShortcutBinding,
  SHORTCUT_COMMANDS,
} from "@zcode/shared";
import {
  isAppleKeyboardPlatform,
  type KeyboardShortcutPlatformInfo,
} from "@/lib/keyboardShortcuts.js";
import { logger } from "@/logger.js";

/** 匹配/录制所需的键盘事件结构（KeyboardEvent 的子集，测试可构造）。 */
export interface ShortcutBindingEvent {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  /** 兼容旧事件模型；中文等 IME 组合中 Chromium 报 keyCode 229。 */
  keyCode?: number;
}

// ============================================================================
// 噪声过滤（IME / 长按）
// ============================================================================

/** 判断事件是否为 IME 组合态事件（isComposing / Process / Dead / keyCode 229）。 */
function isImeEvent(event: ShortcutBindingEvent): boolean {
  return (
    event.isComposing === true ||
    event.key === "Process" ||
    event.key === "Dead" ||
    event.keyCode === 229
  );
}

/** 判断事件是否为不应触发快捷键的噪声：长按 repeat、IME 组合中、死键。 */
export function isShortcutEventNoise(event: ShortcutBindingEvent): boolean {
  return event.repeat === true || isImeEvent(event);
}

// ============================================================================
// event.code → 规范键名映射（键盘布局差异下的可靠来源）
// ============================================================================

const CODE_TO_KEY: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, index) => [
      `Key${String.fromCharCode(65 + index)}`,
      String.fromCharCode(97 + index),
    ]),
  ),
  ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`Digit${index}`, String(index)])),
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [`F${index + 1}`, `F${index + 1}`]),
  ),
  BracketLeft: "[",
  BracketRight: "]",
  Equal: "=",
  Minus: "-",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Backslash: "\\",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  // Enter 供 composer 作用域命令录制/匹配；NumpadEnter 不映射（保持未定义行为）
  Enter: "Enter",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Delete: "Delete",
  Insert: "Insert",
};

/** 规范键名 → 期望的 event.code（现有 keyboardShortcuts.getExpectedShortcutCode 的扩展版）。 */
const KEY_TO_CODE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(CODE_TO_KEY).map(([code, key]) => [key, code]),
);

// ============================================================================
// 通用匹配器
// ============================================================================

/**
 * 通用匹配：binding（规范序列化串）与键盘事件是否命中。
 *
 * 修饰键为精确匹配：事件实际按下的修饰键必须与 binding 声明完全一致，
 * 多余修饰键（如 Cmd+Ctrl+K 命中 CmdOrCtrl+K）不算命中。
 * - CmdOrCtrl：macOS = meta 且无 ctrl；Windows/Linux = ctrl 且无 meta（平台隔离沿用 keyboardShortcuts.ts）；
 * - Ctrl：显式 Ctrl；在 Windows/Linux 上与 CmdOrCtrl 同义（录制在这些平台只会产出 CmdOrCtrl）；
 * - AltGr：Windows/Linux 上物理 AltGr 被 Chromium 报为 ctrl+alt 同按。
 */
export function matchesShortcutBinding(
  event: ShortcutBindingEvent,
  binding: string,
  platformInfo?: KeyboardShortcutPlatformInfo,
): boolean {
  if (isShortcutEventNoise(event)) {
    return false;
  }
  const parsed = parseShortcutBinding(binding);
  if (parsed === null) {
    return false;
  }

  const isApple = isAppleKeyboardPlatform(platformInfo);
  if (!modifiersMatch(event, parsed, isApple)) {
    return false;
  }
  return eventMatchesKey(event, parsed.key);
}

function modifiersMatch(
  event: ShortcutBindingEvent,
  parsed: ParsedShortcutBinding,
  isApple: boolean,
): boolean {
  const { metaKey: meta, ctrlKey: ctrl, altKey: alt, shiftKey: shift } = event;

  // AltGr 与 Ctrl+Alt 物理不可区分（Windows/Linux 的 Ctrl+Alt+B 等现有绑定就是同按），
  // 因此 AltGr 绑定与 cmdOrCtrl/ctrl + Alt 绑定匹配同一物理组合，不做独占判定。
  const wantPrimaryOrCtrl = parsed.altGr || parsed.cmdOrCtrl || (!isApple && parsed.ctrl);
  const wantCtrl = !parsed.altGr && !parsed.cmdOrCtrl && parsed.ctrl && isApple;
  const wantAlt = parsed.altGr || parsed.alt;

  // 裸键绑定（Enter/F5/方向键等无主修饰键）必须要求主修饰键抬起，
  // 否则 Cmd+Enter 会误命中裸 Enter 绑定——命令表全带主修饰键时该缺口潜伏，Enter 入表后致命。
  if (!wantPrimaryOrCtrl && !wantCtrl && (meta || ctrl)) {
    return false;
  }

  if (wantPrimaryOrCtrl) {
    const ok = isApple ? meta && !ctrl : ctrl && !meta;
    if (!ok) {
      return false;
    }
  }
  if (wantCtrl) {
    // macOS 显式 Ctrl（系统 Emacs 编辑保留区，用户显式绑定才生效）。
    if (!ctrl || meta) {
      return false;
    }
  }
  if (wantAlt !== alt) {
    return false;
  }
  return parsed.shift === shift;
}

/** 键匹配：event.key 小写比较优先，event.code 兜底（macOS Option 改写、非 US 布局）。 */
function eventMatchesKey(event: Pick<ShortcutBindingEvent, "key" | "code">, key: string): boolean {
  if (event.key === key) {
    return true;
  }
  if (event.key.length === 1 && event.key.toLowerCase() === key) {
    return true;
  }
  if (event.code !== undefined) {
    return KEY_TO_CODE[key] === event.code;
  }
  return false;
}

// ============================================================================
// 录制器
// ============================================================================

// ============================================================================
// 录制态抑制
// ============================================================================

let shortcutRecordingActive = false;

export function isShortcutRecordingActive(): boolean {
  return shortcutRecordingActive;
}

// ============================================================================
// 生效表
// ============================================================================

export type EffectiveShortcutBindings = Readonly<Record<ShortcutCommandId, readonly string[]>>;

/**
 * 计算生效表：命令表默认绑定 + 用户覆盖（整组替换）。
 * 显式空数组 = 用户清除为「未设置」（生效表为空，不回退默认——抢绑会把被抢命令清到这个状态）；
 * 全部条目非法时回退默认（手改 setting.json 写入非法条目不得让快捷键整体失效）。
 */
export function resolveEffectiveShortcutBindings(
  overrides?: Record<string, readonly string[]>,
): EffectiveShortcutBindings {
  const effective: Record<ShortcutCommandId, readonly string[]> = {} as Record<
    ShortcutCommandId,
    readonly string[]
  >;
  for (const entry of SHORTCUT_COMMANDS) {
    const override = overrides?.[entry.id];
    if (override === undefined) {
      effective[entry.id] = entry.defaultBindings;
      continue;
    }
    const valid = override.filter((binding) => parseShortcutBinding(binding) !== null);
    if (override.length > 0 && valid.length === 0) {
      logger.warn("[shortcuts] 覆盖绑定全部非法，回退默认", { commandId: entry.id, override });
      effective[entry.id] = entry.defaultBindings;
      continue;
    }
    if (valid.length !== override.length) {
      logger.warn("[shortcuts] 忽略非法覆盖条目", { commandId: entry.id, override });
    }
    effective[entry.id] = valid;
  }
  return effective;
}
