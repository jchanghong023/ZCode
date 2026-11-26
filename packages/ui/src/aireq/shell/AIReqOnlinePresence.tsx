import { useMemo } from "react";
import { UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useOnlinePresence } from "./useOnlinePresence.js";

export function AIReqOnlinePresence() {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const { snapshot, error } = useOnlinePresence();
  const employeeCount = useMemo(() => {
    if (!snapshot) return undefined;
    const ids = new Set<string>();
    for (const { employeeId } of snapshot.rows) ids.add(employeeId);
    return ids.size;
  }, [snapshot]);
  const count =
    employeeCount === undefined
      ? undefined
      : zh
        ? `${employeeCount} 人`
        : `${employeeCount} people`;
  const unavailable = zh ? "在线状态暂不可用" : "Online status unavailable";

  return (
    <Dialog>
      <div className="shrink-0">
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="lg"
            // 在线入口是可操作的辅助信息；复用顶栏对比度和焦点边框，避免弱文字看似禁用且键盘焦点不可见。
            className="min-w-0 gap-1.5 font-normal text-remote-foreground-muted hover:text-foreground focus-visible:border-remote-foreground-muted data-[state=open]:bg-hover data-[state=open]:text-foreground"
          >
            <UsersRound aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">
              {error
                ? unavailable
                : count
                  ? zh
                    ? "在线人数"
                    : "Online people"
                  : zh
                    ? "在线人数…"
                    : "Online people…"}
            </span>
            {!error && count && (
              <span className="shrink-0 font-medium text-foreground tabular-nums">{count}</span>
            )}
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="flex max-h-[70vh] w-[640px] flex-col gap-4">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>
            {zh ? "当前在线" : "Currently online"}
            {count && <span className="font-normal text-foreground-subtle"> · {count}</span>}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {zh
              ? "全系统当前连接的工号及访问 IP，人数按工号去重。"
              : "Connected employees and source IPs across the system. People are counted by unique employee number."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="status" className="py-6 text-center text-foreground-subtle">
            {unavailable}
          </p>
        ) : !snapshot ? (
          <p role="status" className="py-6 text-center text-foreground-subtle">
            {zh ? "正在读取…" : "Loading…"}
          </p>
        ) : (
          <div
            role="region"
            aria-label={zh ? "在线人员列表" : "Online people"}
            tabIndex={0}
            className="min-h-0 overflow-auto overscroll-contain rounded-lg border border-card-border outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
          >
            <table className="w-full table-fixed text-left text-ui-base">
              <colgroup>
                <col className="w-40" />
                <col />
              </colgroup>
              <thead className="sticky top-0 bg-card text-ui-sm text-foreground">
                <tr className="border-b border-card-border">
                  <th className="px-4 py-3 font-medium" scope="col">
                    {zh ? "工号" : "Employee"}
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    {zh ? "访问 IP" : "Source IP"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border bg-card">
                {snapshot.rows.map((row) => (
                  <tr key={JSON.stringify([row.employeeId, row.ip])}>
                    <td className="px-4 py-3 align-top font-mono tabular-nums">{row.employeeId}</td>
                    <td className="break-all px-4 py-3 align-top font-mono tabular-nums">
                      {row.ip ?? (zh ? "未知" : "Unknown")}
                    </td>
                  </tr>
                ))}
                {snapshot.rows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-foreground-subtle">
                      {zh ? "暂无在线人员。" : "No one is online."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
