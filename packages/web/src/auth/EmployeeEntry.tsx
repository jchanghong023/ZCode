import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@zcode/ui/button";
import { Input } from "@zcode/ui/input";
import type { EmployeeEntryContract } from "./contract.js";

const STORAGE_KEY = "zcode:employee-number";

export function createEmployeeEntry(): EmployeeEntryContract {
  let employeeNumber: string | null = null;
  let persistenceError: string | null = null;
  const listeners = new Set<() => void>();
  try {
    employeeNumber = sessionStorage.getItem(STORAGE_KEY)?.trim() || null;
    // 旧产品登录缓存不能继续参与浏览器状态恢复；模型/工具凭据不在此清理。
    for (const key of [
      "oauth:active_provider", "zcodejwttoken", "oauth_pending_logins",
      "oauth:browser_session", "oauth:browser_login_attempt", "oauth:browser_session_epoch",
      ...["zai", "zai_cn", "bigmodel"].flatMap((provider) => [
        `oauth:${provider}:access_token`, `oauth:${provider}:user_info`,
      ]),
    ]) localStorage.removeItem(key);
  } catch {
    persistenceError = "浏览器存储不可用，本次工号不能在刷新后恢复。";
  }
  const publish = () => listeners.forEach((listener) => listener());
  return {
    get employeeNumber() { return employeeNumber; },
    get persistenceError() { return persistenceError; },
    enter(value) {
      const next = value.trim();
      if (!next) return;
      try { sessionStorage.setItem(STORAGE_KEY, next); }
      catch { persistenceError = "浏览器存储不可用，本次工号不能在刷新后恢复。"; }
      employeeNumber = next;
      publish();
    },
    leave() {
      try { sessionStorage.removeItem(STORAGE_KEY); }
      catch { persistenceError = "无法清除浏览器保存的工号，请在浏览器设置中清除本站会话存储。"; }
      employeeNumber = null;
      publish();
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export function EmployeeEntry({ owner, children }: {
  owner: EmployeeEntryContract;
  children: ReactNode;
}) {
  const employeeNumber = useSyncExternalStore(owner.subscribe, () => owner.employeeNumber);
  const [value, setValue] = useState("");
  if (!employeeNumber) return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <form className="w-full max-w-sm space-y-4 rounded-2xl bg-background p-8 text-ui-base shadow-md"
        onSubmit={(event) => { event.preventDefault(); owner.enter(value); setValue(""); }}>
        <h1 className="text-ui-xl font-semibold">输入工号</h1>
        <p className="text-ui-sm text-foreground-subtle">工号仅标记当前操作者，不验证本人。所有操作者共享项目与会话。</p>
        <label className="block space-y-2"><span>工号</span>
          <Input autoFocus autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        {owner.persistenceError && <p role="alert" className="text-ui-sm text-destructive">{owner.persistenceError}</p>}
        <Button type="submit" className="w-full" disabled={!value.trim()}>进入工作区</Button>
      </form>
    </main>
  );
  return <>
    <div className="flex items-center justify-end gap-3 border-b border-border bg-background px-4 py-1 text-ui-sm text-foreground" aria-label="当前操作者">
      <span>当前工号：{employeeNumber}</span>
      {owner.persistenceError && <span role="alert">{owner.persistenceError}</span>}
      <Button size="sm" variant="ghost" onClick={() => owner.leave()}>退出 / 切换工号</Button>
    </div>
    <div className="min-h-0 flex-1">{children}</div>
  </>;
}
