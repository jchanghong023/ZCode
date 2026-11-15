import type { ReactNode } from "react";
import { Label } from "@/components/ui/label.js";
import { Badge } from "@/components/ui/badge.js";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select.js";
import {
  MarkdownTableBody,
  MarkdownTableHead,
  MarkdownTableHeader,
  MarkdownTableRow,
} from "@/components/ai-elements/markdown-table.js";
import { ISSUE_STATUSES, type AIReqIssue, type AIReqIssueScope } from "../../contract.js";
import { useAIReq } from "../../AIReqContext.js";
import type { IssuePage } from "../contract.js";

export const pageLabels = {
  issueCreate: "新建 Issue",
  issueAnalysis: "Issue 分析",
  issueProgress: "Issue 进度",
};
export const priorityLabels = { high: "高", normal: "中", low: "低" };
const pageDescriptions = {
  issueCreate: "记录问题与完成标准，分配开发人员后独立跟踪。",
  issueAnalysis: "查看分析任务和历史报告，跟踪代码变化与遗留问题。",
  issueProgress: "查看开发进度、分析报告与待确认事项。",
};
export const time = (value?: string) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
export const cell = "px-3 py-3 text-left align-middle";

export function IssuePageHeading({ page, scope }: { page: IssuePage; scope: AIReqIssueScope }) {
  const aireq = useAIReq()!;
  const project = aireq.view?.projects.find((item) => item.id === scope.projectId);
  return (
    <header className="space-y-2">
      {/* 修复：与自动化共用页面标题字阶，避免跨业务页切换时层级突变。 */}
      <h1 className="text-ui-page-title font-medium tracking-[0.114px]">{pageLabels[page]}</h1>
      <p className="text-ui-base leading-6 text-foreground-subtle">{pageDescriptions[page]}</p>
      {page !== "issueCreate" && (
        <p className="text-ui-sm text-foreground-subtle">{project?.name ?? "未选择项目"}</p>
      )}
    </header>
  );
}

export function IssueSelect({
  id,
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}
export function IssueStatus({ issue }: { issue: AIReqIssue }) {
  const color =
    issue.status === "completed"
      ? "bg-success-surface text-success-surface-foreground"
      : issue.status === "developing"
        ? "bg-progress-surface text-progress-surface-foreground"
        : issue.status === "pending"
          ? "bg-tag text-foreground"
          : "bg-warning-surface text-warning-surface-foreground";
  return (
    <Badge variant="secondary" className={`whitespace-nowrap font-normal ${color}`}>
      {ISSUE_STATUSES[issue.status]}
    </Badge>
  );
}
export function IssueTable({
  headings,
  children,
  columns,
  label = "Issue 列表",
}: {
  headings: string[];
  children: ReactNode;
  columns: string[];
  label?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-border outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
    >
      <table className="w-full min-w-[800px] table-fixed text-ui-base">
        <colgroup>
          {columns.map((width, index) => (
            <col key={index} className={width} />
          ))}
        </colgroup>
        <MarkdownTableHeader>
          <MarkdownTableRow>
            {headings.map((heading) => (
              <MarkdownTableHead
                key={heading}
                className={`${cell} whitespace-nowrap font-medium text-foreground-subtle`}
              >
                {heading}
              </MarkdownTableHead>
            ))}
          </MarkdownTableRow>
        </MarkdownTableHeader>
        <MarkdownTableBody>{children}</MarkdownTableBody>
      </table>
    </div>
  );
}

export interface MutationProps {
  pending: boolean;
  mutationError?: string;
  mutate(action: () => Promise<void>, success: string): Promise<void>;
}
