import { useLayoutEffect, useRef } from "react";
import { FileText } from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import { type AIReqRequirementGroup, hasProjectRole } from "../contract.js";
import { getEmployeeId } from "../identity.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import { AIReqCopyDocumentLinkButton } from "./AIReqCopyDocumentLinkButton.js";
import { AIReqProposalText } from "./AIReqProposalText.js";

export function AIReqProposalRow({
  item,
  search,
  zh,
}: {
  item: AIReqRequirementGroup;
  search: string;
  zh: boolean;
}) {
  const ai = useAIReq()!;
  const { open, isOpen, activeTab } = useAIReqSidePane();
  const selection = { projectId: item.projectId, irId: item.id };
  const documentsOpen =
    isOpen &&
    activeTab?.selection.projectId === item.projectId &&
    activeTab.selection.irId === item.id &&
    activeTab.releaseId === item.releaseId;
  const rowRef = useRef<HTMLTableRowElement>(null);
  const focusDocuments = useRef(false);
  useLayoutEffect(() => {
    if (!documentsOpen || !activeTab || !focusDocuments.current) return;
    focusDocuments.current = false;
    document.getElementById(`aireq-tab-${activeTab.id}`)?.focus({ preventScroll: true });
    if (rowRef.current) return revealAfterPaneLayout(rowRef.current);
  }, [activeTab, documentsOpen]);
  const employee = getEmployeeId();
  const canUseSolution =
    hasProjectRole(ai.view, item.projectId, employee, "development") ||
    hasProjectRole(ai.view, item.projectId, employee, "testing");
  const version = item.documentVersion;
  const confirmation = version?.confirmation;
  const previousConfirmed = version && !confirmation ? item.documentHistory.at(-1) : undefined;
  const versionStatus = confirmation
    ? zh
      ? "已定版"
      : "Confirmed"
    : zh
      ? "未定版"
      : "Unconfirmed";
  const noDocuments = zh ? "暂无文档" : "No documents";
  const requirementsLabel = zh ? "讨论需求" : "Discuss requirements";
  const solutionLabel = zh ? "讨论方案" : "Discuss solution";
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
  const locale = zh ? "zh-CN" : "en-US";
  const timeZone = "Asia/Shanghai";
  const submittedAt = new Date(item.createdAt).toLocaleString(locale, { timeZone, hour12: false });
  const confirmedAt = confirmation ? new Date(confirmation.confirmedAt) : undefined;
  const versionSummary = (
    <div className="space-y-1">
      <p className="wrap-anywhere">
        {version ? (
          <>
            <span className="font-medium tabular-nums">V{version.number}</span>
            {` · ${versionStatus}`}
          </>
        ) : (
          noDocuments
        )}
      </p>
      {confirmation && confirmedAt && (
        <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-ui-sm text-foreground-subtle group-hover/row:text-foreground group-aria-[current=true]/row:text-foreground">
          <span className="whitespace-nowrap">
            {zh ? "确认人" : "Confirmed by"} {confirmation.employeeId}
          </span>
          <time
            dateTime={confirmation.confirmedAt}
            title={`${confirmedAt.toLocaleString(locale, { timeZone, hour12: false })} · ${zh ? "北京时间" : "Beijing time"}`}
            className="whitespace-nowrap tabular-nums"
          >
            {confirmedAt.toLocaleString(locale, {
              timeZone,
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </time>
        </p>
      )}
      {previousConfirmed && (
        <p className="text-ui-sm text-foreground-subtle group-hover/row:text-foreground group-aria-[current=true]/row:text-foreground">
          {zh ? "上次定版" : "Last confirmed"}{" "}
          <span className="tabular-nums">V{previousConfirmed.number}</span>
        </p>
      )}
    </div>
  );
  return (
    <tr
      ref={rowRef}
      role="row"
      aria-current={documentsOpen || undefined}
      data-aireq-motion-row=""
      className={`group/row border-b border-border/50 @max-[520px]/conversation:grid ${documentsOpen ? "bg-selected inset-shadow-[2px_0_var(--color-foreground-subtle)]" : "hover:bg-hover"}`}
    >
      <td
        role="cell"
        data-aireq-motion-cell=""
        className="min-w-0 px-4 py-3 @max-[520px]/conversation:pb-0"
      >
        <AIReqProposalText item={item} search={search} submittedAt={submittedAt} zh={zh} />
        <div className="mt-2 text-ui-caption @min-[640px]/conversation:hidden">
          {versionSummary}
        </div>
      </td>
      <td
        role="cell"
        className="hidden px-4 py-3 text-ui-caption @min-[640px]/conversation:table-cell"
      >
        {versionSummary}
      </td>
      <td
        role="cell"
        className="px-3 py-3 @max-[520px]/conversation:px-4 @min-[640px]/conversation:px-4"
      >
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 @max-[520px]/conversation:justify-start">
          <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5 @max-[520px]/conversation:justify-start">
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
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
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
              <FileText aria-hidden="true" />
              {documentsLabel}
            </Button>
            <AIReqCopyDocumentLinkButton
              workDirectory={
                ai.view?.projects.find((project) => project.id === item.projectId)?.workDirectory
              }
              title={item.title}
              zh={zh}
            />
          </div>
        </div>
      </td>
    </tr>
  );
}

function revealAfterPaneLayout(row: HTMLTableRowElement) {
  const table = row.closest("table");
  const scrollport = table?.parentElement;
  if (!table || !scrollport || !["auto", "scroll"].includes(getComputedStyle(scrollport).overflowY))
    return;

  const controller = new AbortController();
  let frame = 0;
  const cancel = () => {
    controller.abort();
    cancelAnimationFrame(frame);
  };
  for (const event of ["wheel", "pointerdown", "keydown"]) {
    scrollport.addEventListener(event, cancel, { passive: true, signal: controller.signal });
  }

  const reveal = () => {
    if (controller.signal.aborted) return;
    cancel();
    if (!row.isConnected || row.closest("[hidden], [inert]")) return;
    const header = table.tHead;
    const stickyBottom =
      header && getComputedStyle(header).position === "sticky"
        ? header.getBoundingClientRect().bottom
        : 0;
    const viewportTop = scrollport.getBoundingClientRect().top + scrollport.clientTop;
    const top = Math.max(viewportTop, stickyBottom);
    const bottom = viewportTop + scrollport.clientHeight;
    const rect = row.getBoundingClientRect();
    if (rect.top < top || rect.height > bottom - top) {
      scrollport.scrollBy({ top: rect.top - top, behavior: "instant" });
    } else if (rect.bottom > bottom) {
      scrollport.scrollBy({ top: rect.bottom - bottom, behavior: "instant" });
    }
  };

  // 右栏宿主在下一帧调整面板尺寸。等布局写入及实际宽度过渡完成后，只定位一次表格内部。
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      const panels = row
        .closest("[data-panel]")
        ?.parentElement?.querySelectorAll(":scope > [data-panel]");
      const transitions = Array.from(panels ?? []).flatMap((panel) =>
        panel
          .getAnimations()
          .filter(
            (animation) =>
              animation instanceof CSSTransition && animation.transitionProperty === "flex-grow",
          ),
      );
      void Promise.allSettled(transitions.map((transition) => transition.finished)).then(reveal);
    });
  });
  return cancel;
}
