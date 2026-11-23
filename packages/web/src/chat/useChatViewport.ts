import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

const compactQuery = "(max-width: 767px)";

function subscribe(listener: () => void) {
  const query = window.matchMedia(compactQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function getSnapshot() {
  return window.matchMedia(compactQuery).matches;
}

export function useChatViewport() {
  const compact = useSyncExternalStore(subscribe, getSnapshot);
  const shellRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const viewport = window.visualViewport;
    if (!compact || !shell || !viewport) return;

    const clearViewport = () => {
      shell.style.removeProperty("--chat-viewport-height");
      shell.style.removeProperty("--chat-viewport-top");
    };

    const updateViewport = () => {
      // Safari 弹出键盘只缩小视觉视口；聊天外壳跟随它，避免底栏留在键盘下。
      if (viewport.scale !== 1) {
        clearViewport();
        return;
      }
      shell.style.setProperty("--chat-viewport-height", `${viewport.height}px`);
      shell.style.setProperty("--chat-viewport-top", `${viewport.offsetTop}px`);
    };

    updateViewport();
    viewport.addEventListener("resize", updateViewport);
    viewport.addEventListener("scroll", updateViewport);
    return () => {
      viewport.removeEventListener("resize", updateViewport);
      viewport.removeEventListener("scroll", updateViewport);
      clearViewport();
    };
  }, [compact]);

  return { compact, shellRef };
}
