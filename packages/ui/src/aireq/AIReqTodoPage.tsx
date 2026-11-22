import { formatUserFacingError } from "@/lib/errorMessage.js";
import { MoreHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
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
import { ScopedPageTitle } from "./shell/ScopedPageTitle.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "./shell/pageLayout.js";
import { useAIReqDataSource } from "./data-source.js";
import { proposalTaskForTodo, proposalTaskSelection } from "./proposals/proposalTasks.js";

const perspectiveLabels = { business: "业务", development: "开发", testing: "测试" } as const;
const assignmentLabel = (item: AIReqTodo) =>
  perspectiveLabels[item.assignmentPerspective] + "联系人";
export function AIReqTodoPage() {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const [filter, setFilter] = useState<"mine" | "unassigned" | "all">("mine");
  const nextFilterButton = useRef<HTMLButtonElement>(null);
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string>();
  const [assigningTodo, setAssigningTodo] = useState<AIReqTodo>();
  const [assignmentError, setAssignmentError] = useState<string>();
  const employeeId = getEmployeeId();
  const assigneeDraft = assigningTodo ? (assignees[assigningTodo.id] ?? "").trim() : "";
  const assigneeValid = /^[a-z][0-9]{8}$/.test(assigneeDraft);
  const assigneeInvalid = Boolean(assigneeDraft) && !assigneeValid;
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const release = ai.view?.releases.find(
    (item) => item.projectId === project?.id && item.id === ai.releaseId,
  );
  // 范围与工号是两层筛选；统计、认领和全部列表均不得混入其他项目或版本。
  const scopedTodos =
    ai.selectionReady && release
      ? (ai.view?.todos ?? []).filter(
          (item) => item.projectId === project?.id && item.releaseId === release.id,
        )
      : [];
  const mineCount = scopedTodos.filter((item) => item.employeeId === employeeId).length;
  const unassignedCount = scopedTodos.filter((item) => !item.employeeId).length;
  const todos = scopedTodos.filter(
    (item) =>
      filter === "all" || (filter === "mine" ? item.employeeId === employeeId : !item.employeeId),
  );
  const projectName = (id: string) =>
    ai.view?.projects.find((project) => project.id === id)?.name ?? "未知项目";
  const scopeLabel = "当前版本";
  const emptyTitle = !scopedTodos.length
    ? `${scopeLabel}暂无待处理事项`
    : filter === "mine"
      ? `${scopeLabel}没有分配给你的待办`
      : `${scopeLabel}没有待认领事项`;
  const nextFilter = filter === "mine" && unassignedCount > 0 ? "unassigned" : "all";
  const assign = async (item: AIReqTodo, employee: string) => {
    if (pending) return false;
    setPending(item.id);
    try {
      // 分配读取目标最新快照，按同一业务版本提交，避免覆盖刚更新的其他联系人。
      const target = { projectId: item.projectId, irId: item.irId };
      const view = await source.readWorkflow(target);
      const group = view.drafts.find(
        (group) => group.projectId === item.projectId && group.id === item.irId,
      );
      if (!group) throw new Error("待办所属 IR 已不存在，请刷新后重试。");
      // 弹窗展示与实际写入使用同一职责，不能从流程阶段猜测待办的分工类型。
      const perspective = item.assignmentPerspective;
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
        throw Object.assign(new Error(result.error ?? result.receipt.error ?? "联系人分配失败。"), {
          code: "BUSINESS_RULE_VIOLATION",
        });
      await ai.refresh();
      return true;
    } catch (error) {
      ai.report(error);
      setAssignmentError(formatUserFacingError(error, "分配未完成，请重试。"));
      return false;
    } finally {
      setPending(undefined);
    }
  };
  if (!ai.selectionReady || !project || !release)
    return (
      <main className="min-h-0 flex-1 overflow-auto text-ui-base">
        <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-3`}>
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>版本待办</h1>
          <p role="status" className="text-foreground-subtle">
            {!ai.selectionReady
              ? ai.pending
                ? "正在读取当前范围的待办…"
                : "当前范围待办读取失败，请重试。"
              : !project
                ? "请在左侧选择项目。"
                : "当前项目尚无 Release，请先在项目配置中添加。"}
          </p>
          {!ai.selectionReady && !ai.pending && (
            <Button
              variant="outline"
              className="focus-visible:border-remote-foreground-muted"
              onClick={() => void ai.refresh()}
            >
              重试
            </Button>
          )}
        </div>
      </main>
    );
  return (
    <main
      className="@container/conversation min-h-0 min-w-0 flex-1 overflow-y-auto text-ui-base [scrollbar-gutter:stable_both-edges] [&_button:focus-visible]:border-remote-foreground-muted"
      data-testid="aireq-todos"
    >
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} flex flex-col gap-8`}>
        <ScopedPageTitle title="版本待办" />
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="待办筛选">
          {(
            [
              ["mine", "我的", mineCount],
              ["unassigned", "待认领", unassignedCount],
              ["all", "全部待办", scopedTodos.length],
            ] as const
          ).map(([value, label, count]) => (
            <Button
              key={value}
              ref={value === nextFilter ? nextFilterButton : undefined}
              variant={filter === value ? "secondary" : "ghost"}
              className="h-8 gap-3 px-3"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              <span
                className={`text-ui-sm font-normal tabular-nums group-hover/button:text-foreground group-focus-visible/button:text-foreground ${filter === value ? "text-foreground" : "text-foreground-subtle"}`}
              >
                {count}
              </span>
            </Button>
          ))}
        </div>
        <div className="rounded-xl border border-card-border bg-card text-foreground">
          <table className="w-full table-fixed text-left">
            <colgroup>
              <col className="w-[30%]" />
              <col />
              <col className="hidden w-[20%] @min-[640px]/conversation:table-column" />
              <col className="w-14" />
            </colgroup>
            <thead className="bg-card text-ui-sm text-foreground">
              <tr>
                {["需求", "待处理事项", "归属", "分工"].map((label, index) => (
                  <th
                    className={`border-b border-border px-2 py-3 font-medium ${index === 2 ? "hidden @min-[640px]/conversation:table-cell" : ""} ${index === 3 ? "text-right" : "@min-[640px]/conversation:px-4"}`}
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
                  data-aireq-motion-row=""
                  className="group/row border-b border-border/50 last:border-0 hover:bg-hover hover:[&_.text-foreground-subtle]:text-foreground focus-within:[&_.text-foreground-subtle]:text-foreground"
                >
                  <td
                    data-aireq-motion-cell=""
                    className="px-2 py-3 [overflow-wrap:anywhere] @min-[640px]/conversation:px-4"
                  >
                    <span className="font-medium">{item.requirementTitle}</span>
                  </td>
                  <td className="px-2 py-3 [overflow-wrap:anywhere] @min-[640px]/conversation:px-4">
                    <Button
                      variant="ghost"
                      className="h-auto w-full justify-start px-0 text-left whitespace-normal hover:underline"
                      onClick={() => {
                        const task = proposalTaskForTodo(item);
                        ai.select(
                          task ? proposalTaskSelection(item.selection, task) : item.selection,
                          item.releaseId,
                          task,
                        );
                      }}
                      aria-label={`处理 ${item.requirementTitle} · ${item.title}`}
                    >
                      <span className="min-w-0 [overflow-wrap:anywhere]">{item.title}</span>
                    </Button>
                    {item.perspective && (
                      <span className="block text-ui-sm text-foreground-subtle">
                        {perspectiveLabels[item.perspective]}角色 · 独立确认
                      </span>
                    )}
                    {/* 窄分栏隐藏归属列时，归属摘要并入事项单元格，认领判断不必横滚。 */}
                    <span className="block text-ui-sm text-foreground-subtle @min-[640px]/conversation:hidden">
                      归属：{item.employeeId ?? "未分配 · 待认领"}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 @min-[640px]/conversation:table-cell">
                    {item.employeeId ?? "未分配 · 待认领"}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        {/* 分工是行内次操作，统一默认隐藏（spec：全局想法池）：行悬停／键盘聚焦／菜单展开时显现。 */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="pointer-events-none size-8 rounded-lg text-foreground-subtle opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 hover:text-foreground focus-visible:text-foreground aria-expanded:pointer-events-auto aria-expanded:opacity-100"
                          aria-label={`${item.requirementTitle} · ${item.title} 的分工操作`}
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
                          调整分工…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {!todos.length && (
                <tr>
                  <td colSpan={4} className="p-6 text-foreground-subtle">
                    <p className="font-medium text-foreground">{emptyTitle}</p>
                    {scopedTodos.length > 0 ? (
                      <Button
                        variant="link"
                        className="mt-1 h-auto p-0 text-ui-sm"
                        onClick={() => {
                          nextFilterButton.current?.focus();
                          setFilter(nextFilter);
                        }}
                      >
                        {nextFilter === "unassigned"
                          ? `查看待认领（${unassignedCount}）`
                          : `查看全部待办（${scopedTodos.length}）`}
                      </Button>
                    ) : (
                      <p className="mt-1 text-ui-sm">需要人工处理时，事项会自动出现在这里。</p>
                    )}
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
              <DialogTitle>调整分工</DialogTitle>
              <DialogDescription>
                分配会更新对应联系人或负责人。仅代办无需调整分工。
              </DialogDescription>
            </DialogHeader>
            {assigningTodo && (
              <div className="space-y-4">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-ui-sm">
                  <dt className="text-foreground-subtle">需求</dt>
                  <dd className="break-words">{assigningTodo.requirementTitle}</dd>
                  <dt className="text-foreground-subtle">项目</dt>
                  <dd className="break-words">{projectName(assigningTodo.projectId)}</dd>
                  <dt className="text-foreground-subtle">分工类型</dt>
                  <dd>{assignmentLabel(assigningTodo)}</dd>
                  <dt className="text-foreground-subtle">当前工号</dt>
                  <dd className={assigningTodo.employeeId ? "font-mono" : undefined}>
                    {assigningTodo.employeeId ?? "未分配"}
                  </dd>
                </dl>
                <div className="space-y-2">
                  <label htmlFor="todo-assignee" className="text-ui-sm font-medium">
                    新{assignmentLabel(assigningTodo)}工号
                  </label>
                  <Input
                    id="todo-assignee"
                    aria-describedby={
                      assigneeInvalid
                        ? "todo-assignee-hint todo-assignee-error"
                        : "todo-assignee-hint"
                    }
                    aria-invalid={assigneeInvalid || undefined}
                    placeholder="例如 j00808874"
                    value={assignees[assigningTodo.id] ?? ""}
                    onChange={(event) =>
                      setAssignees((previous) => ({
                        ...previous,
                        [assigningTodo.id]: event.target.value,
                      }))
                    }
                  />
                  <p id="todo-assignee-hint" className="text-ui-sm text-foreground-subtle">
                    小写字母开头，后接 8 位数字。
                  </p>
                  {assigneeInvalid && (
                    <p
                      id="todo-assignee-error"
                      role="alert"
                      className="text-ui-sm text-destructive"
                    >
                      工号格式应为小写字母开头，后接 8 位数字。
                    </p>
                  )}
                </div>
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
                disabled={!assigningTodo || Boolean(pending) || !assigneeValid}
                onClick={() => {
                  if (assigningTodo)
                    void assign(assigningTodo, assigneeDraft).then((success) => {
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
