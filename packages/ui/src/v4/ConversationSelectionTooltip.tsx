import { SelectionActionMenu } from "@/v4/SelectionActionMenu.js";
import {
  ConversationAnnotationMarks,
  annotationVariant,
  describeSelectionTextAnchor,
  useConversationAnnotationScope,
  type AnnotationMarkItem,
} from "@/selection-comment/index.js";
import { useTextSelection } from "@/hooks/useTextSelection.js";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ConversationRow } from "@zcode/shared/zcode-protocol-v4";
import {
  createConversationSelectionReference,
  setHoveredConversationAnnotation,
  subscribeHoveredConversationAnnotation,
  type ConversationSelectionContentType,
  type ConversationSelectionReference,
} from "@/lib/conversationSelectionReference.js";
import {
  guardConversationSelectionCandidate,
  hasExcludedConversationSelectionEndpoint,
} from "@/lib/conversationSelectionGuard.js";

interface TooltipState {
  center: number;
  bottom: number;
  top: number;
  reference?: ConversationSelectionReference;
  error?: "single";
}

const SELECTABLE_SELECTOR = "[data-conversation-selectable]";

function contentTypeForRow(row: ConversationRow): ConversationSelectionContentType | null {
  if (row.kind === "userInput") return "user";
  if (row.kind === "assistantText") return "assistant";
  if (row.kind === "reasoning") return "reasoning";
  if (row.kind === "toolCall") return "tool";
  return null;
}

const SUBAGENT_TOOL_NAMES = new Set(["Agent", "Task", "subagent"]);

/** Agent 工具行展示的是子 agent 的输出；引用带上 agent 类型，模型才能区分来源。 */
function subagentTypeForRow(
  row: ConversationRow,
  rows: readonly ConversationRow[],
): string | undefined {
  if (row.kind !== "toolCall" || !SUBAGENT_TOOL_NAMES.has(row.toolName)) return undefined;
  const subagent = rows.find(
    (candidate) =>
      candidate.kind === "subagent" &&
      candidate.turnId === row.turnId &&
      candidate.parentToolCallId === row.toolCallId,
  );
  if (subagent?.kind === "subagent" && subagent.subagentType) return subagent.subagentType;
  const input = row.input as { subagent_type?: unknown } | undefined;
  return typeof input?.subagent_type === "string" && input.subagent_type
    ? input.subagent_type
    : undefined;
}

function closestRowElement(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-row-id]") ?? null;
}

export function ConversationSelectionTooltip({
  rootRef,
  rows,
  sourceSessionId,
  enabled,
  annotationWorkspaceKey,
  onAddToCurrentTask,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  rows: readonly ConversationRow[];
  sourceSessionId: string;
  enabled: boolean;
  /** 主 composer 引用作用域的 workspaceKey；提供时正文画引用编号。 */
  annotationWorkspaceKey?: string;
  onAddToCurrentTask: (reference: ConversationSelectionReference) => void;
}) {
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const inspectSelection = useCallback((): TooltipState | null => {
    if (!enabled) return null;
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.isCollapsed || selection.rangeCount !== 1) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const startRow = closestRowElement(range.startContainer);
    const endRow = closestRowElement(range.endContainer);
    if (!startRow || !endRow) return null;
    const startElement =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const endElement =
      range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
    // 普通 Markdown 跨选到表格单元格时，Range.cloneContents() 会把 DOM 顺序中夹着的
    // select-none 表格工具栏按钮一并克隆，若据此判断会把合法正文误判为控件选区。控件门禁只看
    // Selection 两个端点；跨 row / selectable region 仍由下面的独立 guard 拒绝。
    const excluded = hasExcludedConversationSelectionEndpoint(startElement, endElement);
    const startContent = startElement?.closest(SELECTABLE_SELECTOR);
    const endContent = endElement?.closest(SELECTABLE_SELECTOR);
    const rowId = Number(startRow.dataset.rowId);
    const row = rowsRef.current.find((candidate) => candidate.rowId === rowId);
    const contentType = row ? contentTypeForRow(row) : null;
    const text = selection.toString().trim();
    const rect = range.getBoundingClientRect();
    const guardResult = guardConversationSelectionCandidate({
      enabled,
      sameRow: startRow === endRow,
      insideTimeline: root.contains(startRow),
      excluded,
      sameSelectableRegion: Boolean(
        startContent && startContent === endContent && startRow.contains(startContent),
      ),
      supportedContent: contentType !== null,
      text,
      hasLayout: rect.width > 0 || rect.height > 0,
    });
    if (guardResult === "ineligible" || !contentType) return null;
    const position = {
      center: rect.left + rect.width / 2,
      top: rect.top,
      bottom: rect.bottom,
    };
    if (guardResult === "single-limit") {
      return { ...position, error: "single" };
    }
    const agent = row ? subagentTypeForRow(row, rowsRef.current) : undefined;
    // 记下选区在来源行里的偏移，正文才能在同一处画注释标记；同一句话出现多次时不会画错位置。
    const anchor = describeSelectionTextAnchor(range, startRow);
    return {
      ...position,
      reference: createConversationSelectionReference({
        sourceSessionId,
        sourceRowId: rowId,
        contentType,
        text,
        ...(agent ? { agent } : {}),
        ...(anchor ? { anchor } : {}),
      }),
    };
  }, [enabled, rootRef, sourceSessionId]);
  const { state, close } = useTextSelection({
    rootRef,
    enabled,
    inspect: inspectSelection,
    scopeKey: sourceSessionId,
  });

  const scopeKey = annotationWorkspaceKey ?? "";
  const { references, sent } = useConversationAnnotationScope(sourceSessionId, scopeKey);
  const annotationsVisible = Boolean(annotationWorkspaceKey);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useEffect(() => subscribeHoveredConversationAnnotation(setHoveredId), []);

  // 编号 = 在 composer 列表里的位置（每条注释只算一条，有无评论都编号），与 chip 列表一一对应。
  const markItems = useMemo((): AnnotationMarkItem[] => {
    if (!annotationsVisible) return [];
    const markKey = (item: Pick<AnnotationMarkItem, "rowId" | "anchor">) =>
      `${item.rowId}:${item.anchor.regionIndex}:${item.anchor.start}`;
    // 已发送标记：同一段原文被多次注释并发送时只保留最新一条，避免同一处叠两个气泡；
    // 编号按保留下来的顺序重排，只用于区分灰色标记之间的先后。
    const latestSent = new Map<string, AnnotationMarkItem>();
    for (const reference of sent) {
      if (reference.contentType === "markdown" || !reference.anchor) continue;
      if (reference.sourceSessionId !== sourceSessionId) continue;
      const item: AnnotationMarkItem = {
        id: `sent:${reference.id}`,
        number: 0,
        variant: annotationVariant(reference.comment, true),
        rowId: reference.sourceRowId,
        anchor: reference.anchor,
        text: reference.text,
      };
      latestSent.delete(markKey(item));
      latestSent.set(markKey(item), item);
    }
    const dedupedSent = [...latestSent.values()].map((item, index) => ({
      ...item,
      number: index + 1,
    }));
    const current: AnnotationMarkItem[] = [];
    references.forEach((reference, index) => {
      if (reference.contentType === "markdown" || !reference.anchor) return;
      if (reference.sourceSessionId !== sourceSessionId) return;
      current.push({
        id: reference.id,
        number: index + 1,
        variant: annotationVariant(reference.comment),
        rowId: reference.sourceRowId,
        anchor: reference.anchor,
        text: reference.text,
      });
    });
    // 当前注释盖住同一处的已发送标记：同一段再次注释时只显示当前那条。
    const currentKeys = new Set(current.map(markKey));
    return [...dedupedSent.filter((item) => !currentKeys.has(markKey(item))), ...current];
  }, [annotationsVisible, references, sent, sourceSessionId]);

  const marks = annotationsVisible ? (
    <ConversationAnnotationMarks
      rootRef={rootRef}
      items={markItems}
      hoveredId={hoveredId}
      onHover={setHoveredConversationAnnotation}
    />
  ) : null;

  return (
    <>
      {marks}
      {state ? (
        <SelectionActionMenu
          center={state.center}
          top={state.top}
          bottom={state.bottom}
          singleLimit={Boolean(state.error)}
          onAddToCurrentTask={() => {
            if (state.reference) onAddToCurrentTask(state.reference);
            close();
          }}
        />
      ) : null}
    </>
  );
}
