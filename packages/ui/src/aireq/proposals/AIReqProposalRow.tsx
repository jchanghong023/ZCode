import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, CircleCheck, Ellipsis, FileText, MessagesSquare } from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { Button } from "@/components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { useAIReq } from "../AIReqContext.js";
import { type AIReqRequirementGroup, hasProjectRole } from "../contract.js";
import { getEmployeeId } from "../identity.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import { AIReqCopyDocumentLinkButton } from "./AIReqCopyDocumentLinkButton.js";
import { AIReqProposalText } from "./AIReqProposalText.js";

export function AIReqProposalRow({
  item,
  releaseTitle,
  search,
  zh,
}: {
  item: AIReqRequirementGroup;
  releaseTitle: string;
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
  const [actionsOpen, setActionsOpen] = useState(false);
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
  const requirementsLabel = zh ? "讨论需求" : "Discuss requirements";
  const solutionLabel = zh ? "讨论方案" : "Discuss solution";
  const documentsLabel = zh ? "查看文档" : "View documents";
  const moreLabel = zh ? "更多操作" : "More actions";
  const solutionHint = zh
    ? "仅项目开发和测试可进入"
    : "Available to project developers and testers";
  const locale = zh ? "zh-CN" : "en-US";
  const submittedAt = new Date(item.createdAt).toLocaleString(locale, {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
  return (
    <tr
      ref={rowRef}
      role="row"
      aria-current={documentsOpen || undefined}
      data-aireq-motion-row=""
      className="group/row border-b border-border/60 last:border-b-0 hover:bg-hover aria-[current=true]:bg-selected @max-[760px]/conversation:flex @max-[760px]/conversation:flex-wrap @max-[760px]/conversation:items-center @max-[760px]/conversation:gap-x-4 @max-[760px]/conversation:gap-y-1.5 @max-[760px]/conversation:px-3 @max-[760px]/conversation:py-2.5"
    >
      <th
        role="rowheader"
        scope="row"
        data-aireq-motion-cell=""
        className="min-w-0 font-normal @max-[760px]/conversation:basis-full @min-[760px]/conversation:py-2.5 @min-[760px]/conversation:pr-3 @min-[760px]/conversation:pl-4"
      >
        <AIReqProposalText item={item} search={search} submittedAt={submittedAt} zh={zh} />
      </th>
      <td
        role="cell"
        className="min-w-0 font-mono text-ui-sm wrap-anywhere text-foreground-subtle group-hover/row:text-foreground group-aria-[current=true]/row:text-foreground @min-[760px]/conversation:py-2.5 @min-[760px]/conversation:pr-3"
      >
        {item.id}
      </td>
      <td
        role="cell"
        title={releaseTitle}
        className="min-w-0 max-w-full text-ui-caption wrap-anywhere text-foreground-subtle group-hover/row:text-foreground group-aria-[current=true]/row:text-foreground @min-[760px]/conversation:py-2.5 @min-[760px]/conversation:pr-3"
      >
        <span className="line-clamp-2">
          <span className="font-medium @min-[760px]/conversation:hidden">Release · </span>
          {releaseTitle}
        </span>
      </td>
      <td
        role="cell"
        className="min-w-0 text-ui-caption text-foreground-subtle group-hover/row:text-foreground group-aria-[current=true]/row:text-foreground @min-[760px]/conversation:py-2.5 @min-[760px]/conversation:pr-2"
      >
        <DocumentVersion item={item} zh={zh} locale={locale} />
      </td>
      <td
        role="cell"
        className="@max-[540px]/conversation:basis-full @min-[540px]/conversation:@max-[760px]/conversation:ml-auto @min-[760px]/conversation:py-2 @min-[760px]/conversation:pr-3"
      >
        <div className="flex items-center gap-1 @min-[540px]/conversation:justify-end">
          <Button
            type="button"
            variant="secondary"
            data-aireq-proposal-entry={item.id}
            data-aireq-agent="requirements"
            aria-label={`${requirementsLabel} · ${item.title}`}
            onClick={() => ai.select({ ...selection, discussionPhase: "requirements" })}
          >
            {zh ? requirementsLabel : "Discuss"}
          </Button>
          <ControlHintTooltip title={documentsLabel}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`${documentsLabel} · ${item.title}`}
              aria-controls="aireq-document-workspace"
              aria-expanded={documentsOpen}
              onClick={(event) => {
                // 右侧文档宿主使用焦点来源在收起时回焦。
                event.currentTarget.focus({ preventScroll: true });
                focusDocuments.current = true;
                open({ selection, releaseId: item.releaseId, title: item.title });
              }}
            >
              <FileText aria-hidden="true" />
            </Button>
          </ControlHintTooltip>
          <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                data-aireq-proposal-entry={item.id}
                data-aireq-agent="solution"
                aria-label={`${moreLabel} · ${item.title}`}
                title={moreLabel}
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" aria-label={moreLabel} className="w-60 gap-0.5 p-1.5">
              <Button
                type="button"
                size="lg"
                variant="ghost"
                aria-label={`${solutionLabel} · ${item.title}`}
                aria-disabled={!canUseSolution || undefined}
                aria-description={!canUseSolution ? solutionHint : undefined}
                className="w-full justify-start gap-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                onClick={() => {
                  if (!canUseSolution) return;
                  setActionsOpen(false);
                  ai.select({ ...selection, discussionPhase: "solution" });
                }}
              >
                <MessagesSquare aria-hidden="true" />
                {solutionLabel}
              </Button>
              {!canUseSolution && (
                <p className="px-2.5 pb-1 text-ui-sm text-foreground-subtle">{solutionHint}</p>
              )}
              <AIReqCopyDocumentLinkButton
                workDirectory={
                  ai.view?.projects.find((project) => project.id === item.projectId)?.workDirectory
                }
                title={item.title}
                zh={zh}
              />
            </PopoverContent>
          </Popover>
        </div>
      </td>
    </tr>
  );
}

function DocumentVersion({
  item,
  locale,
  zh,
}: {
  item: AIReqRequirementGroup;
  locale: string;
  zh: boolean;
}) {
  const version = item.documentVersion;
  if (!version) return zh ? "暂无文档" : "No documents";

  const confirmation = version.confirmation;
  const previousConfirmed = !confirmation ? item.documentHistory.at(-1) : undefined;
  const versionStatus = confirmation
    ? zh
      ? "已定版"
      : "Confirmed"
    : zh
      ? "未定版"
      : "Unconfirmed";
  const label = `V${version.number} · ${versionStatus}`;
  if (!confirmation && !previousConfirmed) return <span className="tabular-nums">{label}</span>;

  const detailsLabel = zh ? "定版记录" : "Confirmation details";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label} · ${detailsLabel} · ${item.title}`}
          className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-sm text-left tabular-nums hover:underline hover:underline-offset-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-input-border-focused"
        >
          {confirmation && (
            <CircleCheck
              className="size-3.5 shrink-0 text-success-surface-foreground"
              aria-hidden="true"
            />
          )}
          {label}
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={detailsLabel} className="w-64 gap-2 p-3">
        <p className="font-semibold tabular-nums">{label}</p>
        {confirmation ? (
          <div className="space-y-1 text-ui-caption text-foreground-subtle">
            <p>
              {zh ? "确认人" : "Confirmed by"} {confirmation.employeeId}
            </p>
            <p>
              <time dateTime={confirmation.confirmedAt} className="tabular-nums">
                {new Date(confirmation.confirmedAt).toLocaleString(locale, {
                  timeZone: "Asia/Shanghai",
                  hour12: false,
                })}
              </time>
              {zh ? "（北京时间）" : " (Beijing time)"}
            </p>
          </div>
        ) : (
          <p className="text-ui-caption text-foreground-subtle">
            {zh ? "上次定版" : "Last confirmed"} V{previousConfirmed?.number}
          </p>
        )}
      </PopoverContent>
    </Popover>
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
