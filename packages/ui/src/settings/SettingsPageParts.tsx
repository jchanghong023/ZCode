import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { WebPageFrame } from "@/WebPageFrame.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import type { BundledTheme } from "shiki";
import { CodeBlock } from "@/components/ai-elements/code-block.js";
import { Card, CardContent } from "@/components/ui/card.js";
import {
  CODE_PREVIEW_THEME_OPTIONS,
  isDarkCodePreviewTheme,
  SETTINGS_PREVIEW_CODE,
} from "@/lib/codePreviewPreferences.js";
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
  ariaLabel,
}: {
  value: BundledTheme;
  onValueChange: (value: BundledTheme) => void;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as BundledTheme)}>
      <SelectTrigger size="lg" className="w-64 min-w-0 justify-between" aria-label={ariaLabel}>
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
  // mode 决定卡片属于哪个设置槽，预览内容的背景与边框则跟随实际选择的代码主题。
  const isDarkPreview = isDarkCodePreviewTheme(theme);
  const previewSurface = isDarkPreview
    ? "var(--zai-dark-background)"
    : "var(--zai-light-background)";

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
          className={cn(
            "overflow-hidden border-0 bg-background ring-1",
            isDarkPreview ? "ring-white/8" : "ring-black/5",
          )}
          style={
            {
              "--color-background": previewSurface,
              "--color-card": previewSurface,
            } as CSSProperties
          }
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
          spec：相邻实现 */}
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
        <span
          data-aireq-control-label=""
          className="min-w-0 flex-1 max-lg:sr-only compact-web:not-sr-only"
        >
          {children ?? <span className="truncate text-ui-base text-foreground">{label}</span>}
        </span>
      </button>
    </ControlHintTooltip>
  );
}

export function SettingsPageFrame({
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
  rootProps?: HTMLAttributes<HTMLDivElement> & {
    "data-testid"?: string;
    "data-active-section"?: string;
  };
  backButton?: ReactNode;
  search?: ReactNode;
  navigation: ReactNode;
  navigationRef?: Ref<HTMLElement>;
  navigationLabel: string;
  footer?: ReactNode;
  help: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <WebPageFrame>
      <div
        {...rootProps}
        // 限制网格行高，避免长页面撑出视口；正文在自己的容器内滚动。
        className="relative grid h-screen min-h-full w-full grid-cols-[68px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] lg:grid-cols-[268px_minmax(0,1fr)] compact-web:grid-cols-1 compact-web:grid-rows-[auto_minmax(0,1fr)]"
      >
        {/* 手机窄屏 Web 下 68px 图标栏会挤占内容宽度，compact-web 下改成顶部横向滚动导航条。
              spec：相邻实现 */}
        <aside className="min-w-0">
          <div className="flex h-full flex-col compact-web:flex-row compact-web:items-center">
            <div className="h-12 compact-web:hidden" />
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
              data-settings-navigation=""
              aria-label={navigationLabel}
              className="flex-1 overflow-y-auto px-2 pb-3 compact-web:min-w-0 compact-web:overflow-x-auto compact-web:overflow-y-hidden compact-web:py-1.5"
            >
              {navigation}
            </nav>

            {footer && <div>{footer}</div>}
          </div>
        </aside>

        <section data-settings-content-frame="true" className="flex min-h-0 flex-col p-0">
          <div
            data-settings-panel-frame="true"
            className="relative flex flex-col min-h-0 h-full border border-border bg-background rounded-xl"
          >
            <div className="absolute top-0 z-50 h-10 w-10 pointer-events-auto right-0">
              <div className="absolute right-2.5 top-2.5 pointer-events-auto">
                {help}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-12 shrink-0">
                <div className="min-w-0 flex-1 mr-12">{header}</div>
              </div>
              {children}
            </div>
          </div>
        </section>
      </div>
    </WebPageFrame>
  );
}
