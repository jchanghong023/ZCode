// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
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
  const employeeId = getEmployeeId();
  const todos = (ai.view?.todos ?? []).filter(
    (item) =>
      (!projectId || item.projectId === projectId) &&
      (filter === "all" || (filter === "mine" ? item.employeeId === employeeId : !item.employeeId)),
  );
  const assign = async (item: AIReqTodo, employee: string) => {
    if (pending) return;
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
    } catch (error) {
      ai.report(error);
    } finally {
      setPending(undefined);
    }
  };
  return (
    <main className="min-h-0 flex-1 overflow-auto text-ui-base [scrollbar-gutter:stable_both-edges]">
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} flex flex-col gap-4`}>
        <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>待办列表</h1>
        <p className="text-ui-sm text-foreground-subtle">
          跨项目工作流事实自动派生；完成实际业务动作后消失，不提供勾选完成。负责人不限制代办权限。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["mine", "我的待办"],
              ["unassigned", "待认领"],
              ["all", "全部"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={filter === value ? "secondary" : "outline"}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
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
          <span>{todos.length} 项</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <thead>
              <tr>
                {["项目／需求", "实际业务动作", "归属", "分工与定位"].map((label) => (
                  <th className="border-b border-border px-4 py-3 font-medium" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todos.map((item) => (
                <tr key={item.id} className="border-b border-border/50">
                  <td className="px-4 py-3">
                    {ai.view?.projects.find((project) => project.id === item.projectId)?.name ??
                      item.projectId}
                    <span className="block text-ui-sm text-foreground-subtle">
                      {item.irId}
                      {item.srId ? ` / ${item.srId}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {item.title}
                    {item.perspective && (
                      <span className="block font-medium">
                        {perspectiveLabels[item.perspective]}视角确认（独立动作）
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{item.employeeId ?? "未分配 · 待认领"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => ai.select(item.selection)}>
                        进入处理
                      </Button>
                      <Button
                        variant="outline"
                        disabled={Boolean(pending)}
                        onClick={() => void assign(item, employeeId)}
                      >
                        由我{item.employeeId ? "接手" : "认领"}
                      </Button>
                      <Input
                        aria-label={`分配 ${item.title} 工号`}
                        placeholder="负责人工号"
                        className="w-36"
                        value={assignees[item.id] ?? ""}
                        onChange={(event) =>
                          setAssignees((previous) => ({
                            ...previous,
                            [item.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        variant="outline"
                        disabled={
                          Boolean(pending) || !/^[a-z][0-9]{8}$/.test(assignees[item.id] ?? "")
                        }
                        onClick={() => void assign(item, assignees[item.id]!)}
                      >
                        分配
                      </Button>
                    </div>
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
      </div>
    </main>
  );
}
