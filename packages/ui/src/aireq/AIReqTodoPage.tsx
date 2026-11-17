import { formatUserFacingError } from "@/lib/errorMessage.js";
// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
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
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "./shell/pageLayout.js";
import { useAIReqDataSource } from "./data-source.js";

const perspectiveLabels = { business: "业务", development: "开发", testing: "测试" } as const;
const assignmentLabel = (item: AIReqTodo) =>
  `${perspectiveLabels[item.assignmentPerspective]}${item.srId ? "负责人" : "联系人"}`;
const todoObjectLabel = (item: AIReqTodo) =>
  `${item.requirementTitle}${item.srId && item.srTitle ? ` · ${item.srTitle}` : ""}`;
export function AIReqTodoPage() {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const [filter, setFilter] = useState<"mine" | "unassigned" | "all">("mine");
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string>();
  const [assigningTodo, setAssigningTodo] = useState<AIReqTodo>();
  const [assignmentError, setAssignmentError] = useState<string>();
  const employeeId = getEmployeeId();
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
    ai.view?.projects.find((project) => project.id === id)?.name ?? id;
  const scopeLabel = "当前版本";
  const emptyTitle = !scopedTodos.length
    ? `${scopeLabel}暂无待处理事项`
    : filter === "mine"
      ? `${scopeLabel}没有分配给你的待办`
      : `${scopeLabel}没有待认领事项`;
  const emptyDescription = !scopedTodos.length
    ? "需要人工处理时，事项会自动出现在这里。"
    : filter === "mine"
      ? "可切换到待认领或全部待办。"
      : "当前范围内的待办均已分配负责人。";
  const assign = async (item: AIReqTodo, employee: string) => {
    if (pending) return false;
    setPending(item.id);
    try {
      if (item.srId) {
        if (!source.planning) throw new Error("当前数据源不支持负责人分工。");
        await source.planning.updateSr(item.projectId, item.irId, item.srId, {
          ...(item.assignmentPerspective === "testing"
            ? { testingEmployeeId: employee }
            : { developerEmployeeId: employee }),
          operationId: createUuid(),
          expectedRevision: ai.view?.revision ?? 0,
        });
        await ai.refresh();
      } else {
        // 分配读取目标最新快照，按同一业务版本提交，避免覆盖刚更新的其他联系人。
        const target = { projectId: item.projectId, irId: item.irId };
        const view = await source.readWorkflow(target);
        const group = [...view.drafts, ...view.groups].find(
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
          throw Object.assign(
            new Error(result.error ?? result.receipt.error ?? "联系人分配失败。"),
            { code: "BUSINESS_RULE_VIOLATION" },
          );
        await ai.refresh();
      }
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
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>我的待办</h1>
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
      className="min-h-0 flex-1 overflow-auto text-ui-base [scrollbar-gutter:stable_both-edges] [&_button:focus-visible]:border-remote-foreground-muted"
      data-testid="aireq-todos"
    >
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} flex flex-col gap-8`}>
        <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>我的待办</h1>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="待办筛选">
          {(
            [
              ["mine", "我的待办", mineCount],
              ["unassigned", "待认领", unassignedCount],
              ["all", "全部待办", scopedTodos.length],
            ] as const
          ).map(([value, label, count]) => (
            <Button
              key={value}
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
        {/* 表格原先借用弱表面色；与外观页统一卡片和主次文字，交互时提升辅助文字对比度。 */}
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-card-border bg-card text-foreground">
          <table className="w-full min-w-[680px] table-fixed text-left">
            <colgroup>
              <col className="w-[30%]" />
              <col />
              <col className="w-[20%]" />
              <col className="w-14" />
            </colgroup>
            <thead className="bg-card text-ui-sm text-foreground">
              <tr>
                {["需求／开发任务", "待处理事项", "归属", "分工"].map((label, index) => (
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
                  data-aireq-motion-row=""
                  className="group/row border-b border-border/50 last:border-0 hover:bg-hover hover:[&_.text-foreground-subtle]:text-foreground focus-within:[&_.text-foreground-subtle]:text-foreground"
                >
                  <td data-aireq-motion-cell="" className="break-words px-4 py-3">
                    {/* 复用共享行反馈；标题与所属需求一起移动，元数据和操作列保持原位。 */}
                    <div>
                      {/* 用 SR 名称与父需求区分工作对象，避免内部 ID 挤占业务信息。 */}
                      <span className="font-medium">{item.srTitle ?? item.requirementTitle}</span>
                      {item.srId && (
                        <span className="block text-ui-sm text-foreground-subtle">
                          {item.requirementTitle}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="break-words px-4 py-3">
                    <Button
                      variant="ghost"
                      className="h-auto justify-start whitespace-normal break-words px-0 text-left hover:underline"
                      onClick={() => {
                        // 分析失败的待办需要到对应单 SR 重试位置，而非只显示失败报告。
                        if (item.kind === "analysis-failure")
                          ai.openAnalysis(item.selection, item.releaseId);
                        else ai.select(item.selection, item.releaseId);
                      }}
                      aria-label={`处理 ${todoObjectLabel(item)} · ${item.title}`}
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
                        {/* 分工是行内次操作，沿用其他表格的悬停／聚焦／展开显隐，避免每行常驻省略号。 */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="pointer-events-none size-8 rounded-lg text-foreground-subtle opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 hover:text-foreground focus-visible:pointer-events-auto focus-visible:text-foreground focus-visible:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100"
                          aria-label={`${todoObjectLabel(item)} · ${item.title} 的分工操作`}
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
                    <p className="font-medium text-foreground">{emptyTitle}</p>
                    <p className="mt-1 text-ui-sm">{emptyDescription}</p>
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
                分配会更新对应联系人或负责人。仅代办无需调整分工。
              </DialogDescription>
            </DialogHeader>
            {assigningTodo && (
              <div className="space-y-4">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-ui-sm">
                  <dt className="text-foreground-subtle">需求</dt>
                  <dd className="break-words">{assigningTodo.requirementTitle}</dd>
                  {assigningTodo.srId && (
                    <>
                      <dt className="text-foreground-subtle">开发单元</dt>
                      <dd className="break-words">{assigningTodo.srTitle ?? assigningTodo.srId}</dd>
                    </>
                  )}
                  <dt className="text-foreground-subtle">项目</dt>
                  <dd className="break-words">{projectName(assigningTodo.projectId)}</dd>
                  <dt className="text-foreground-subtle">编号</dt>
                  <dd className="break-words font-mono">
                    {assigningTodo.irId}
                    {assigningTodo.srId ? ` / ${assigningTodo.srId}` : ""}
                  </dd>
                  <dt className="text-foreground-subtle">调整分工</dt>
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
