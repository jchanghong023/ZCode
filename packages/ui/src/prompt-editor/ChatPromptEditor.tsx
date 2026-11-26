/* oxlint-disable eslint(max-lines) -- 输入壳同时收口 Lexical 同步和工具栏插槽。 */
// 输入展示壳：纯 props 组件、无 store/协议依赖；mention 面板通过 enableMentionPanel 透传。
import type {
  KeyboardEventHandler,
  FormEventHandler,
  MutableRefObject,
  ReactNode,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TID_CHAT_SEND_BUTTON } from "@zcode/shared/test-ids";
import { ArrowUpIcon, XIcon } from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { Button } from "@/components/ui/button.js";
import { Spinner } from "@/components/ui/spinner.js";
import { cn } from "@/components/lib/utils.js";
import {
  LexicalChatInput,
  type ChatComposerPasteEvent,
  type LexicalChatInputHandle,
  type UserInputPresence,
} from "@/LexicalChatInput.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { ConversationCommandCatalogEntry } from "@zcode/shared/zcode-protocol-v4";
import {
  ChatPromptActionMenu,
  type ComposerDrawingAction,
} from "@/prompt-editor/ChatPromptActionMenu.js";
import { useComposerToolbarFit } from "@/prompt-editor/useComposerToolbarFit.js";

function runAfterFrame(callback: () => void) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }
  callback();
}

export function ChatPromptEditor({
  workspacePath,
  workspaceIdentity,
  taskId,
  skillCatalogSessionId,
  initialValue,
  syncInitialValueOnMount = true,
  placeholder,
  inputLabel,
  disabled = false,
  disabledReason,
  submitting = false,
  submitDisabled = false,
  allowSubmitWhenEmpty = false,
  enterSubmits = true,
  submitLabel,
  cancelLabel,
  showMentionButton = false,
  showSlashButton = false,
  topContent,
  inputLeadingContent,
  leadingActions,
  attachmentAction,
  drawingAction,
  betweenCancelAndSubmitAction,
  submitControl,
  inputTestId,
  submitTestId,
  cancelTestId,
  inputApiRef,
  onModeSwitchContainerChange,
  triggerPanelContainer,
  promptHistory,
  className,
  shellClassName,
  compactPlaceholder = false,
  onChange,
  onUserInputClear,
  onUserInputPresenceChange,
  onUserInputStart,
  onSubmit,
  onModifiedSubmit,
  onCancel,
  onFocus,
  onPaste,
  conversationCommands,
  extraPlugins,
  enableMentionPanel,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string | null;
  /** 仅供 Composer Skill catalog；可为草稿的 prewarm Session。 */
  skillCatalogSessionId?: string | null;
  initialValue?: string;
  syncInitialValueOnMount?: boolean;
  placeholder?: string;
  inputLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  allowSubmitWhenEmpty?: boolean;
  enterSubmits?: boolean;
  submitLabel: string;
  cancelLabel?: string;
  showMentionButton?: boolean;
  showSlashButton?: boolean;
  topContent?: ReactNode;
  /** 与输入正文同一行的前置内容；模型入口使用紧凑 Fast 标签。 */
  inputLeadingContent?: ReactNode;
  leadingActions?: ReactNode;
  attachmentAction?: {
    label: string;
    onSelect: () => void;
    testId?: string;
    menuItemTestId?: string;
  };
  drawingAction?: ComposerDrawingAction;
  /** 行内编辑专用：固定插在取消与主提交之间的第二动作。 */
  betweenCancelAndSubmitAction?: ReactNode;
  submitControl?: ReactNode;
  inputTestId?: string;
  submitTestId?: string;
  cancelTestId?: string;
  inputApiRef?: MutableRefObject<LexicalChatInputHandle | null>;
  onModeSwitchContainerChange?: (container: HTMLSpanElement | null) => void;
  triggerPanelContainer?: HTMLElement | null;
  promptHistory?: readonly string[];
  className?: string;
  shellClassName?: string;
  compactPlaceholder?: boolean;
  onChange?: (value: string) => void;
  onUserInputClear?: () => void;
  onUserInputPresenceChange?: (presence: UserInputPresence) => void;
  onUserInputStart?: () => void;
  // 适配：返回 false 表示业务层拒绝/延迟本次提交，Lexical 不自行 reset（草稿保留）。
  onSubmit: (value: string) => boolean | void;
  onModifiedSubmit?: (value: string) => boolean | void;
  onCancel?: () => void;
  onFocus?: () => void;
  onPaste?: (event: ChatComposerPasteEvent) => void;
  conversationCommands?: readonly ConversationCommandCatalogEntry[];
  /** mention 面板开关（透传 LexicalChatInput）。 */
  enableMentionPanel?: boolean;
  /** 额外挂进编辑器的 Lexical 插件（透传 LexicalChatInput）。 */
  extraPlugins?: ReactNode;
}) {
  const { intl } = useZCodeIntl();
  const toolbarRef = useComposerToolbarFit();
  const internalInputApiRef = useRef<LexicalChatInputHandle | null>(null);
  const resolvedInputApiRef = inputApiRef ?? internalInputApiRef;
  const [internalTriggerPanelContainer, setInternalTriggerPanelContainer] =
    useState<HTMLDivElement | null>(null);
  const resolvedTriggerPanelContainer = triggerPanelContainer ?? internalTriggerPanelContainer;
  const latestTextRef = useRef(initialValue ?? "");
  const hasSyncedInitialValueRef = useRef(false);
  const actionMenuTitle = intl.formatMessage({
    id: drawingAction ? "chat.composer.addSection" : "chat.composer.actionMenu",
  });
  const hasActionMenu =
    Boolean(attachmentAction) || (!drawingAction && (showMentionButton || showSlashButton));

  useEffect(() => {
    if (!syncInitialValueOnMount) {
      return;
    }
    if (initialValue === undefined) {
      return;
    }
    if (hasSyncedInitialValueRef.current) {
      return;
    }
    hasSyncedInitialValueRef.current = true;

    latestTextRef.current = initialValue;
    runAfterFrame(() => {
      // task 草稿恢复时外层 input state 已经更新，但 Lexical 内部文本不会自动跟随 props。
      // 同时普通打字也会更新 input prop，必须先比较当前编辑器文本，避免每个字符都程序化重写编辑器。
      if (resolvedInputApiRef.current?.getMarkdown() === initialValue) {
        return;
      }
      resolvedInputApiRef.current?.setText(initialValue);
    });
  }, [initialValue, resolvedInputApiRef, syncInitialValueOnMount]);

  const handleTextChange = useCallback(
    (value: string) => {
      latestTextRef.current = value;
      onChange?.(value);
    },
    [onChange],
  );

  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();
      onSubmit(resolvedInputApiRef.current?.getMarkdown() ?? latestTextRef.current);
    },
    [onSubmit, resolvedInputApiRef],
  );

  const handleKeyDown: KeyboardEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      if (event.key !== "Escape" || !onCancel || submitting) {
        return;
      }

      // Dialog 通过 React Portal 挂载时，Esc 关闭弹窗的事件仍会沿组件树
      // 冒泡到行内编辑 form；弹窗已消费这次交互，不能再把消息编辑一并取消。
      if (
        event.defaultPrevented ||
        (event.target instanceof Element && event.target.closest('[role="dialog"]'))
      ) {
        return;
      }

      // 交互说明：用户消息 edit 是临时编辑态，Esc 应等价于点击取消，方便键盘流快速退出。
      event.preventDefault();
      onCancel();
    },
    [onCancel, submitting],
  );

  const handleEditorSubmit = useCallback(
    // 适配：透传业务层返回值（false = 不 reset 编辑器，草稿保留），
    // 吞掉返回值会让 Enter 路径总是清空。
    (value: string) => onSubmit(value),
    [onSubmit],
  );

  const editorNode = (
    <div className="contents">
      <LexicalChatInput
        extraPlugins={extraPlugins}
        placeholder={placeholder}
        inputLabel={inputLabel ?? intl.formatMessage({ id: "chat.composer.inputLabel" })}
        disabled={disabled}
        submitDisabled={submitDisabled}
        allowSubmitWhenEmpty={allowSubmitWhenEmpty}
        enterSubmits={enterSubmits}
        onSubmit={handleEditorSubmit}
        onModifiedSubmit={onModifiedSubmit}
        onChange={handleTextChange}
        onUserInputClear={onUserInputClear}
        onUserInputPresenceChange={onUserInputPresenceChange}
        onUserInputStart={onUserInputStart}
        onFocus={onFocus}
        triggerPanelContainer={resolvedTriggerPanelContainer}
        workspacePath={workspacePath}
        workspaceIdentity={workspaceIdentity}
        taskId={taskId}
        skillCatalogSessionId={skillCatalogSessionId}
        inputTestId={inputTestId}
        editorApiRef={resolvedInputApiRef}
        promptHistory={promptHistory}
        compactPlaceholder={compactPlaceholder}
        onPaste={onPaste}
        conversationCommands={conversationCommands}
        enableMentionPanel={enableMentionPanel}
      />
    </div>
  );
  const actionMenuNode = hasActionMenu ? (
    <span data-composer-action-menu className="flex shrink-0 items-center">
      <ChatPromptActionMenu
        actionMenuTitle={actionMenuTitle}
        attachmentAction={attachmentAction}
        drawingAction={drawingAction}
        disabled={disabled}
        disabledReason={disabledReason}
        inputApiRef={resolvedInputApiRef}
        workspacePath={workspacePath}
        workspaceIdentity={workspaceIdentity}
        sessionId={taskId}
        container={resolvedTriggerPanelContainer}
        showContext={enableMentionPanel !== false}
      />
    </span>
  ) : null;

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className={cn("relative", className)}>
      {triggerPanelContainer ? null : (
        <div
          ref={setInternalTriggerPanelContainer}
          className="absolute inset-x-0 bottom-full z-20"
        />
      )}
      <div
        data-composer-shell
        className={cn(
          "relative flex flex-col gap-3 overflow-hidden rounded-2xl border-[0.5px] border-input-border bg-input p-3 shadow-(--shadow-composer-soft) transition-colors hover:border-input-border-hover focus-within:!border-input-border-focused focus-within:bg-input-focused",
          shellClassName,
        )}
      >
        {topContent ? <div className="contents">{topContent}</div> : null}
        {inputLeadingContent ? (
          <div className="flex min-w-0 items-start gap-2">
            <div className="shrink-0">{inputLeadingContent}</div>
            <div className="min-w-0 flex-1">{editorNode}</div>
          </div>
        ) : (
          editorNode
        )}
        <div ref={toolbarRef} className="group/toolbar flex items-end gap-3">
          <div
            className="flex min-w-0 flex-1 items-center group-has-[[data-composer-bound-model]]/toolbar:min-w-max"
            data-composer-leading-actions
          >
            <div className="flex shrink-0 items-center gap-1" data-composer-leading-content>
              {actionMenuNode}
              {/* Bugfix：权限/模式选择曾作为 leadingActions 先于动作菜单渲染，导致常驻顺序与产品规范相反。 */}
              {leadingActions}
              {onModeSwitchContainerChange ? (
                <span ref={onModeSwitchContainerChange} className="flex shrink-0 items-center" />
              ) : null}
            </div>
          </div>
          <div
            className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1.5 has-[[data-composer-bound-model]]:shrink"
            data-composer-trailing-actions
          >
            {onCancel && cancelLabel ? (
              <ControlHintTooltip title={cancelLabel} shortcut="Esc">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  onClick={onCancel}
                  disabled={submitting}
                  data-testid={cancelTestId}
                  aria-label={cancelLabel}
                >
                  <XIcon className="size-4" />
                  <span className="sr-only">{cancelLabel}</span>
                </Button>
              </ControlHintTooltip>
            ) : null}
            {betweenCancelAndSubmitAction}
            {submitControl ?? (
              <ControlHintTooltip title={submitLabel} shortcut={enterSubmits ? "Enter" : undefined}>
                <Button
                  type="submit"
                  size="icon-md"
                  disabled={submitDisabled}
                  data-testid={submitTestId ?? TID_CHAT_SEND_BUTTON}
                  aria-label={submitLabel}
                  className="gap-1 rounded-full bg-brand text-ui-base text-foreground-inverse hover:bg-brand/80"
                >
                  {submitting ? <Spinner className="size-4" /> : <ArrowUpIcon className="size-4" />}
                  <span className="sr-only">{submitLabel}</span>
                </Button>
              </ControlHintTooltip>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
