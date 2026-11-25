import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { logger } from "@zcode/ui";
import { Button } from "@zcode/ui/button";
import { Input } from "@zcode/ui/input";
import { Label } from "@zcode/ui/label";
import { Alert, AlertDescription } from "@zcode/ui/alert";
import { ThemeHeroVisual } from "@zcode/ui/theme-hero";
import { DEFAULT_AIREQ_THEME, useTheme } from "@zcode/ui/useTheme";
import { TriangleAlertIcon, UserRound } from "lucide-react";
import type { EmployeeEntryContract } from "./contract.js";

const STORAGE_KEY = "zcode:employee-number";
const EMPLOYEE_ID = /^[a-z][0-9]{8}$/;

export type EmployeeEntryConnection =
  | { status: "connecting" }
  | { status: "failed"; message: string; retry(): void };

export function createEmployeeEntry(): EmployeeEntryContract {
  let employeeNumber: string | null = null;
  let persistenceError: string | null = null;
  const listeners = new Set<() => void>();
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY)?.trim() ?? "";
    // 缓存与新输入必须使用同一格式规则，旧的非空脏值不能绕过登录门禁。
    employeeNumber = EMPLOYEE_ID.test(cached) ? cached : null;
    if (cached && !employeeNumber) sessionStorage.removeItem(STORAGE_KEY);
    // 旧产品登录缓存不能继续参与浏览器状态恢复；模型/工具凭据不在此清理。
    for (const key of [
      "oauth:active_provider",
      "zcodejwttoken",
      "oauth_pending_logins",
      "oauth:browser_session",
      "oauth:browser_login_attempt",
      "oauth:browser_session_epoch",
      ...["zai", "zai_cn", "bigmodel"].flatMap((provider) => [
        `oauth:${provider}:access_token`,
        `oauth:${provider}:user_info`,
      ]),
    ])
      localStorage.removeItem(key);
  } catch {
    persistenceError = "浏览器存储不可用，本次工号不能在刷新后恢复。";
  }
  const publish = () => listeners.forEach((listener) => listener());
  return {
    get employeeNumber() {
      return employeeNumber;
    },
    get persistenceError() {
      return persistenceError;
    },
    enter(value) {
      const next = value.trim();
      if (!EMPLOYEE_ID.test(next)) return;
      try {
        sessionStorage.setItem(STORAGE_KEY, next);
      } catch {
        persistenceError = "浏览器存储不可用，本次工号不能在刷新后恢复。";
      }
      employeeNumber = next;
      publish();
    },
    leave() {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        persistenceError = "无法清除浏览器保存的工号，请在浏览器设置中清除本站会话存储。";
      }
      employeeNumber = null;
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function EmployeeEntry({
  owner,
  connection,
  children,
}: {
  owner: EmployeeEntryContract;
  connection: EmployeeEntryConnection | null;
  children: ReactNode;
}) {
  const employeeNumber = useSyncExternalStore(owner.subscribe, () => owner.employeeNumber);
  if (!employeeNumber || connection) {
    return (
      <EmployeeLoginScreen owner={owner} employeeNumber={employeeNumber} connection={connection} />
    );
  }
  // 修复原因：入口中间层必须保持 flex 高度约束，否则长表会把侧栏页脚推到视口外。
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}

function EntryError({ id, children }: { id?: string; children: ReactNode }) {
  // 入口错误原先使用实心红底与半透明白字，动效主题下普通文本对比度不足。
  return (
    <Alert
      id={id}
      className="border-destructive/40 bg-destructive-surface text-destructive-surface-foreground"
    >
      <TriangleAlertIcon aria-hidden="true" className="size-4" />
      <AlertDescription className="text-inherit">{children}</AlertDescription>
    </Alert>
  );
}

function EmployeeLoginScreen({
  owner,
  employeeNumber,
  connection,
}: {
  owner: EmployeeEntryContract;
  employeeNumber: string | null;
  connection: EmployeeEntryConnection | null;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { theme } = useTheme(DEFAULT_AIREQ_THEME);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const connectionStatus = connection?.status;
  const connecting = connectionStatus === "connecting";
  useEffect(() => {
    // 首次失败时入口仍挂载。显式聚焦恢复动作，切换工号则回到可编辑输入。
    if (connectionStatus === "failed") submitRef.current?.focus();
    else if (!connectionStatus) inputRef.current?.focus();
  }, [connectionStatus]);
  // 原版入口为居中标题、448px 卡片及独立页脚；不能用左对齐的512px表单替代。
  return (
    <main
      className="relative h-full min-h-dvh overflow-hidden bg-background text-foreground"
      data-testid="aireq-entry"
    >
      <ThemeHeroVisual theme={theme} className="pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex h-dvh flex-col items-center overflow-y-auto px-4 pb-6 pt-14 sm:px-6">
        <div className="flex w-full flex-1 shrink-0 items-center justify-center py-6">
          <section
            className="flex w-full max-w-md shrink-0 flex-col gap-7 rounded-2xl bg-background p-8 text-ui-base/relaxed shadow-md sm:p-10"
            aria-labelledby="aireq-entry-title"
          >
            <header className="flex flex-col items-center gap-4 text-center">
              <div
                className="relative flex size-16 items-center justify-center rounded-2xl bg-linear-to-b from-black to-background text-white shadow-lg/20 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:border before:border-white/10"
                aria-hidden="true"
              >
                <UserRound className="size-8" strokeWidth={1.5} />
              </div>
              <div className="flex flex-col items-center gap-1 text-center">
                <h1 id="aireq-entry-title" className="text-ui-xl font-semibold tracking-tight">
                  AI 需求协作
                </h1>
                <p className="text-ui-base/relaxed text-foreground-subtle">
                  与团队一起澄清需求、评审方案并交付正式文档
                </p>
              </div>
            </header>
            <form
              className="space-y-4"
              noValidate
              onSubmit={async (event) => {
                event.preventDefault();
                if (submitting || connecting) return;
                if (connection?.status === "failed") {
                  connection.retry();
                  return;
                }
                if (!EMPLOYEE_ID.test(value.trim())) {
                  setError("请输入一个小写字母和八位数字组成的工号，例如 j00808874。");
                  return;
                }
                setSubmitting(true);
                setError("");
                try {
                  owner.enter(value);
                  setValue("");
                } catch (cause) {
                  logger.warn("[web] Employee entry failed", cause);
                  setError("暂时无法进入工作台，请重试。");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="aireq-employee-id" className="text-ui-base font-medium">
                  工号
                </Label>
                <Input
                  id="aireq-employee-id"
                  ref={inputRef}
                  size="lg"
                  className="h-10 w-full text-ui-base"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={32}
                  placeholder="例如 j00808874"
                  aria-describedby={
                    connection
                      ? undefined
                      : error
                        ? "employee-id-help employee-id-error"
                        : "employee-id-help"
                  }
                  aria-invalid={Boolean(error)}
                  value={connection ? (employeeNumber ?? "") : value}
                  readOnly={Boolean(connection) || submitting}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError("");
                  }}
                />
                {!connection && (
                  <p
                    id="employee-id-help"
                    className="text-center text-ui-sm text-foreground-subtle"
                  >
                    a–z 中任一小写字母开头，后接 8 位数字；无需密码。
                  </p>
                )}
              </div>
              {error && <EntryError id="employee-id-error">{error}</EntryError>}
              {connection?.status === "failed" && <EntryError>{connection.message}</EntryError>}
              {owner.persistenceError && <EntryError>{owner.persistenceError}</EntryError>}
              <div className="flex flex-col items-center gap-2">
                <span role="status" className="sr-only">
                  {connecting && "正在连接工作台…"}
                </span>
                <Button
                  ref={submitRef}
                  type="submit"
                  size="lg"
                  className="h-10 w-full px-6 text-ui-base font-medium aria-disabled:pointer-events-none aria-disabled:opacity-50"
                  disabled={!connection && (!value.trim() || submitting)}
                  aria-disabled={connecting || undefined}
                >
                  {connecting ? "正在连接…" : connection ? "重新连接" : "进入工作台"}
                </Button>
                {connection && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => owner.leave()}
                  >
                    切换工号
                  </Button>
                )}
              </div>
            </form>
          </section>
        </div>
        <footer className="flex shrink-0 flex-col items-center gap-2 text-center text-ui-xs text-foreground-subtle">
          <p>ZCode</p>
        </footer>
      </div>
    </main>
  );
}
