import { useEffect, type RefObject } from "react";
import { useZCodeStore } from "@/store/StoreProvider.js";
import "./motion-theme.css";

const CONTENT = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable]",
  "[role=button]",
  "[role=dialog]",
  "[role=menu]",
  "[role=listbox]",
  "[inert]",
  "table",
  "pre",
  "article",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "span",
  "li",
  "dt",
  "dd",
  "img",
  "svg",
  "canvas",
  ".bg-card",
  ".bg-surface",
  "[data-slot=card]",
  "[data-settings-search-id]",
].join(",");
const SURFACE = "main, [data-settings-panel-frame=true], [data-aireq-motion-main]";

/** 只持有可丢弃的视觉节点；坐标不进入 React、主题广播或业务状态。 */
function attachMotion(root: HTMLDivElement): () => void {
  const controller = new AbortController();
  const options = { signal: controller.signal, passive: true };
  const aura = document.createElement("div");
  aura.className = "aireq-motion-aura";
  aura.setAttribute("aria-hidden", "true");
  const highlight = document.createElement("div");
  highlight.className = "aireq-motion-nav-highlight";
  highlight.setAttribute("aria-hidden", "true");
  let surface: HTMLElement | null = null;
  let nav: HTMLElement | null = null;
  let navButton: HTMLElement | null = null;
  let navAnimation: Animation | null = null;
  let lastMove = -Infinity;
  let press: { button: HTMLElement; node: HTMLElement; animation: Animation } | null = null;

  const hideAura = () => {
    aura.style.opacity = "0";
  };
  const hideNavigation = () => {
    highlight.style.opacity = "0";
    navButton = null;
    navAnimation?.cancel();
    navAnimation = null;
  };
  const clearPress = () => {
    if (!press) return;
    press.animation.onfinish = null;
    press.animation.cancel();
    press.node.remove();
    press.button.classList.remove("aireq-motion-press-host");
    press = null;
  };
  const hide = () => {
    hideAura();
    hideNavigation();
    clearPress();
  };

  const moveAura = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.timeStamp - lastMove < 50) return;
    lastMove = event.timeStamp;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest(CONTENT)) {
      hideAura();
      return;
    }
    const nextSurface = target.closest<HTMLElement>(SURFACE);
    if (!nextSurface || !root.contains(nextSurface)) {
      hideAura();
      return;
    }
    // 绝对定位的装饰必须留在现有滚动范围内，不能因鼠标靠边产生新滚动条。
    const bounds = nextSurface.getBoundingClientRect();
    const width = nextSurface.clientWidth;
    const height = nextSurface.clientHeight;
    const scrollHeight = nextSurface.scrollHeight;
    // stable_both-edges 的左滚动槽计入 clientLeft，扣除后柔光中心才与指针重合。
    const x = Math.max(
      0,
      Math.min(event.clientX - bounds.left - nextSurface.clientLeft - 120, width - 240),
    );
    const y = Math.max(
      0,
      Math.min(
        event.clientY - bounds.top - nextSurface.clientTop + nextSurface.scrollTop - 120,
        scrollHeight - Math.min(240, height),
      ),
    );
    if (surface !== nextSurface) {
      surface?.classList.remove("aireq-motion-surface");
      surface = nextSurface;
      surface.classList.add("aireq-motion-surface");
      surface.append(aura);
    }
    aura.style.transform = `translate(${x}px, ${y}px)`;
    aura.style.opacity = "1";
  };

  const enter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    // 进入正文或控件就撤下柔光，不等下一次 20Hz 坐标采样。
    if (target.closest(CONTENT)) hideAura();
    const button = target.closest<HTMLElement>("[data-aireq-motion-nav]");
    if (!button) {
      hideNavigation();
      return;
    }
    if (button === navButton) return;
    const nextNav = button.closest("nav");
    if (!nextNav) return;
    const previous = navButton ? highlight.getBoundingClientRect() : null;
    const bounds = button.getBoundingClientRect();
    const parent = nextNav.getBoundingClientRect();
    navAnimation?.cancel();
    if (nav !== nextNav) {
      nav?.classList.remove("aireq-motion-navigation");
      nav = nextNav;
      nav.classList.add("aireq-motion-navigation");
      nav.append(highlight);
    }
    navButton = button;
    const x = bounds.left - parent.left;
    const y = bounds.top - parent.top;
    highlight.style.width = `${bounds.width}px`;
    highlight.style.height = `${bounds.height}px`;
    highlight.style.transform = `translate(${x}px, ${y}px)`;
    highlight.style.opacity = "1";
    if (previous) {
      navAnimation = highlight.animate(
        [
          {
            transform: `translate(${previous.left - parent.left}px, ${previous.top - parent.top}px)`,
          },
          { transform: `translate(${x}px, ${y}px)` },
        ],
        { duration: 230, easing: "cubic-bezier(.16,1,.3,1)" },
      );
      navAnimation.onfinish = () => {
        navAnimation = null;
      };
    }
  };

  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button:not(:disabled)");
    if (!button || button.closest("[inert], [aria-disabled=true]")) return;
    const bounds = button.getBoundingClientRect();
    clearPress();
    const node = document.createElement("span");
    node.className = "aireq-motion-press";
    node.setAttribute("aria-hidden", "true");
    node.style.left = `${event.clientX - bounds.left}px`;
    node.style.top = `${event.clientY - bounds.top}px`;
    button.classList.add("aireq-motion-press-host");
    button.append(node);
    const animation = node.animate(
      [
        { transform: "scale(.15)", opacity: 0.18 },
        { transform: "scale(1)", opacity: 0 },
      ],
      { duration: 340, easing: "cubic-bezier(.16,1,.3,1)" },
    );
    press = { button, node, animation };
    animation.onfinish = clearPress;
  };

  root.setAttribute("data-aireq-motion-active", "");
  root.addEventListener("pointermove", moveAura, options);
  root.addEventListener("pointerover", enter, options);
  root.addEventListener("pointerdown", down, options);
  root.addEventListener("pointerleave", hide, options);
  root.addEventListener("pointercancel", hide, options);
  root.addEventListener("scroll", hide, { ...options, capture: true });
  window.addEventListener("blur", hide, options);
  return () => {
    controller.abort();
    hide();
    aura.remove();
    highlight.remove();
    surface?.classList.remove("aireq-motion-surface");
    nav?.classList.remove("aireq-motion-navigation");
    root.removeAttribute("data-aireq-motion-active");
  };
}

export function AIReqMotion({ rootRef }: { rootRef: RefObject<HTMLDivElement | null> }) {
  const enabled = useZCodeStore((state) => state.theme === "zai-motion" && !state.performanceMode);
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let release = () => {};
    const sync = () => {
      release();
      release = reducedMotion.matches || document.hidden ? () => {} : attachMotion(root);
    };
    sync();
    reducedMotion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      reducedMotion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      release();
    };
  }, [enabled, rootRef]);
  return null;
}
