import { useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDown,
  CircleCheck,
  Ellipsis,
  FileSearch,
  FileText,
  MessagesSquare,
} from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { Button } from "@/components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqRequirementGroup } from "../contract.js";
import { primaryDiscussionAgent } from "../proposalRoutes.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import { AIReqCopyDocumentLinkButton } from "./AIReqCopyDocumentLinkButton.js";
import { AIReqProposalDetails, AIReqProposalText } from "./AIReqProposalText.js";
import {
  proposalColumns,
  proposalDate,
  proposalDwellTime,
  proposalPerson,
  proposalProcessLabel,
  type ProposalColumn,
} from "./proposalColumns.js";

// Layer translucent row states over the card surface so pinned cells cover scrolling columns.
const pinnedSurface =
  "bg-card [background-image:linear-gradient(var(--pinned-tint,transparent),var(--pinned-tint,transparent))]";
const pinnedIdentity =
  "first:@min-[760px]/conversation:sticky first:@min-[760px]/conversation:left-0 first:@min-[760px]/conversation:z-10 first:@min-[760px]/conversation:bg-card first:@min-[760px]/conversation:[background-image:linear-gradient(var(--pinned-tint,transparent),var(--pinned-tint,transparent))]";

export function AIReqProposalRow({
  item,
  columns,
  showIdInTitle,
  showOwnerInTitle,
  releaseTitle,
  search,
  now,
  zh,
}: {
  item: AIReqRequirementGroup;
  columns: ProposalColumn[];
  showIdInTitle: boolean;
  showOwnerInTitle: boolean;
  releaseTitle: string;
  search: string;
  now: number;
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
  const actionTrigger = useRef<HTMLButtonElement>(null);
  const openingDocumentsFromMenu = useRef(false);
  useLayoutEffect(() => {
    if (!documentsOpen || !activeTab || !focusDocuments.current) return;
    focusDocuments.current = false;
    document.getElementById(`aireq-tab-${activeTab.id}`)?.focus({ preventScroll: true });
    if (rowRef.current) return revealAfterPaneLayout(rowRef.current);
  }, [activeTab, documentsOpen]);
  const primaryAgent = primaryDiscussionAgent(item);
  const hasAlternateSolution =
    primaryAgent === "requirements" &&
    item.sessions.some((session) => session.phase === "solution");
  const requirementsLabel = zh ? "讨论需求" : "Discuss requirements";
  const solutionLabel = zh ? "讨论方案" : "Discuss solution";
  const primaryLabel = primaryAgent === "solution" ? solutionLabel : requirementsLabel;
  const documentsLabel = zh ? "查看文档" : "View documents";
  const detailsLabel = zh ? "查看需求详情" : "View requirement details";
  const moreLabel = zh ? "更多操作" : "More actions";
  const locale = zh ? "zh-CN" : "en-US";
  function discussPrimary() {
    if (primaryAgent) ai.select({ ...selection, discussionPhase: primaryAgent });
  }
  function openDocuments(trigger: HTMLButtonElement) {
    trigger.focus({ preventScroll: true });
    focusDocuments.current = true;
    open({ selection, releaseId: item.releaseId, title: item.title });
  }
  return (
    <tr
      ref={rowRef}
      role="row"
      aria-current={documentsOpen || undefined}
      data-aireq-motion-row=""
      className="group/row border-b border-border/60 last:border-b-0 hover:bg-hover hover:[--pinned-tint:var(--color-hover)] aria-[current=true]:bg-selected aria-[current=true]:[--pinned-tint:var(--color-selected)]"
    >
      {columns.map((column) =>
        column === "title" ? (
          <th
            key={column}
            scope="row"
            data-aireq-motion-cell=""
            data-pinned={columns[0] === column ? "start" : undefined}
            className={`min-w-0 px-3 py-2.5 font-normal first:pl-4 ${pinnedIdentity}`}
          >
            <AIReqProposalText item={item} search={search} zh={zh} />
            {showIdInTitle && (
              <p className="mt-1 wrap-anywhere font-mono text-ui-sm text-foreground-subtle">
                {item.id}
              </p>
            )}
            {showOwnerInTitle && (
              <p className="mt-1 wrap-anywhere text-ui-sm text-foreground-subtle">
                {zh ? "当前责任人" : "Current owner"} · {proposalPerson(item, "owner") || "—"}
              </p>
            )}
          </th>
        ) : (
          <td
            key={column}
            data-pinned={column === "id" && columns[0] === column ? "start" : undefined}
            className={`min-w-0 px-3 py-2.5 text-ui-caption wrap-anywhere text-foreground-subtle first:pl-4 group-hover/row:text-foreground group-aria-[current=true]/row:text-foreground ${column === "id" ? pinnedIdentity : ""} ${proposalColumns[column].group === "number" ? "text-right tabular-nums" : ""}`}
          >
            <RequirementCell
              column={column}
              item={item}
              releaseTitle={releaseTitle}
              now={now}
              zh={zh}
              locale={locale}
            />
          </td>
        ),
      )}
      <td role="presentation" aria-hidden="true" />
      <td
        data-pinned="end"
        className={`sticky right-0 z-10 border-l border-border px-3 py-2 @max-[620px]/conversation:px-0 ${pinnedSurface}`}
      >
        <div className="flex items-center justify-end gap-1 @max-[620px]/conversation:justify-center">
          {!columns.includes("title") && (
            <AIReqProposalDetails item={item} zh={zh}>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="@max-[620px]/conversation:hidden"
                title={detailsLabel}
                aria-label={`${detailsLabel} · ${item.title}`}
              >
                <FileSearch aria-hidden="true" />
              </Button>
            </AIReqProposalDetails>
          )}
          {primaryAgent && (
            <Button
              type="button"
              variant="secondary"
              data-aireq-proposal-entry={item.id}
              data-aireq-theme-discuss
              data-aireq-agent={primaryAgent}
              aria-label={`${primaryLabel} · ${item.title}`}
              className="@max-[620px]/conversation:hidden"
              onClick={discussPrimary}
            >
              {zh ? primaryLabel : "Discuss"}
            </Button>
          )}
          <ControlHintTooltip title={documentsLabel}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`${documentsLabel} · ${item.title}`}
              aria-controls="aireq-document-workspace"
              aria-expanded={documentsOpen}
              className="@max-[620px]/conversation:hidden"
              onClick={(event) => openDocuments(event.currentTarget)}
            >
              <FileText aria-hidden="true" />
            </Button>
          </ControlHintTooltip>
          <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
            <PopoverTrigger asChild>
              <Button
                ref={actionTrigger}
                type="button"
                size="icon"
                variant="ghost"
                data-aireq-proposal-entry={item.id}
                data-aireq-agent={hasAlternateSolution ? "solution" : primaryAgent}
                aria-label={`${moreLabel} · ${item.title}`}
                title={moreLabel}
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              aria-label={moreLabel}
              className="w-60 gap-0.5 p-1.5"
              onCloseAutoFocus={(event) => {
                if (!openingDocumentsFromMenu.current) return;
                openingDocumentsFromMenu.current = false;
                event.preventDefault();
                if (actionTrigger.current) openDocuments(actionTrigger.current);
              }}
            >
              {hasAlternateSolution && (
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  aria-label={`${solutionLabel} · ${item.title}`}
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setActionsOpen(false);
                    ai.select({ ...selection, discussionPhase: "solution" });
                  }}
                >
                  <MessagesSquare aria-hidden="true" />
                  {solutionLabel}
                </Button>
              )}
              {primaryAgent && (
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setActionsOpen(false);
                    discussPrimary();
                  }}
                >
                  <MessagesSquare aria-hidden="true" />
                  {primaryLabel}
                </Button>
              )}
              <Button
                type="button"
                size="lg"
                variant="ghost"
                className="w-full justify-start gap-2"
                onClick={() => {
                  openingDocumentsFromMenu.current = true;
                  setActionsOpen(false);
                }}
              >
                <FileText aria-hidden="true" />
                {documentsLabel}
              </Button>
              <AIReqProposalDetails item={item} zh={zh}>
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  className="w-full justify-start gap-2"
                >
                  <FileSearch aria-hidden="true" />
                  {detailsLabel}
                </Button>
              </AIReqProposalDetails>
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

function RequirementCell({
  column,
  item,
  releaseTitle,
  now,
  zh,
  locale,
}: {
  column: Exclude<ProposalColumn, "title">;
  item: AIReqRequirementGroup;
  releaseTitle: string;
  now: number;
  zh: boolean;
  locale: string;
}) {
  switch (column) {
    case "id":
      return (
        <span title={item.id} className="block truncate font-mono text-ui-sm">
          {item.id}
        </span>
      );
    case "release":
      return (
        <span title={releaseTitle} className="line-clamp-2">
          {releaseTitle}
        </span>
      );
    case "owner":
    case "requester":
    case "designOwner":
    case "developmentOwner":
    case "testingOwner": {
      const person = proposalPerson(item, column);
      return (
        <span title={person} className="block truncate">
          {person || "—"}
        </span>
      );
    }
    case "version":
      return <DocumentVersion item={item} zh={zh} locale={locale} />;
    case "submitter":
      return <span className="font-mono">{item.submittedBy || "—"}</span>;
    case "date":
      return <ProposalDateCell value={item.createdAt} zh={zh} locale={locale} />;
    case "estimatedWorkloadManday": {
      const estimate = item.cloudFields?.estimatedWorkloadManday;
      const total = item.cloudFields?.sumWorkloadManday;
      if (estimate === undefined && total === undefined) return "—";
      return (
        <span className="tabular-nums">
          {String(estimate ?? "—")} | {String(total ?? "—")}{" "}
          <span className="text-ui-sm">{zh ? "人天" : "person-days"}</span>
        </span>
      );
    }
    case "process":
      return item.process ? (
        <span data-aireq-theme-stage={item.process}>{proposalProcessLabel(item.process, zh)}</span>
      ) : (
        "—"
      );
    case "dwellTime": {
      const elapsed = proposalDwellTime(item, now);
      if (elapsed === undefined) return "—";
      const minutes = Math.floor(elapsed / 60_000);
      const format = (value: number, unit: string, unitZh: string) =>
        zh ? `${value} ${unitZh}` : `${value} ${unit}`;
      const label =
        minutes >= 1440
          ? format(Math.floor(minutes / 1440), "d", "天")
          : minutes >= 60
            ? format(Math.floor(minutes / 60), "h", "小时")
            : minutes > 0
              ? format(minutes, "min", "分钟")
              : zh
                ? "少于 1 分钟"
                : "<1 min";
      return (
        <span
          className="tabular-nums"
          title={zh ? "从进入当前进展起算" : "Elapsed time in the current status"}
        >
          {label}
        </span>
      );
    }
    case "srCount":
      return <span className="tabular-nums">{item.srIds.length}</span>;
    default: {
      const value = item.cloudFields?.[column];
      if (value === undefined) return "—";
      if (proposalColumns[column].group === "date")
        return <ProposalDateCell value={value} zh={zh} locale={locale} />;
      const text = Array.isArray(value)
        ? value.join("、")
        : typeof value === "boolean"
          ? value
            ? zh
              ? "是"
              : "Yes"
            : zh
              ? "否"
              : "No"
          : String(value);
      return (
        <span title={text} className="line-clamp-2">
          {text}
        </span>
      );
    }
  }
}

function ProposalDateCell({
  value,
  zh,
  locale,
}: {
  value: string | number | boolean | string[];
  zh: boolean;
  locale: string;
}) {
  const timestamp = proposalDate(value);
  if (timestamp === undefined) return value === "" ? "—" : String(value);
  const date = new Date(timestamp);
  const display = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? date.toLocaleDateString(locale, { timeZone: "Asia/Shanghai" })
    : date.toLocaleString(locale, { timeZone: "Asia/Shanghai", hour12: false });
  return (
    <time
      dateTime={date.toISOString()}
      className="tabular-nums"
      title={zh ? "北京时间" : "Beijing time"}
    >
      {display}
    </time>
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
