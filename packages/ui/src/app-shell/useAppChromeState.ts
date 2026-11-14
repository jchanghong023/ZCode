import { useRef } from "react";

const MACOS_WINDOW_CONTROLS_DEFAULT_LEFT_PADDING_PX = 96;
const WINDOWS_WINDOW_CONTROLS_DEFAULT_RIGHT_PADDING_PX = 136;

/**
 * 浏览器没有原生窗口外壳：全屏、最大化、标题栏安全区都不可观察。
 * 这里只交付固定默认值，让保留的桌面/移动布局按普通浏览器窗口渲染。
 */
export function useAppChromeState({
  isDesktop: _isDesktop,
  isMacDesktop: _isMacDesktop,
  isWindowsDesktop: _isWindowsDesktop,
  platform: _platform,
}: {
  isDesktop?: boolean;
  isMacDesktop?: boolean;
  isWindowsDesktop?: boolean;
  platform?: unknown;
}) {
  const sidebarContainerRef = useRef<HTMLElement | null>(null);
  return {
    isMacFullscreen: false,
    desktopWindowChromeState: null,
    macWindowControlsLeftPaddingPx: MACOS_WINDOW_CONTROLS_DEFAULT_LEFT_PADDING_PX,
    windowsWindowControlsRightPaddingPx: WINDOWS_WINDOW_CONTROLS_DEFAULT_RIGHT_PADDING_PX,
    sidebarContainerRef,
  };
}
