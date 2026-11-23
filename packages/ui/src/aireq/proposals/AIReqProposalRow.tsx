import { useLayoutEffect, useRef } from "react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import { type AIReqRequirementGroup, hasProjectRole } from "../contract.js";
import { getEmployeeId } from "../identity.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";

export function AIReqProposalRow({ item, zh }: { item: AIReqRequirementGroup; zh: boolean }) {
  const ai = useAIReq()!;
  const { open, isOpen, activeTab } = useAIReqSidePane();
  const selection = { projectId: item.projectId, irId: item.id };
  const documentsOpen =
    isOpen &&
    activeTab?.selection.projectId === item.projectId &&
    activeTab.selection.irId === item.id &&
    activeTab.releaseId === item.releaseId;
  const focusDocuments = useRef(false);
  useLayoutEffect(() => {
    if (!documentsOpen || !activeTab || !focusDocuments.current) return;
    focusDocuments.current = false;
    document.getElementById(`aireq-tab-${activeTab.id}`)?.focus();
  }, [activeTab, documentsOpen]);
  const employee = getEmployeeId();
  const canUseSolution =
    hasProjectRole(ai.view, item.projectId, employee, "development") ||
    hasProjectRole(ai.view, item.projectId, employee, "testing");
  const version = item.documentVersion;
  const versionStatus = version?.confirmation
    ? zh
      ? "已确认"
      : "Confirmed"
    : zh
      ? "未确认"
      : "Unconfirmed";
  const noDocuments = zh ? "暂无文档" : "No documents";
  const requirementsLabel = zh ? "需求 Agent" : "Requirements Agent";
  const solutionLabel = zh ? "方案 Agent" : "Solution Agent";
  const documentsLabel = zh ? "查看文档" : "View documents";
  const solutionHint = zh
    ? "仅项目开发和测试可进入"
    : "Available to project developers and testers";
  const solutionButton = (
    <Button
      size="sm"
      variant="outline"
      data-aireq-proposal-entry={item.id}
      data-aireq-agent="solution"
      aria-label={`${solutionLabel} · ${item.title}`}
      aria-disabled={!canUseSolution || undefined}
      aria-description={!canUseSolution ? solutionHint : undefined}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      onClick={
        canUseSolution
          ? () => ai.select({ ...selection, discussionPhase: "solution" }, item.releaseId)
          : undefined
      }
    >
      {solutionLabel}
    </Button>
  );
  const date = (
    <time dateTime={item.createdAt} title={zh ? "北京时间" : "Beijing time"}>
      {new Date(item.createdAt).toLocaleString(zh ? "zh-CN" : "en-US", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}
    </time>
  );
  return (
    <tr
      role="row"
      data-aireq-motion-row=""
      className="group/row border-b border-border/50 hover:bg-hover @max-[520px]/conversation:grid"
    >
      <td
        role="cell"
        data-aireq-motion-cell=""
        className="min-w-0 px-4 py-3 @max-[520px]/conversation:pb-0"
      >
        <p className="line-clamp-2 wrap-anywhere font-semibold" title={item.title}>
          {item.title}
        </p>
        {item.originalText !== item.title && (
          <p
            className="mt-1 line-clamp-2 whitespace-pre-wrap wrap-anywhere text-ui-caption text-foreground-subtle group-hover/row:text-foreground"
            title={item.originalText}
          >
            {item.originalText}
          </p>
        )}
        <p className="mt-1 wrap-anywhere text-ui-sm text-foreground-subtle group-hover/row:text-foreground">
          {item.submittedBy} · {date}
        </p>
        <p className="mt-1 text-ui-sm text-foreground-subtle group-hover/row:text-foreground @min-[640px]/conversation:hidden">
          {version ? `V${version.number} · ${versionStatus}` : noDocuments}
        </p>
      </td>
      <td
        role="cell"
        className="hidden px-4 py-3 text-ui-caption @min-[640px]/conversation:table-cell"
      >
        {version ? (
          <>
            <span className="font-medium tabular-nums">V{version.number}</span>
            <span className="block text-foreground-subtle group-hover/row:text-foreground">
              {versionStatus}
            </span>
          </>
        ) : (
          noDocuments
        )}
      </td>
      <td
        role="cell"
        className="px-3 py-3 @max-[520px]/conversation:px-4 @min-[640px]/conversation:px-4"
      >
        <div className="flex flex-wrap items-center justify-end gap-1.5 @max-[520px]/conversation:justify-start">
          <Button
            size="sm"
            variant="secondary"
            data-aireq-proposal-entry={item.id}
            data-aireq-agent="requirements"
            aria-label={`${requirementsLabel} · ${item.title}`}
            onClick={() =>
              ai.select({ ...selection, discussionPhase: "requirements" }, item.releaseId)
            }
          >
            {requirementsLabel}
          </Button>
          {canUseSolution ? (
            solutionButton
          ) : (
            <ControlHintTooltip title={solutionHint}>{solutionButton}</ControlHintTooltip>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${documentsLabel} · ${item.title}`}
            aria-controls="aireq-document-workspace"
            aria-expanded={documentsOpen}
            onClick={(event) => {
              // 先保留行入口；右侧文档宿主用焦点的来源处理收起回焦。
              event.currentTarget.focus({ preventScroll: true });
              focusDocuments.current = true;
              open({ selection, releaseId: item.releaseId, title: item.title });
            }}
          >
            {documentsLabel}
          </Button>
        </div>
      </td>
    </tr>
  );
}
