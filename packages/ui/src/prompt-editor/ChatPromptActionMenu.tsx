import { ContextMentionOptionContent } from "@/mentions/components/ContextMentionOptionContent.js";
import { useFileMentionProvider } from "@/mentions/providers/fileMentionProvider.js";
import { useSessionsMentionProvider } from "@/mentions/providers/sessionsMentionProvider.js";
import {
  MENTION_FILES_ONLY_DEFAULT_PREVIEW_LIMIT,
  buildVisibleMentionGroups,
} from "@/mentions/mentionSearch.js";
import { getSessionMentionWorkspaceScope } from "@/mentions/mentionPanelRouting.js";
import { useChatViewActiveTaskProvider } from "@/v4/activeTaskProvider.js";
import { useMemo, useRef, useState, type MutableRefObject } from "react";
import type { EditorState } from "lexical";
import { Info, PaperclipIcon, PencilRuler, PlusIcon } from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { Button } from "@/components/ui/button.js";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import type { LexicalChatInputHandle } from "@/LexicalChatInput.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { MentionPanel, type MentionPanelSection } from "@/mentions/components/MentionPanel.js";

export interface ComposerDrawingAction {
  label: string;
  onSelect: () => void;
  disabled: boolean;
}

export function ChatPromptActionMenu({
  actionMenuTitle,
  attachmentAction,
  drawingAction,
  disabled,
  disabledReason,
  inputApiRef,
  workspacePath,
  workspaceIdentity,
  sessionId,
  container,
  showContext,
}: {
  actionMenuTitle: string;
  attachmentAction?: {
    label: string;
    onSelect: () => void;
    testId?: string;
    menuItemTestId?: string;
  };
  drawingAction?: ComposerDrawingAction;
  disabled?: boolean;
  disabledReason?: string;
  inputApiRef: MutableRefObject<LexicalChatInputHandle | null>;
  workspacePath: string;
  workspaceIdentity?: string;
  sessionId: string | null;
  container: HTMLElement | null;
  showContext: boolean;
}) {
  const { intl } = useZCodeIntl();
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectionStateRef = useRef<EditorState | undefined>(undefined);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreEditorFocusRef = useRef(false);
  const skipTriggerFocusRef = useRef(false);
  const anchorRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => container?.getBoundingClientRect() ?? new DOMRect(),
      },
    }),
    [container],
  );
  const provider = useChatViewActiveTaskProvider(sessionId, workspacePath, workspaceIdentity);
  const files = useFileMentionProvider(
    workspacePath,
    workspaceIdentity,
    "",
    open && !disabled && showContext && !drawingAction,
    intl.formatMessage({ id: "chat.mention.files.empty" }),
    intl.formatMessage({ id: "chat.mention.files.title" }),
    MENTION_FILES_ONLY_DEFAULT_PREVIEW_LIMIT,
  );
  const sessions = useSessionsMentionProvider(
    provider,
    workspacePath,
    workspaceIdentity,
    "",
    open && !disabled && showContext && !drawingAction,
    getSessionMentionWorkspaceScope("@"),
    intl.formatMessage({ id: "chat.mention.sessions.empty" }),
    intl.formatMessage({ id: "chat.mention.sessions.title" }),
  );
  const contextGroups = buildVisibleMentionGroups(
    [
      { id: "files", ...files },
      { id: "sessions", ...sessions },
    ].map((group) => ({
      ...group,
      errorText: group.error?.message ?? null,
    })),
  );
  const mentionItems = contextGroups.flatMap((group) => group.items);
  const attachmentCount = attachmentAction ? 1 : 0;
  const options = [
    ...(attachmentAction ? [{ disabled: false }] : []),
    ...mentionItems,
  ];
  const sections: MentionPanelSection[] = [
    {
      id: "add",
      title: intl.formatMessage({ id: "chat.composer.addSection" }),
      emptyText: "",
      options: [
        ...(attachmentAction
          ? [
              {
                id: "attach-files",
                label: attachmentAction.label,
                description: "",
                content: (
                  <>
                    <PaperclipIcon className="size-4 shrink-0" />
                    <span
                      className="truncate text-ui-base font-medium"
                      data-testid={attachmentAction.menuItemTestId}
                    >
                      {attachmentAction.label}
                    </span>
                  </>
                ),
              },
            ]
          : []),
      ],
    },
    ...contextGroups.map((group) => ({
      id: group.id,
      title: group.title,
      emptyText: group.emptyText,
      loading: group.loading,
      loadingText: intl.formatMessage({ id: "chat.mention.category.loading" }),
      errorText: group.errorText,
      options: group.items.map((item) => ({
        ...item,
        content: <ContextMentionOptionContent item={item} workspacePath={workspacePath} />,
      })),
    })),
  ].filter((section) => section.id !== "add" || section.options.length > 0);

  const selectOption = (index: number) => {
    if (disabled || !options[index] || options[index].disabled) return;
    setOpen(false);
    if (attachmentAction && index === 0) {
      attachmentAction.onSelect();
      return;
    }
    const item = mentionItems[index - attachmentCount];
    if (!item) return;
    restoreEditorFocusRef.current = true;
    inputApiRef.current?.insertMention(item, selectionStateRef.current);
  };

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(nextOpen) => {
        if (nextOpen && !drawingAction) {
          // 在打开时记下编辑器选区；点选引用后插回原位置。
          selectionStateRef.current = inputApiRef.current?.getEditorState();
          setSelectedIndex(0);
        }
        setOpen(nextOpen);
      }}
    >
      <ControlHintTooltip title={disabledReason ?? actionMenuTitle}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon-md"
            className="gap-1 rounded-lg text-ui-base"
            onMouseDown={(event) => event.preventDefault()}
            aria-label={actionMenuTitle}
            data-testid={attachmentAction?.testId}
            disabled={disabled}
            title={disabledReason}
          >
            <PlusIcon className="size-4" />
            <span className="sr-only">{actionMenuTitle}</span>
          </Button>
        </PopoverTrigger>
      </ControlHintTooltip>
      {drawingAction && attachmentAction ? (
        <PopoverContent
          align="start"
          side="top"
          // 关闭时立即卸载焦点范围，快速重开也会把焦点送到第一个选项。
          className="w-max min-w-36 gap-0.5 p-1 data-closed:animate-none!"
          aria-label={actionMenuTitle}
          onKeyDownCapture={(event) => {
            if (event.key !== "Tab") return;
            const actions = event.currentTarget.querySelectorAll("button:enabled");
            const boundary = event.shiftKey ? actions[0] : actions[actions.length - 1];
            if (event.target !== boundary) return;
            // 浮层挂在 body；从末项退出时先回到触发器，让浏览器按工具栏顺序继续移焦。
            event.stopPropagation();
            skipTriggerFocusRef.current = true;
            triggerRef.current?.focus();
            setOpen(false);
          }}
          onCloseAutoFocus={(event) => {
            if (!skipTriggerFocusRef.current) return;
            event.preventDefault();
            skipTriggerFocusRef.current = false;
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="justify-start"
            data-testid={attachmentAction.menuItemTestId}
            onClick={() => {
              setOpen(false);
              attachmentAction.onSelect();
            }}
          >
            <PaperclipIcon aria-hidden="true" />
            {intl.formatMessage({ id: "chat.attachments.add" })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="justify-start"
            disabled={drawingAction.disabled}
            onClick={() => {
              // 画图弹窗接管焦点；附件浮层关闭时不能再把焦点拉回加号。
              skipTriggerFocusRef.current = true;
              setOpen(false);
              drawingAction.onSelect();
            }}
          >
            <PencilRuler aria-hidden="true" />
            {drawingAction.label}
          </Button>
        </PopoverContent>
      ) : (
        <>
          {/* 默认按钮锚点在首次挂载时也会注册；自定义锚点必须随后注册，避免被即将卸载的旧按钮覆盖。 */}
          {container ? <PopoverAnchor virtualRef={anchorRef} /> : null}
          <PopoverContent
            ref={contentRef}
            align="start"
            side="top"
            sideOffset={0}
            // Radix 将虚拟锚点尺寸也写入 trigger-width；使用不存在的 anchor-width 会让虚拟列表塌缩。
            className="w-(--radix-popover-trigger-width) max-w-[calc(100vw-1rem)] gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none"
            tabIndex={-1}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              contentRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              if (restoreEditorFocusRef.current) {
                event.preventDefault();
                restoreEditorFocusRef.current = false;
                inputApiRef.current?.focus();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                event.stopPropagation();
                const delta = event.key === "ArrowDown" ? 1 : -1;
                for (let step = 1; step <= options.length; step++) {
                  const next = (selectedIndex + delta * step + options.length) % options.length;
                  if (!options[next]?.disabled) {
                    setSelectedIndex(next);
                    break;
                  }
                }
              } else if (event.key === "Enter" || event.key === "Tab" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                selectOption(selectedIndex);
              }
            }}
          >
            <MentionPanel
              title={actionMenuTitle}
              description=""
              listMaxHeight="min(24rem, max(8rem, calc(var(--radix-popover-content-available-height, 32rem) - 6rem)))"
              footer={
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-ui-sm text-foreground-subtle">
                  {(
                    [
                      ["@", "chat.composer.contextShortcut"],
                      ["/", "chat.composer.capabilityShortcut"],
                      ["$", "chat.composer.skillShortcut"],
                    ] as const
                  ).map(([trigger, id]) => (
                    <div key={trigger} className="flex shrink-0 items-center gap-1.5">
                      <code className="flex size-5 shrink-0 items-center justify-center rounded bg-tooltip-tag font-mono text-foreground">
                        {trigger}
                      </code>
                      <span>{intl.formatMessage({ id })}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <Info className="size-4 shrink-0" />
                    <span>{intl.formatMessage({ id: "chat.composer.contextSearchHint" })}</span>
                  </div>
                </div>
              }
              trigger="+"
              sections={sections}
              emptyText=""
              selectedIndex={selectedIndex}
              hasActiveQuery={false}
              onSelect={selectOption}
            />
          </PopoverContent>
        </>
      )}
    </Popover>
  );
}
