import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { DesktopWindowFrame } from "@/DesktopWindowFrame.js";
import { WindowsTopLeftLogo } from "@/WindowsTopLeftLogo.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import type { BundledTheme } from "shiki";
import { CodeBlock } from "@/components/ai-elements/code-block.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { CODE_PREVIEW_THEME_OPTIONS, SETTINGS_PREVIEW_CODE } from "@/lib/codePreviewPreferences.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { cn } from "@/components/lib/utils.js";
import { useSettingsSearchTarget, type SettingsSearchId } from "@/settings-search/contract.js";

/**
 * Settings 与同级管理页在窗口框架内共享同一内容列。
 * Automations 曾在 shell 与页面内各自居中、加 padding，导致它与 Skills 等
 * Settings 功能的标题起点、顶部基线和内容宽度不一致。
 */
export const SETTINGS_FRAME_CONTENT_CLASSNAME =
  "mx-auto w-full max-w-4xl px-4 pb-8 pt-0 lg:px-8 lg:pb-10";

export function ThemeSelect({
  value,
  onValueChange,
}: {
  value: BundledTheme;
  onValueChange: (value: BundledTheme) => void;
}) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as BundledTheme)}>
      <SelectTrigger size="lg" className="w-64 min-w-0 justify-between">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CODE_PREVIEW_THEME_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ThemePreviewCard({
  mode,
  title,
  themeName,
  theme,
  isActive,
  showLineNumbers,
  wrapLongLines,
  fontSizePx,
}: {
  mode: "light" | "dark";
  title: string;
  themeName: string;
  theme: BundledTheme;
  isActive: boolean;
  showLineNumbers: boolean;
  wrapLongLines: boolean;
  fontSizePx: number;
}) {
  const { intl } = useZCodeIntl();
  const previewSurfaceClassName = mode === "light" ? "ring-1 ring-black/5" : "ring-1 ring-white/8";
  const previewThemeStyle = {
    "--color-background": mode === "light" ? "#f8f8f8" : "#161616",
    "--color-card": mode === "light" ? "#f8f8f8" : "#161616",
    "--color-foreground": mode === "light" ? "#0d0d0d" : "#ffffff",
  } as CSSProperties;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="text-ui-base font-semibold text-foreground">{title}</div>
          <div className="text-ui-base text-foreground-subtle">{themeName}</div>
        </div>
        <span
          className={`rounded-md px-2.5 py-1 text-ui-xs font-medium ${
            isActive ? "bg-selected text-foreground" : "bg-surface text-foreground-subtle"
          }`}
        >
          {intl.formatMessage({
            id: isActive ? "settings.previewBadge.active" : `settings.previewBadge.${mode}`,
          })}
        </span>
      </div>
      <div className="p-2">
        <CodeBlock
          code={SETTINGS_PREVIEW_CODE}
          language="json"
          theme={theme}
          showLineNumbers={showLineNumbers}
          wrapLongLines={wrapLongLines}
          fontSizePx={fontSizePx}
          // Light/Dark Preview 是预览目标主题，不应继承当前应用主题的 background token。
          // CodeBlock 内部会把 @pierre/diffs 背景映射到 card，这里同时固定 background/card。
          className={`overflow-hidden border-0 bg-background ${previewSurfaceClassName}`}
          style={previewThemeStyle}
        />
      </div>
    </div>
  );
}

export function SettingsRow({
  searchId,
  label,
  description,
  control,
  detail,
  controlLayout = "default",
}: {
  searchId?: SettingsSearchId;
  label: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  detail?: ReactNode;
  controlLayout?: "default" | "wide";
}) {
  const { ref, highlighted } = useSettingsSearchTarget(searchId);
  return (
    <div
      ref={ref}
      tabIndex={searchId ? -1 : undefined}
      data-settings-search-id={searchId}
      data-settings-search-highlighted={highlighted || undefined}
      className={cn(
        "border-t border-border px-4 py-3 first:border-t-0",
        highlighted && "bg-accent ring-1 ring-inset ring-input-border-focused",
      )}
    >
      {/* 手机窄屏下固定 192px 控件列会把文字压到约 60px 宽。compact-web 下改为可换行 flex：
          文字列至少 10rem 且优先占满；控件放不下时整体换到文字下方。桌面与宽屏 Web 仍用原 grid。
          spec：docs/settings-narrow-layout.md */}
      <div
        className={cn(
          "grid items-center gap-4",
          controlLayout === "wide"
            ? "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_280px]"
            : "grid-cols-[minmax(0,1fr)_192px] compact-web:flex compact-web:flex-wrap compact-web:gap-x-4 compact-web:gap-y-3",
        )}
      >
        <div
          className={cn("min-w-0", controlLayout !== "wide" && "compact-web:flex-[999_1_10rem]")}
        >
          <div className="text-ui-base font-medium text-foreground">{label}</div>
          {description ? (
            <div className="mt-1 text-ui-base leading-6 text-foreground-subtle">{description}</div>
          ) : null}
        </div>
        <div
          className={cn(
            "flex w-full flex-nowrap items-center justify-end gap-2",
            controlLayout !== "wide" &&
              "compact-web:w-auto compact-web:max-w-full compact-web:flex-auto",
          )}
        >
          {controlLayout === "wide" ? detail : null}
          {control}
        </div>
      </div>
      {detail && controlLayout !== "wide" ? <div className="mt-3">{detail}</div> : null}
    </div>
  );
}

export function SettingsGroupCard({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-hidden rounded-xl border border-border bg-card py-0 shadow-none">
      <CardContent className="space-y-0 px-0">{children}</CardContent>
    </Card>
  );
}

export function SettingsBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-surface px-2.5 py-1 text-ui-base font-medium text-foreground-subtle">
      {children}
    </span>
  );
}

export function SettingsRangeControl({
  value,
  min,
  max,
  step,
  onChange,
  valueLabel,
  valueLabelClassName,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  valueLabel: ReactNode;
  valueLabelClassName?: string;
}) {
  return (
    <div className="flex w-[280px] min-w-0 items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
      />
      <span
        className={cn(
          "min-w-10 text-right text-ui-base font-medium tabular-nums text-foreground",
          valueLabelClassName,
        )}
      >
        {valueLabel}
      </span>
    </div>
  );
}

export function getThemeOptionLabel(value: BundledTheme): string {
  return CODE_PREVIEW_THEME_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function SettingsSidebarButton({
  icon: Icon,
  label,
  active,
  children,
  className,
  ...buttonProps
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  children?: ReactNode;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <ControlHintTooltip title={label} side="right" align="center">
      <button
        {...buttonProps}
        type={buttonProps.type ?? "button"}
        aria-label={label}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-xl px-2.5 text-left transition-colors",
          "max-lg:mx-auto max-lg:size-10 max-lg:justify-center max-lg:px-0",
          "compact-web:mx-0 compact-web:h-8 compact-web:w-auto compact-web:shrink-0 compact-web:px-2.5",
          active
            ? "bg-surface-hover text-foreground"
            : "text-remote-foreground-muted hover:bg-surface-hover hover:text-foreground",
          className,
        )}
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-current">
          <Icon className="size-4 text-foreground" />
        </span>
        <span className="min-w-0 flex-1 max-lg:sr-only compact-web:not-sr-only">
          {children ?? <span className="truncate text-ui-base text-foreground">{label}</span>}
        </span>
      </button>
    </ControlHintTooltip>
  );
}

/** 原生设置与业务设置共用窗口几何；行为和数据仍由各自调用方持有。 */
export function SettingsPageFrame({
  title,
  isDesktop,
  isMacDesktop,
  isWindowsDesktop,
  rootProps,
  backButton,
  search,
  navigation,
  navigationRef,
  navigationLabel,
  footer,
  help,
  header,
  children,
}: {
  title: string;
  isDesktop?: boolean;
  isMacDesktop?: boolean;
  isWindowsDesktop?: boolean;
  rootProps?: HTMLAttributes<HTMLDivElement> & {
    "data-testid"?: string;
    "data-active-section"?: string;
  };
  backButton?: ReactNode;
  search?: ReactNode;
  navigation: ReactNode;
  navigationRef?: Ref<HTMLElement>;
  navigationLabel: string;
  footer: ReactNode;
  help: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DesktopWindowFrame
      title={title}
      isDesktop={isDesktop}
      isMacDesktop={isMacDesktop}
      isWindowsDesktop={isWindowsDesktop}
    >
      <div
        {...rootProps}
        // 隐式 auto 行会按 Memory viewer 的内容高度撑出窗口，随后被 DesktopWindowFrame 裁切且没有滚动条。
        // 固定为单个 minmax(0, 1fr) 行，让普通设置页和内部滚动 viewer 都以窗口剩余高度为边界。
        className="relative grid h-screen min-h-full w-full grid-cols-[68px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] lg:grid-cols-[268px_minmax(0,1fr)] compact-web:grid-cols-1 compact-web:grid-rows-[auto_minmax(0,1fr)]"
      >
        {isWindowsDesktop ? <WindowsTopLeftLogo /> : null}

        {/* 手机窄屏 Web 下 68px 图标栏会挤占内容宽度，compact-web 下改成顶部横向滚动导航条。
              spec：docs/settings-narrow-layout.md */}
        <aside className="min-w-0">
          <div className="flex h-full flex-col compact-web:flex-row compact-web:items-center">
            <div className="h-12 [app-region:drag] compact-web:hidden"></div>
            <div className="px-2 pb-3 pt-3 compact-web:shrink-0 compact-web:py-1.5 compact-web:pr-0">
              {backButton}
            </div>

            {search ? (
              <div className="px-3 pb-3 max-lg:flex max-lg:justify-center compact-web:shrink-0 compact-web:px-1 compact-web:pb-0">
                {search}
              </div>
            ) : null}

            <nav
              ref={navigationRef}
              aria-label={navigationLabel}
              className="flex-1 overflow-y-auto px-2 pb-3 compact-web:min-w-0 compact-web:overflow-x-auto compact-web:overflow-y-hidden compact-web:py-1.5"
            >
              {navigation}
            </nav>

            <div>{footer}</div>
          </div>
        </aside>

        <section
          data-settings-content-frame="true"
          className={cn(
            "flex min-h-0 flex-col",
            // 桌面平台统一复用主工作区的面板 inset；左侧仍与导航相接，顶部由独立拖拽留白承接。
            isDesktop ? (isWindowsDesktop ? "pr-1.5 pb-1.5" : "pr-1 pb-1") : "p-0",
          )}
        >
          <div
            data-settings-top-inset={isDesktop ? "true" : undefined}
            // 下方面板使用 h-full；顶部留白不能参与 flex 收缩，否则 6px 会变成小数像素。
            className={cn(
              "shrink-0 [app-region:drag]",
              isDesktop && (isWindowsDesktop ? "h-1.5" : "h-1"),
              isMacDesktop && "max-lg:h-16",
            )}
          />
          <div
            data-settings-panel-frame="true"
            className={cn(
              "relative flex flex-col min-h-0 h-full border border-border bg-background",
              // 直接写像素圆角会绕过设计 token；设置页与工作区统一复用 rounded-md（默认 6px）。
              isWindowsDesktop ? "rounded-md" : "rounded-xl",
            )}
          >
            <div className="absolute top-0 z-50 h-10 w-10 pointer-events-auto [app-region:no-drag] right-0">
              <div className="absolute right-2.5 top-2.5 pointer-events-auto [app-region:no-drag]">
                {help}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-12 shrink-0">
                <div className="min-w-0 flex-1 [app-region:drag] mr-12">{header}</div>
              </div>
              {children}
            </div>
          </div>
        </section>
      </div>
    </DesktopWindowFrame>
  );
}
