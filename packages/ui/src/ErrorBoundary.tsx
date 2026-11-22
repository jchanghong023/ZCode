import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { WebPageFrame } from "@/WebPageFrame.js";
import { UI_MESSAGES } from "@/i18n/localeMessages.js";
import { logger } from "@/logger.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { AlertTriangleIcon, RefreshCw } from "lucide-react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export type ScopedErrorBoundaryVariant = "panel" | "inline" | "compact" | "silent";

interface ScopedErrorBoundaryProps {
  children: ReactNode;
  scope: string;
  resetKeys?: readonly unknown[];
  variant?: ScopedErrorBoundaryVariant;
  className?: string;
  onReset?: () => void;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === "string" ? error : "Unknown error");
}

function serializeErrorForLog(error: Error): {
  name: string;
  message: string;
  stack?: string;
} {
  return {
    name: error.name,
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
  };
}

/** 错误边界只读中文文案表：UI 单语中文，崩溃兜底不再解析语言。 */
function formatBoundaryMessage(id: string): string {
  return UI_MESSAGES[id] ?? id;
}

function haveResetKeysChanged(
  previousKeys: readonly unknown[] = [],
  nextKeys: readonly unknown[] = [],
): boolean {
  if (previousKeys.length !== nextKeys.length) {
    return true;
  }

  return previousKeys.some((previousKey, index) => !Object.is(previousKey, nextKeys[index]));
}

function ErrorFallback({
  onReset,
  onReload,
}: {
  onReset: () => void;
  onReload: () => void;
}) {
  return (
    <WebPageFrame>
      <div className="flex h-full min-h-0 justify-center overflow-y-auto p-6">
        <div
          role="alert"
          // 卡片从顶部开始，低视口下可滚动到“重试／刷新”。
          className="w-full max-w-xl self-start rounded-3xl border border-destructive/20 bg-surface-alt p-6 shadow-sm"
        >
          <div className="flex size-10 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangleIcon className="size-5" />
          </div>

          <h1 className="mt-4 text-ui-lg font-semibold text-foreground">
            {formatBoundaryMessage("appError.title")}
          </h1>
          <p className="mt-2 text-ui-base leading-6 text-on-surface-muted">
            {formatBoundaryMessage("appError.description")}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={onReset}>
              {formatBoundaryMessage("appError.retry")}
            </Button>
            <Button type="button" variant="outline" onClick={onReload}>
              <RefreshCw />
              {formatBoundaryMessage("appError.reload")}
            </Button>
          </div>

          <p className="mt-4 text-ui-base leading-5 text-on-surface-muted">
            {formatBoundaryMessage("appError.hint")}
          </p>

          {/* 原始异常和组件堆栈仅记录到日志，不在错误页回显。 */}
        </div>
      </div>
    </WebPageFrame>
  );
}

function ScopedErrorFallback({
  onReset,
  onReload,
  variant = "panel",
  className,
}: {
  onReset: () => void;
  onReload: () => void;
  variant?: ScopedErrorBoundaryVariant;
  className?: string;
}) {
  if (variant === "silent") {
    return null;
  }

  const isCompact = variant === "compact";

  if (isCompact) {
    return (
      <div
        role="alert"
        className={cn(
          "flex min-h-10 items-center gap-2 border-border bg-surface px-3 py-2",
          className,
        )}
      >
        <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui-base font-medium text-foreground">
            {formatBoundaryMessage("appError.sectionTitle")}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onReset}>
          {formatBoundaryMessage("appError.sectionRetry")}
        </Button>
      </div>
    );
  }

  const content = (
    <>
      <div className="flex size-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <AlertTriangleIcon className="size-4" />
      </div>
      <h2 className="mt-3 text-ui-base font-medium text-foreground">
        {formatBoundaryMessage("appError.sectionTitle")}
      </h2>
      <p className="mt-1 text-ui-base leading-5 text-foreground-subtle">
        {formatBoundaryMessage("appError.sectionDescription")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onReset}>
          {formatBoundaryMessage("appError.sectionRetry")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onReload}>
          <RefreshCw />
          {formatBoundaryMessage("appError.reload")}
        </Button>
      </div>
      <p className="mt-3 text-ui-base leading-5 text-foreground-subtle">
        {formatBoundaryMessage("appError.sectionHint")}
      </p>
    </>
  );

  if (variant === "inline") {
    return (
      <div
        role="alert"
        className={cn("w-full rounded-xl border border-destructive/20 bg-surface p-4", className)}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex h-full min-h-0 items-center justify-center overflow-auto bg-background p-4",
        className,
      )}
    >
      <div className="w-full max-w-md rounded-xl border border-destructive/20 bg-surface p-4 shadow-sm">
        {content}
      </div>
    </div>
  );
}

/**
 * AppErrorBoundary —— React 根级错误边界
 *
 * renderer 入口若直接把 ZCodeIntlProvider / Root 挂到 createRoot，
 * 一旦某个 Provider 或页面组件在 render / lifecycle 阶段抛错，React 会整棵树卸载，
 * 用户看到的就只剩一张白屏。这里包一层共享根级边界，把异常收敛成可恢复 fallback，
 * 至少保证界面还能给出“重试 / 刷新”的出口，并把错误打到统一 UI 日志里。
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error: normalizeError(error) };
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const normalizedError = normalizeError(error);
    logger.error(
      "[AppErrorBoundary] React subtree crashed:",
      // Error 对象跨 preload 日志 bridge 序列化后会变成 {}，
      // 导致 Maximum update depth 等关键 message 丢失。这里显式展开可诊断字段。
      serializeErrorForLog(normalizedError),
      errorInfo.componentStack,
    );
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return <ErrorFallback onReset={this.handleReset} onReload={this.handleReload} />;
  }
}

/**
 * ScopedErrorBoundary —— 局部 UI 故障隔离边界
 *
 * 只有根级错误边界时，workspace 内任意一个面板 render 抛错都会一路冒泡到根，
 * 最终把整套界面替换成全屏错误页。这里提供可复用的局部边界，让 sidebar、chat、
 * terminal、side pane 等区域各自失败各自恢复，避免单个组件问题扩大成整窗不可用。
 */
export class ScopedErrorBoundary extends Component<
  ScopedErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error: normalizeError(error) };
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const normalizedError = normalizeError(error);
    logger.error(
      `[ScopedErrorBoundary:${this.props.scope}] React subtree crashed:`,
      // Error 对象跨 preload 日志 bridge 序列化后会变成 {}，
      // 局部边界需要保留 message/stack 才能定位 UI 更新循环。
      serializeErrorForLog(normalizedError),
      errorInfo.componentStack,
    );
  }

  override componentDidUpdate(previousProps: ScopedErrorBoundaryProps) {
    if (this.state.error && haveResetKeysChanged(previousProps.resetKeys, this.props.resetKeys)) {
      // 局部 fallback 如果不随 workspace/task/tab 切换自动清空，
      // 用户离开出错区域后再回来仍会看到旧错误。resetKeys 变化时重置边界，
      // 让新的隔离上下文可以重新渲染。
      this.setState({ error: null });
    }
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  private handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <ScopedErrorFallback
        onReset={this.handleReset}
        onReload={this.handleReload}
        variant={this.props.variant}
        className={this.props.className}
      />
    );
  }
}
