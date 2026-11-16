// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import { ClipboardList, MoreHorizontal, UserRound, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Card } from "@/components/ui/card.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Input } from "@/components/ui/input.js";
import { useAIReq } from "./AIReqContext.js";
import { getEmployeeId } from "./identity.js";
import type { AIReqTodo } from "./contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "./shell/pageLayout.js";
import { useAIReqDataSource } from "./data-source.js";

const perspectiveLabels = { business: "业务", development: "开发", testing: "测试" } as const;
export function AIReqTodoPage() {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const [filter, setFilter] = useState<"mine" | "unassigned" | "all">("mine");
  const [projectId, setProjectId] = useState("");
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string>();
  const [assigningTodo, setAssigningTodo] = useState<AIReqTodo>();
  const [assignmentError, setAssignmentError] = useState<string>();
  const employeeId = getEmployeeId();
  const scopedTodos = (ai.view?.todos ?? []).filter(
    (item) => !projectId || item.projectId === projectId,
  );
  const mineCount = scopedTodos.filter((item) => item.employeeId === employeeId).length;
  const unassignedCount = scopedTodos.filter((item) => !item.employeeId).length;
  const todos = scopedTodos.filter(
    (item) =>
      filter === "all" || (filter === "mine" ? item.employeeId === employeeId : !item.employeeId),
  );
  const assign = async (item: AIReqTodo, employee: string) => {
    if (pending) return false;
    setPending(item.id);
    try {
      if (item.srId) {
        if (!source.planning) throw new Error("当前数据源不支持负责人分工。");
        await source.planning.updateSr(item.projectId, item.irId, item.srId, {
          ...(item.kind === "testing"
            ? { testingEmployeeId: employee }
            : { developerEmployeeId: employee }),
          operationId: createUuid(),
          expectedRevision: ai.view?.revision ?? 0,
        });
        await ai.refresh();
      } else {
        // 待办跨项目，当前页面投影不含其他项目联系人；以目标最新快照和同一版本完整提交。
        const target = { projectId: item.projectId, irId: item.irId };
        const view = await source.readWorkflow(target);
        const group = [...view.drafts, ...view.groups].find(
          (group) => group.projectId === item.projectId && group.id === item.irId,
        );
        if (!group) throw new Error("待办所属 IR 已不存在，请刷新后重试。");
        const perspective =
          item.perspective ??
          (group.proposalStage === "solution" || group.status === "requirements-pr"
            ? "development"
            : "business");
        const result = await source.command(
          {
            type: "assignContacts",
            projectId: item.projectId,
            irId: item.irId,
            contacts: { ...group.contacts, [perspective]: employee },
          },
          target,
          view.revision,
        );
        if (result.status === "failed")
          throw new Error(result.error ?? result.receipt.error ?? "联系人分配失败。");
        await ai.refresh();
      }
      return true;
    } catch (error) {
      ai.report(error);
      setAssignmentError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setPending(undefined);
    }
  };
  return (
    <main className="min-h-0 flex-1 overflow-auto text-ui-base [scrollbar-gutter:stable_both-edges]">
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} flex flex-col gap-4`}>
        <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>待办列表</h1>
        <p className="text-ui-sm text-foreground-subtle">
          查看跨项目待处理事项，完成业务操作后自动更新。
        </p>
        <div className="grid gap-3 md:grid-cols-3" aria-label="待办概览">
          {(
            [
              ["mine", "我的待办", mineCount, UserRound],
              ["unassigned", "待认领", unassignedCount, UserRoundPlus],
              ["all", "全部待办", scopedTodos.length, ClipboardList],
            ] as const
          ).map(([value, label, count, Icon]) => (
            <Card
              key={value}
              className={`gap-0 py-0 transition-colors hover:border-border-hover ${filter === value ? "border-foreground-subtle bg-card-selected" : ""}`}
            >
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-transparent p-4 text-left hover:bg-surface-hover focus-visible:border-foreground"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-foreground-subtle">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-ui-sm text-foreground">{label}</span>
                  <span className="text-ui-xl font-medium tabular-nums">
                    {ai.view ? count : "—"}
                  </span>
                </span>
                {filter === value && (
                  <span className="text-ui-sm text-foreground-subtle">当前</span>
                )}
              </button>
            </Card>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-ui-lg font-medium">
            {filter === "mine" ? "我的待办" : filter === "unassigned" ? "待认领" : "全部待办"}{" "}
            <span className="text-ui-sm font-normal text-foreground-subtle">{todos.length} 项</span>
          </h2>
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-ui-sm"
            aria-label="待办项目筛选"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">全部项目</option>
            {ai.view?.projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[680px] table-fixed text-left">
            <colgroup>
              <col className="w-[30%]" />
              <col />
              <col className="w-[20%]" />
              <col className="w-14" />
            </colgroup>
            <thead className="text-ui-sm text-foreground-subtle">
              <tr>
                {["需求／项目", "待处理事项", "归属", "分工"].map((label, index) => (
                  <th
                    className={`border-b border-border py-3 font-medium ${index === 3 ? "px-2 text-right" : "px-4"}`}
                    key={label}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todos.map((item) => (
                <tr
                  key={item.id}
                  className="group/row border-b border-border/50 last:border-0 hover:bg-surface-hover"
                >
                  <td className="break-words px-4 py-3">
                    <span className="font-medium">{item.requirementTitle}</span>
                    <span className="block text-ui-sm text-foreground-subtle">
                      {ai.view?.projects.find((project) => project.id === item.projectId)?.name ??
                        item.projectId}
                    </span>
                    <span className="block text-ui-sm text-foreground-subtle">
                      {item.irId}
                      {item.srId ? ` / ${item.srId}` : ""}
                    </span>
                  </td>
                  <td className="break-words px-4 py-3">
                    <Button
                      variant="ghost"
                      className="h-auto justify-start whitespace-normal break-words px-0 text-left hover:underline"
                      onClick={() => ai.select(item.selection, item.releaseId)}
                      aria-label={`处理 ${item.requirementTitle} · ${item.title}`}
                    >
                      {item.title}
                    </Button>
                    {item.perspective && (
                      <span className="block text-ui-sm text-foreground-subtle">
                        {perspectiveLabels[item.perspective]}视角 · 独立确认
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{item.employeeId ?? "未分配 · 待认领"}</td>
                  <td className="px-2 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="pointer-events-none size-8 rounded-lg opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100"
                          aria-label={`${item.irId}${item.srId ? ` / ${item.srId}` : ""} · ${item.title} 的操作`}
                        >
                          <MoreHorizontal aria-hidden="true" className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={Boolean(pending)}
                          onSelect={() => void assign(item, employeeId)}
                        >
                          由我{item.employeeId ? "接手" : "认领"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={Boolean(pending)}
                          onSelect={() => {
                            setAssignmentError(undefined);
                            setAssigningTodo(item);
                          }}
                        >
                          分配负责人…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {!todos.length && (
                <tr>
                  <td colSpan={4} className="p-6 text-foreground-subtle">
                    当前筛选暂无待办；等待 AI 或文档 PR 合入不会制造空操作待办。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Dialog
          open={Boolean(assigningTodo)}
          onOpenChange={(open) => {
            if (!open && !pending) setAssigningTodo(undefined);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>分配负责人</DialogTitle>
              <DialogDescription>
                {assigningTodo?.title} · {assigningTodo?.irId}
                {assigningTodo?.srId ? ` / ${assigningTodo.srId}` : ""}
              </DialogDescription>
            </DialogHeader>
            {assigningTodo && (
              <div className="space-y-2">
                <label htmlFor="todo-assignee" className="text-ui-sm font-medium">
                  负责人工号
                </label>
                <Input
                  id="todo-assignee"
                  placeholder="例如 j00808874"
                  value={assignees[assigningTodo.id] ?? ""}
                  onChange={(event) =>
                    setAssignees((previous) => ({
                      ...previous,
                      [assigningTodo.id]: event.target.value,
                    }))
                  }
                />
                <p className="text-ui-sm text-foreground-subtle">小写字母开头，后接 8 位数字。</p>
              </div>
            )}
            {assignmentError && (
              <p role="alert" className="text-ui-sm text-destructive">
                {assignmentError}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={Boolean(pending)}
                onClick={() => setAssigningTodo(undefined)}
              >
                取消
              </Button>
              <Button
                disabled={
                  !assigningTodo ||
                  Boolean(pending) ||
                  !/^[a-z][0-9]{8}$/.test(assignees[assigningTodo.id] ?? "")
                }
                onClick={() => {
                  if (assigningTodo)
                    void assign(assigningTodo, assignees[assigningTodo.id]!).then((success) => {
                      if (success) setAssigningTodo(undefined);
                    });
                }}
              >
                分配
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
