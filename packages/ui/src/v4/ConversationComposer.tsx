import { StoreContext } from "@/store/StoreProvider.js";
import { toTelemetryUiMode } from "@/lib/appTelemetry.js";
/* oxlint-disable eslint(max-lines) -- composer 集中收口输入区 wiring（附件/草稿/历史/mention），拆分会打散收口粒度。 */
import { useRemoteConversationAvailable } from "@/v4/RemoteConversationAvailability.js";
/**
 * v4 会话 composer（composer parity）。
 *
 * 壳：ChatPromptEditor（Lexical 编辑器 + 动作菜单 + 拖拽反馈 + sticky 底座视觉），
 * 附件预览网格/大图预览/错误提示区一并提供。
 *
 * 芯：全新 v4 wiring——
 * - 路由/状态一律读 v4 投影 snapshot.inputRouting / control / config / usage；
 * - 发送键状态机对齐旧 UI：canSend（有文本或附件+路由允许）/ pending spinner /
 *   running+空草稿 → Stop（v4 stop 命令）/ 暂停队列（choice）→ 发送后弹清空/保留确认框；
 * - 附件全链路见 useComposerAttachments（发送经 v4 sendText attachments）；
 * - mention（@ 文件/画板、# 会话、$ 技能）与 slash 目录全集在 LexicalChatInput 内接线；
 * - 草稿 per-session 持久化（composerDraftStore）+ prompt history（promptHistoryStorage）；
 * - 工具条（模型/思考深度/模式/context usage）见 V4ComposerToolbar。
 */
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { cn } from "@/components/lib/utils.js";
import { type ZCodeProvider } from "@zcode/shared";
import {
  TID_CHAT_ATTACHMENT_BUTTON,
  TID_CHAT_ATTACHMENT_MENU_ITEM,
  TID_V4_COMPOSER,
  TID_V4_COMPOSER_CLEAR_QUEUE_SEND,
  TID_V4_COMPOSER_INPUT,
  TID_V4_COMPOSER_KEEP_QUEUE_SEND,
  TID_V4_COMPOSER_SEND,
  TID_V4_PAUSED_QUEUE_SEND_DIALOG,
  TID_V4_ATTACHMENT,
  TID_V4_ATTACHMENT_UPLOAD_PROGRESS,
  TID_V4_ATTACHMENT_UPLOAD_RETRY,
  TID_V4_STOP,
  testId,
} from "@zcode/shared/test-ids";
import type {
  AttachmentRef,
  ConversationCommandCatalogEntry,
  ConversationSnapshot,
  SessionConfigState,
} from "@zcode/shared/zcode-protocol-v4";
import {
  ArrowUpIcon,
  ClipboardPenLineIcon,
  InfoIcon,
  RotateCcwIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import {
  ChatErrorBanner,
  shouldSuppressChatErrorBanner,
  type ChatErrorBannerModelConfigTarget,
} from "@/ChatErrorBanner.js";
import {
  Attachment,
  Attachments,
  AttachmentInfo,
  AttachmentPreview,
} from "@/components/ai-elements/attachments.js";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Spinner } from "@/components/ui/spinner.js";
import { ImagePreviewDialog } from "@/components/ai-elements/image-preview-dialog.js";
import {
  ChatMediaAttachmentPreviewDialog,
  type ChatMediaAttachmentPreviewTarget,
} from "@/ChatMediaAttachmentPreviewDialog.js";
import type { LexicalChatInputHandle } from "@/LexicalChatInput.js";
import { ChatPromptEditor } from "@/prompt-editor/ChatPromptEditor.js";
import { useAttachmentFileDragging } from "@/prompt-editor/useAttachmentFileDragging.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { advanceComposerDraftRevision } from "@/v4/composer/composerDraftRevision.js";
import type { AppSlashCommand } from "@/slashCommandHelpers.js";
import { useComposerClientNamespace, useOptionalServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import type { ComposerMentionPrefill } from "@/store/zcodeSessionStoreTypes.js";
import { FileDisplayIcon, resolveFileDisplayDescriptor } from "@/lib/fileDisplay.js";
import {
  isImageChatComposerAttachment,
  isPdfChatComposerAttachment,
  isMediaChatComposerAttachment,
  isVideoChatComposerAttachment,
  type ChatComposerAttachment,
} from "@/lib/chatAttachments.js";
import { resolveChatPlaceholderKey } from "@/lib/chatPlaceholder.js";
import {
  resolveChatEnterShortcut,
  resolveChatEnterSubmits,
  useIsMobileTextInputViewport,
} from "@/lib/mobileTextInput.js";
import { appendPromptHistoryEntry } from "@/lib/promptHistory.js";
import {
  persistPromptHistoryEntries,
  readPromptHistoryEntries,
} from "@/lib/promptHistoryStorage.js";
import type { WebModelSelectionView } from "@zcode/services";
import type {
  ModelSelectionState,
  ModelSelectionRefreshResult,
} from "@/hooks/useModelSelectionView.js";
import type { ZCodeUiError } from "@/lib/zcodeUiError.js";
import {
  resolveComposerAutoFocus,
  type ComposerAutoFocusOptions,
} from "@/v4/composer/composerAutoFocus.js";
import type {
  ComposerDraftContent,
  ComposerSubmissionDraftTransaction,
} from "@/v4/composer/useDraftConfigControl.js";
import {
  composerDraftScopeKey,
  V4_DRAFT_SCOPE_ROOT,
  type V4ComposerDraft,
} from "@/v4/composer/composerDraftStore.js";
import {
  composerInteractionState,
  resolveOppositeFollowupDelivery,
  resolveFollowupModifierTooltip,
  shouldEnableModifiedEnterSubmit,
  shouldReverseFollowupDeliveryForPointer,
} from "@/v4/composer/followupModeSettings.js";
import { isAppleKeyboardPlatform } from "@/lib/keyboardShortcuts.js";
import { usePrimaryFollowupModifier } from "@/v4/composer/usePrimaryFollowupModifier.js";
import {
  consumeV4ComposerDraftAttachments,
  registerV4ComposerDraftReader,
  consumeV4ComposerDraftWorkspaceTransferRequest,
} from "@/v4/composer/composerDraftWorkspaceTransfer.js";
import { useComposerAttachments } from "@/v4/composer/useComposerAttachments.js";
import { isComposerEditScopeId } from "@/composer-edit-mode/contract.js";
import {
  type RegisterConversationDropTarget,
  type ConversationDropTargetController,
} from "@/v4/composer/conversationDropTarget.js";
import { CodeCommentAttachmentChip } from "@/v4/composer/CodeCommentAttachmentChip.js";
import { removeCodeCommentPreview } from "@/v4/composer/codeCommentPreviewSync.js";
import {
  countComposerPromptContexts,
  serializeComposerPromptContexts,
} from "@/v4/composer/composerPromptContexts.js";
import { useCodeCommentContexts } from "@/v4/composer/useCodeCommentContexts.js";
import { useWebElementContexts } from "@/v4/composer/useWebElementContexts.js";
import type { WebElementContextComposerAttachment } from "@/lib/webElementContext.js";
import { usePptxElementReferences } from "@/v4/composer/usePptxElementReferences.js";
import { PptxElementReferenceChip } from "@/v4/composer/PptxElementReferenceChip.js";
import { useOpenPptxElementReference } from "@/v4/composer/useOpenPptxElementReference.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";
import { useConversationSelectionReferences } from "@/v4/composer/useConversationSelectionReferences.js";
import { recordSentConversationSelections } from "@/lib/conversationSelectionReference.js";
import { deleteConversationAnnotationWithUndo } from "@/selection-comment/index.js";
import { ConversationBackgroundWorkTrigger } from "@/v4/composer/ConversationBackgroundWorkTrigger.js";
import {
  V4ComposerModeSwitch,
  V4ComposerModelControls,
  type ModelSelectionSource,
} from "@/v4/composer/V4ComposerToolbar.js";
import {
  resolveV4ComposerConfigPickerState,
  type V4ComposerConfigPicker,
} from "@/v4/composer/configPickerState.js";
import { WebElementContextAttachmentChip } from "@/v4/composer/WebElementContextAttachmentChip.js";
import { ElementMentionSyncPlugin } from "@/v4/composer/ElementMentionSyncPlugin.js";
import { ConversationSelectionReferenceChip } from "@/v4/composer/ConversationSelectionReferenceChip.js";
import type { AttachmentPutFn } from "@/v4/composer/attachmentUpload.js";
import type { ConversationPromptTelemetrySeed } from "@zcode/shared/conversation-telemetry";
import type { ComposerSubmissionConfig } from "@/v4/composer/composerSubmissionConfig.js";
import { buildV4ConversationPromptTelemetryExtraDetail } from "@/v4/telemetry/conversationPromptTelemetry.js";
import { pendingCommandRegistry } from "@/v4/pendingCommandRegistry.js";
import {
  subscribeComposerSubmissionSettled,
  trackUnsettledComposerSubmission,
} from "@/v4/composer/composerSubmissionSettlement.js";

/** 菜单持有切换意图；输入框只投影当前草稿是否允许提交，不保存第二份草稿。 */
const ComposerSubmissionPendingContext = createContext<((pending: boolean) => void) | null>(null);
const MODEL_SELECTION_LOADING_STATE: ModelSelectionState = { status: "loading" };

export interface ConversationComposerSendOptions {
  /** 原始正文供接纳恢复对账；协议正文可能已经附加文件或页面上下文。 */
  submittedDraftText?: string;
  /** 点击发送时复制的配置；null 表示未完成选择，Host 不得从 Session 补齐。 */
  submission?: ComposerSubmissionConfig | null;
  heldQueueDisposition?: "clearQueueAndSend" | "keepQueueAndSend";
  /** 发送确认框打开时看到的暂停队列 ID；CLI 用它拦截跨端增删竞态。 */
  expectedHeldQueueItemIds?: readonly string[];
  /** 附件命令面：已序列化附件（宿主转 AttachmentRef 后随 v4 sendText/createSession 发送）。 */
  attachments?: AttachmentRef[];
  /** Prompt 文本内携带的上下文附件数量；用于阻止 /goal 等本地命令误消费。 */
  contextAttachmentCount?: number;
  conversationQuotes?: import("@zcode/shared").ConversationSelectionText[];
  /** renderer-only：ACK accepted 后由 SessionPane 绑定真实 commandId/sessionId。 */
  telemetrySeed?: ConversationPromptTelemetrySeed;
  /** 本次 busy input 的一次性投递覆盖，不改 session 偏好。 */
  requestedDelivery?: "startNow" | "queue" | "guide";
  streamingBehavior?: "steer" | "followUp";
  /** 提交命令创建后由 Composer 订阅权威 projection，覆盖 ACK 丢失后的收口。 */
  onCommandCreated?: (commandId: string) => void;
  /** 插件 UI 代发：随 sendText 持久化，用户消息卡片显示"来自插件 X"。 */
  source?: import("@zcode/shared/zcode-protocol-v4").ConversationInputSource;
}

export type ConversationComposerSendResult = "sent" | "blocked" | "confirmationRequired";

type ComposerSubmit = (
  heldQueueDisposition?: "clearQueueAndSend" | "keepQueueAndSend",
  expectedHeldQueueItemIds?: readonly string[],
  existingTelemetrySeed?: ConversationPromptTelemetrySeed,
  requestedDelivery?: "startNow" | "queue" | "guide",
  streamingBehavior?: ConversationComposerSendOptions["streamingBehavior"],
) => Promise<void>;
function getComposerAttachmentTypeLabel(filename: string, mimeType: string): string {
  const leaf = filename.split(/[\\/]/u).at(-1) ?? filename;
  const dotIndex = leaf.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < leaf.length - 1) {
    return leaf.slice(dotIndex + 1).toUpperCase();
  }
  return (mimeType.split("/").at(-1) ?? mimeType).toUpperCase();
}

export interface ExternalTextInsertRequest {
  requestId: number;
  text: string;
  mention?: ComposerMentionPrefill;
  mode?: "replace" | "prepend-if-missing" | "append";
  replaceText?: string;
}

export function restorePersistedComposerDraftIntoInput({
  draft,
  inputApi,
  onEditorStateError,
}: {
  draft: Pick<V4ComposerDraft, "editorStateJson" | "mention" | "text">;
  inputApi: Pick<
    LexicalChatInputHandle,
    "getMarkdown" | "setEditorStateJson" | "setMention" | "setText"
  >;
  onEditorStateError?: (error: unknown) => void;
}): string {
  if (draft.editorStateJson) {
    try {
      inputApi.setEditorStateJson(draft.editorStateJson);
      return inputApi.getMarkdown();
    } catch (error) {
      onEditorStateError?.(error);
    }
  }
  if (draft.mention && draft.text.startsWith(draft.mention.markdown)) {
    // Workspace 插件详情会卸载聊天 Composer。结构化 mention 必须从共享草稿事实源恢复，
    // 不能只依赖一次性插入事件，否则重挂载时会退化成 canonical 普通文本。
    inputApi.setMention(draft.mention, draft.text.slice(draft.mention.markdown.length));
    return draft.text;
  }
  // 空草稿落到空编辑器时，setText 会设置 Lexical 选区并夺走宿主刚移到标题的焦点。
  if (draft.text === "" && inputApi.getMarkdown() === "") return "";
  inputApi.setText(draft.text);
  return draft.text;
}

export function applyExternalTextInsertRequestToComposer({
  appliedRequestId,
  inputApi,
  request,
  requestFocus,
  scheduleDraftPersist,
  updateText,
}: {
  appliedRequestId: number | null;
  inputApi: Pick<
    LexicalChatInputHandle,
    "getMarkdown" | "prependMentionIfMissing" | "setMention" | "setText"
  > | null;
  request: ExternalTextInsertRequest | null | undefined;
  requestFocus: () => void;
  scheduleDraftPersist: () => void;
  updateText: (text: string) => void;
}): number | null {
  if (!request || request.requestId === appliedRequestId) {
    return appliedRequestId;
  }
  if (!inputApi) {
    return appliedRequestId;
  }
  if (request.mode === "append") {
    const current = inputApi.getMarkdown();
    const text =
      request.replaceText && current.includes(request.replaceText)
        ? current.replace(request.replaceText, () => request.text)
        : current.includes(request.text)
          ? current
          : current
            ? `${current}\n\n${request.text}`
            : request.text;
    inputApi.setText(text);
    updateText(text);
    scheduleDraftPersist();
    requestFocus();
    return request.requestId;
  }
  if (request.mode === "prepend-if-missing" && request.mention) {
    if (!inputApi.prependMentionIfMissing(request.mention)) {
      return request.requestId;
    }
    // Bug 原因：安装完成后若回放点击时保存的旧 prompt，会覆盖用户安装期间的编辑。
    // 节点级前置保留编辑器当前的 mention 与段落结构，再从编辑器读取 canonical 草稿。
    updateText(inputApi.getMarkdown());
    scheduleDraftPersist();
    requestFocus();
    return request.requestId;
  }
  if (request.mention && request.text.startsWith(request.mention.markdown)) {
    inputApi.setMention(request.mention, request.text.slice(request.mention.markdown.length));
  } else {
    inputApi.setText(request.text);
  }
  updateText(request.text);
  scheduleDraftPersist();
  requestFocus();
  return request.requestId;
}

function arePromptHistoryEntriesEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export interface ComposerInputPreview {
  text: string;
  summary: string;
}

export interface ComposerToolsPort {
  disabled: boolean;
  appendText: (text: string) => boolean;
  addFiles: (files: File[]) => string[];
  focusInput: () => void;
}

export interface ConversationComposerProps {
  composerPlaceholder?: string;
  composerAriaLabel?: string;
  composerInputPreview?: ComposerInputPreview;
  onInputPreview?: (preview: { text: string }) => void;
  composerTrailingTools?: (port: ComposerToolsPort) => ReactNode;
  composerSketch?: (
    port: ComposerToolsPort,
    dialog: { open: boolean; onOpenChange: (open: boolean) => void },
  ) => ReactNode;
  composerTools?: (port: ComposerToolsPort) => ReactNode;
  snapshot: ConversationSnapshot | null;
  /** 真实命令已发出、权威输入投影尚未接管；直接消费 projection store，不另存展示状态。 */
  inputPending?: boolean;
  /** 草稿 scope（sessionId；draft 态 null → "__draft__" scope）。 */
  sessionId?: string | null;
  /** Skill catalog authority；草稿预热完成后为 prewarmSessionId，不改变 task/draft 身份。 */
  skillCatalogSessionId?: string | null;
  /** draft 态无 snapshot，但仍可 createSession 首发。 */
  draftMode?: boolean;
  /** renderer 当前草稿配置意图；只在 draftMode 下覆盖迟到的 prewarm projection。 */
  draftConfig?: Partial<SessionConfigState>;
  /** SessionPane 注入的完整 Draft owner；生产路径不再由编辑器直接覆盖持久记录。 */
  composerDraft: V4ComposerDraft;
  rootDraftScopeKey?: string;
  /** 当前草稿 scope incarnation；A₁→B→A₂ 时 token 不复用。 */
  composerDraftScopeToken: symbol;
  /** 输入热路径只暂存当前 scope 正文，不触发父级 render 或同步写盘。 */
  stageComposerContent: (content: ComposerDraftContent) => void;
  /** effect setup 捕获一次性生命周期收口；切换后仍只写回对应旧 scope。 */
  captureComposerContentLifecycleCommit: () => (content: ComposerDraftContent) => void;
  captureComposerSubmissionDraftTransaction: (
    content: ComposerDraftContent,
  ) => ComposerSubmissionDraftTransaction;
  persistComposerContent: (content: ComposerDraftContent) => void;
  updateComposerContent: (content: ComposerDraftContent) => void;
  replaceComposerDraft: (draft: Omit<V4ComposerDraft, "updatedAt">) => void;
  /** 当前 Composer 是否能构造完整 Submission；空模型或空 Reasoning 时为 false。 */
  submissionReady?: boolean;
  createSubmissionFromComposer?: () => ComposerSubmissionConfig | null;
  /** 仅供发送埋点冻结模型维度；包含草稿初始化 config 与显式 intent 的合并值。 */
  telemetryDraftConfig?: Partial<SessionConfigState>;
  /**
   * 空态 contextHeader（m5-composer-parity）：workspace 切换菜单 + Git 分支
   * 切换器，渲染在编辑器上方（旧 ChatViewComposer contextHeaderContent 同位）。
   * 仅草稿态由宿主下发；会话建立后为空。
   */
  contextHeader?: ReactNode;
  /** 居中草稿布局（旧 shouldUseCenteredDraftChatLayout）：收窄 max-w-2xl、去 sticky。 */
  centered?: boolean;
  /**
   * v4 bottom dock 阻塞交互 id。存在时 composer 只隐藏不卸载，保留草稿、附件与编辑器实例。
   */
  blockingRequestId?: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  readOnlyReason?: string;
  showInteractionStatus?: boolean;
  modelSelectionPending?: boolean;
  onRetryInitialization?: () => void;
  onRetryError?: () => void;
  /**
   * 是否在新建任务 / 切换会话 / 挂载后自动把光标聚焦到输入框（默认开）。
   * 竖切多 pane 时由宿主传入 SessionPane.focused，仅焦点 pane 聚焦、后台 pane 不抢焦点。
   */
  autoFocusEnabled?: boolean;
  /** 当前 composer 是否运行在手机 Web 远控壳中。 */
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  /** SessionPane 从目标 Host 原子读取的选择事实；Composer 不自行解析 Host。 */
  modelSelectionView?: WebModelSelectionView | null;
  modelSelectionState?: ModelSelectionState;
  /** Model Selection 首次读取失败后的显式重试入口。 */
  modelSelectionReload?: () => void;
  modelSelectionRefresh?: () => Promise<ModelSelectionRefreshResult>;
  /** 草稿态使用预热 session 作附件 transaction 载体。 */
  attachmentSessionId?: string | null;
  attachmentPut: AttachmentPutFn;
  onRuntimeRestart?: (listener: () => void) => () => void;
  /** 承载 transport 暴露 runtime 存活态时优先用它，替代 onRuntimeRestart。 */
  onRuntimeLifecycle?: (listener: (state: "available" | "unavailable") => void) => () => void;
  provider?: ZCodeProvider;
  onSendText: (
    text: string,
    options?: ConversationComposerSendOptions,
  ) => Promise<ConversationComposerSendResult | void>;
  /** 把当前输入文本上抛给父组件（editUserQuery 用 composer 文本作 newText）。 */
  onTextChange?: (text: string) => void;
  /** queue 撤回 admission 读取的完整 composer 占用态；附件包含上传中状态。 */
  onDraftStateChange?: (state: { hasContent: boolean; busy: boolean }) => void;
  onStop: () => void;
  /** 目录选中模型（providerId/modelId）；thought/revision 由宿主从最新投影补齐。 */
  onSelectModel: (
    provider: string,
    model: string,
    sourceModel: ModelSelectionSource | null,
    reasoningLevel?: string,
  ) => void | Promise<void>;
  /** 选中思考深度；同时带上用户操作时看到的模型，避免异步回流后把 thought 归到另一模型。 */
  onSelectThought: (thought: string, modelContext: { provider: string; model: string }) => void;
  onSwitchMode: (mode: string) => void;
  /** 打开当前 session 的 Status panel，并直达 Running 明细。 */
  onOpenRunningBackgroundWorks?: () => void;
  /**
   * 后台任务入口点击的落点：`"workflow-run"` = 唯一在跑的工作流直达详情页（宿主判定），
   * 缺省 `"panel"` = 展开状态胶囊。入口据此换 tooltip；行为本身在 onOpenRunningBackgroundWorks 里。
   */
  backgroundWorkOpenTarget?: "panel" | "workflow-run";
  runningSubagentCount?: number;
  /** context usage 面板的 /compact 入口（宿主走 v4 compact 命令）。 */
  onSendCompressionCommand?: (command: string) => void;
  /** v4 会话级错误（snapshot.control.lastError），展示在输入框上方。 */
  error?: ZCodeUiError | null;
  onDismissError?: () => void;
  /** 无可用模型横幅的恢复动作；由 SessionPane 注入壳层导航，组件不直接操作 tab。 */
  onOpenModelSettings?: () => void;
  modelConfigTarget?: ChatErrorBannerModelConfigTarget;
  onOpenCodeViewer?: (source: CodeViewerSource) => void;
  /**
   * 是否监听全局「加入对话」事件（workspace file tree / 画板按钮）。
   * 分屏时仅 primary pane 监听，避免一次点击插入两份。
   */
  listenAddToChatEvents?: boolean;
  /**
   * 外部一次性文本预填请求（Example Prompt 等）。
   * requestId 保证同一文本可连续取回两次时仍能触发回填。
   */
  externalTextInsertRequest?: ExternalTextInsertRequest | null;
  onExternalTextInsertApplied?: (requestId: number) => void;
  /**
   * composer 编辑态：草稿切到 edit scope，原草稿留在原 scope；
   * 退出编辑态只需切回，即可完整恢复原草稿。缺省 = sessionId 对应的普通 scope。
   */
  draftScopeId?: string;
  /** 编辑态状态条，渲染在输入框卡片内顶部。 */
  editBar?: ReactNode;
  /** 点击原消息位置的「正在下方编辑」占位时递增：只聚焦输入框，不滚动。 */
  editFocusRequest?: number;
  /** 状态条的「对话 + 文件重置」等编辑态动作递增：按当前内容走同一提交流程。 */
  editSubmitRequest?: number;
  /**
   * 一次提交已被接纳且附件已移交、草稿已结算后回调（scopeId = 提交时的草稿 scope）。
   * composer 编辑态据此退出：必须晚于附件 adopt，否则切回原 scope 会把新附件当未发送清理。
   */
  onSubmissionSettled?: (scopeId: string, commandId?: string | null) => void;
  /** 由会话入口决定是否隐藏 Goal 命令。 */
  suppressGoalCommands?: boolean;
  /** App 层本地斜杠命令（如 `/plan`），由 SessionPane 按门禁组装后透传。 */
  appSlashCommands?: readonly AppSlashCommand[];
  conversationCommands?: readonly ConversationCommandCatalogEntry[];
  /** 把 composer 的 drop 路由暴露给整个对话 pane / 桌面草稿标题栏。 */
  onDropTargetControllerChange?: RegisterConversationDropTarget;
}

function formatAttachmentLineCount(attachment: ChatComposerAttachment, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return formatter.format(typeof attachment.lineCount === "number" ? attachment.lineCount : 0);
}

function ConversationComposerImpl({
  snapshot,
  inputPending = false,
  sessionId = null,
  skillCatalogSessionId = sessionId,
  draftMode = false,
  draftConfig,
  composerDraft,
  composerDraftScopeToken,
  rootDraftScopeKey,
  stageComposerContent,
  captureComposerContentLifecycleCommit,
  captureComposerSubmissionDraftTransaction,
  updateComposerContent,
  persistComposerContent,
  replaceComposerDraft,
  submissionReady = true,
  createSubmissionFromComposer,
  telemetryDraftConfig,
  contextHeader,
  composerPlaceholder,
  composerAriaLabel,
  composerInputPreview,
  onInputPreview,
  composerTrailingTools,
  composerSketch,
  composerTools,
  centered = false,
  blockingRequestId = null,
  disabled: disabledProp = false,
  readOnly = false,
  readOnlyReason,
  showInteractionStatus = false,
  modelSelectionPending = false,
  onRetryInitialization,
  onRetryError,
  autoFocusEnabled = true,
  workspacePath,
  workspaceIdentity,
  remoteSessionId,
  modelSelectionView = null,
  modelSelectionState = MODEL_SELECTION_LOADING_STATE,
  modelSelectionReload,
  modelSelectionRefresh,
  attachmentSessionId = null,
  attachmentPut,
  onRuntimeRestart,
  onRuntimeLifecycle,
  provider,
  onSendText,
  onTextChange,
  onDraftStateChange,
  onStop,
  onSelectModel,
  onSelectThought,
  onSwitchMode,
  onOpenRunningBackgroundWorks,
  backgroundWorkOpenTarget = "panel",
  runningSubagentCount = 0,
  onSendCompressionCommand,
  error,
  onDismissError,
  onOpenModelSettings,
  modelConfigTarget = "local",
  onOpenCodeViewer,
  listenAddToChatEvents = true,
  externalTextInsertRequest = null,
  onExternalTextInsertApplied,
  draftScopeId: draftScopeIdProp,
  editBar,
  editFocusRequest = 0,
  editSubmitRequest = 0,
  onSubmissionSettled,
  suppressGoalCommands = false,
  appSlashCommands,
  conversationCommands,
  onDropTargetControllerChange,
}: ConversationComposerProps) {
  const remoteAvailable = useRemoteConversationAvailable();
  const sessionBoundInput = conversationCommands !== undefined;
  const [targetSelectionPending, setTargetSelectionPending] = useState(false);
  const targetSelectionPendingRef = useRef(false);
  const updateTargetSelectionPending = useCallback((pending: boolean) => {
    targetSelectionPendingRef.current = pending;
    setTargetSelectionPending(pending);
  }, []);
  const disabled = readOnly || disabledProp || !remoteAvailable || targetSelectionPending;
  const [previewText, setPreviewText] = useState("");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const previewMatches = Boolean(
    composerInputPreview?.text.trim() && previewText.trim() === composerInputPreview.text.trim(),
  );
  const { intl, locale } = useZCodeIntl();
  const services = useOptionalServices();
  const draftScopeId =
    draftScopeIdProp ??
    sessionId ??
    (rootDraftScopeKey ? `${V4_DRAFT_SCOPE_ROOT}:${rootDraftScopeKey}` : V4_DRAFT_SCOPE_ROOT);
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const composerClientNamespace = useComposerClientNamespace();
  const promptHistoryScopeKey = composerDraftScopeKey(
    workspaceKey,
    sessionId ?? draftScopeId,
    composerClientNamespace,
  );
  const configPickerScopeKey = composerDraftScopeKey(
    workspaceKey,
    draftScopeId,
    composerClientNamespace,
  );
  const [reloadText, setReloadText] = useState(false);
  const reloadTextRef = useRef(false);
  const [textPresence, setTextPresence] = useState({ raw: false, trimmed: false });
  const textPresenceRef = useRef(textPresence);
  textPresenceRef.current = textPresence;
  const [pending, setPending] = useState(false);
  const [configPickerState, setConfigPickerState] = useState<{
    scopeKey: string;
    activePicker: V4ComposerConfigPicker | null;
  }>(() => ({
    scopeKey: configPickerScopeKey,
    activePicker: null,
  }));
  // 固定 key 的 SessionPane 会跨 task/draft 复用 composer，旧 picker owner
  // 因此跟着实例进入新 scope。提交新 scope portal 前同步归零，避免菜单闪现一帧；
  // 旧 Radix layer 随后到达的 close 事件由下方 scope guard 丢弃。
  if (configPickerState.scopeKey !== configPickerScopeKey) {
    setConfigPickerState({
      scopeKey: configPickerScopeKey,
      activePicker: null,
    });
  }
  const activeConfigPicker =
    configPickerState.scopeKey === configPickerScopeKey ? configPickerState.activePicker : null;
  const handleConfigPickerOpenChange = useCallback(
    (picker: V4ComposerConfigPicker, open: boolean) => {
      // composer 内容为导航 rail 恢复 pointer-events 后，三个 Radix modal
      // picker 的独立 open 状态会在同一次 pointerdown 中竞争，旧 layer 无法可靠 dismiss。
      // 关闭回调可能晚于兄弟 picker 的打开回调，只允许它清理自己，避免误关接管者。
      setConfigPickerState((current) => {
        if (current.scopeKey !== configPickerScopeKey) {
          return current;
        }
        return {
          scopeKey: current.scopeKey,
          activePicker: resolveV4ComposerConfigPickerState(current.activePicker, picker, open),
        };
      });
    },
    [configPickerScopeKey],
  );
  const [heldQueueConfirmation, setHeldQueueConfirmation] = useState<{
    queueItemIds: readonly string[];
    telemetrySeed: ConversationPromptTelemetrySeed;
    requestedDelivery?: "startNow" | "queue" | "guide";
  } | null>(null);
  const [actionTooltipOpen, setActionTooltipOpen] = useState(false);
  // submit 经 ref 读取最新文本/pending，避免回调随每次输入变更引用。
  const textRef = useRef("");
  const contentRevisionRef = useRef(0);
  const pendingRef = useRef(false);
  const uiStore = useContext(StoreContext);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const inputApiRef = useRef<LexicalChatInputHandle | null>(null);
  const commandResolutionCleanupsRef = useRef(new Set<() => void>());
  const isMobileTextInputViewport = useIsMobileTextInputViewport();
  const primaryModifierPressed = usePrimaryFollowupModifier();
  const appleKeyboardPlatform = isAppleKeyboardPlatform();
  // Bugfix：M3 删除旧 ChatView 后，M5 只恢复了桌面端的 false 硬编码，已登记的手机远控
  // 接线没有补回，导致 Enter 误发送。恢复旧语义：手机视口下 Enter 换行并用按钮发送；
  // 桌面端仍由 resolveChatEnterSubmits 的视口门禁保持 Enter 发送。
  const enterSubmits = resolveChatEnterSubmits({
    preferEnterNewline: snapshot?.inputRouting.mode === "streamingChoice",
  });
  const sendShortcut = resolveChatEnterShortcut({ enterSubmits });
  const updateText = useCallback(
    (next: string) => {
      textRef.current = next;
      const reload = next.trim() === "/reload";
      if (reloadTextRef.current !== reload) {
        reloadTextRef.current = reload;
        setReloadText(reload);
      }
      contentRevisionRef.current += 1;
      advanceComposerDraftRevision(workspacePath, workspaceIdentity);
      const nextPresence = { raw: next.length > 0, trimmed: next.trim().length > 0 };
      const currentPresence = textPresenceRef.current;
      if (
        currentPresence.raw !== nextPresence.raw ||
        currentPresence.trimmed !== nextPresence.trimmed
      ) {
        textPresenceRef.current = nextPresence;
        setTextPresence(nextPresence);
      }
      onTextChange?.(next);
      onInputPreview?.({ text: next });
      if (composerInputPreview) setPreviewText(next);
    },
    [onTextChange, onInputPreview, composerInputPreview, workspaceIdentity, workspacePath],
  );
  useEffect(() => {
    setPreviewText(textRef.current);
    setPreviewExpanded(false);
  }, [composerInputPreview, composerDraftScopeToken]);

  const initialization = snapshot?.runtimeInitialization;
  const runtimeBlocked = initialization !== undefined && initialization.status !== "ready";

  // ── 附件全链路（选择/粘贴/拖拽/画板/预传/门禁）──
  const attachmentsApi = useComposerAttachments({
    workspacePath,
    workspaceIdentity,
    remoteSessionId,
    scopeId: draftScopeId,
    clientNamespace: composerClientNamespace,
    attachmentSessionId,
    attachmentPut,
    onRuntimeRestart,
    onRuntimeLifecycle,
    disabled: disabled || runtimeBlocked,
    listenAddToChatEvents: listenAddToChatEvents && !disabled && !runtimeBlocked,
  });
  const {
    handleDragOverComposer,
    handleDragLeaveComposer,
    handleDropComposer,
    restoreDraftAttachments,
  } = attachmentsApi;
  // 窗口级 dragover 在指针进入会话面板前就能点亮投放区域。
  const externalFileDragging = useAttachmentFileDragging();
  const handleConversationDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (disabled || runtimeBlocked) return;
      handleDropComposer(event);
    },
    [disabled, handleDropComposer, runtimeBlocked],
  );
  const dropTargetActive = externalFileDragging || attachmentsApi.isDraggingOverComposer;
  const dropTargetController = useMemo<ConversationDropTargetController>(
    () => ({
      active: dropTargetActive,
      onDragOver: handleDragOverComposer,
      onDragLeave: handleDragLeaveComposer,
      onDrop: handleConversationDrop,
    }),
    [dropTargetActive, handleDragLeaveComposer, handleDragOverComposer, handleConversationDrop],
  );
  useLayoutEffect(
    () => onDropTargetControllerChange?.(dropTargetController),
    [dropTargetController, onDropTargetControllerChange],
  );
  const [attachmentPreviewIndex, setAttachmentPreviewIndex] = useState(0);
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false);
  const [pdfAttachmentPreview, setPdfAttachmentPreview] =
    useState<ChatMediaAttachmentPreviewTarget | null>(null);
  const [pdfAttachmentPreviewOpen, setPdfAttachmentPreviewOpen] = useState(false);
  const attachmentPreviewTitle = intl.formatMessage({
    id: "chat.attachments.preview.open",
  });
  const videoAttachmentPreviewTitle = intl.formatMessage({
    id: "chat.attachments.preview.openVideo",
  });
  const hasAttachments = attachmentsApi.hasAttachments;
  const {
    contexts: webElementContexts,
    hasContexts: hasWebElementContexts,
    removeContext: removeWebElementContext,
    clearContexts: clearWebElementContexts,
    removeSentContexts: removeSentWebElementContexts,
  } = useWebElementContexts({
    workspacePath,
    workspaceIdentity,
    scopeId: draftScopeId,
  });
  // 历史消息恢复出的网页引用保留原来的正文 token 或独立标签。
  const [inlineWebElementContexts, pillWebElementContexts] = useMemo(() => {
    const inline: WebElementContextComposerAttachment[] = [];
    const pill: WebElementContextComposerAttachment[] = [];
    for (const context of webElementContexts) (context.inline ? inline : pill).push(context);
    return [inline, pill];
  }, [webElementContexts]);
  const elementMentions = useMemo(
    () =>
      inlineWebElementContexts.map((context) => ({
        id: context.id,
        label: context.accessibleName || context.text || context.tagName.toLowerCase(),
      })),
    [inlineWebElementContexts],
  );
  const elementMentionPlugin = useMemo(
    () => (
      <ElementMentionSyncPlugin
        mentions={elementMentions}
        onRemovedByUser={(ids) => ids.forEach(removeWebElementContext)}
      />
    ),
    [elementMentions, removeWebElementContext],
  );
  const {
    references: pptxElementReferences,
    hasReferences: hasPptxElementReferences,
    removeReference: removePptxElementReference,
    clearReferences: clearPptxElementReferences,
  } = usePptxElementReferences({
    workspacePath,
    workspaceIdentity,
    remoteSessionId,
    listenAddToChatEvents: listenAddToChatEvents && !disabled,
    scopeId: draftScopeId,
  });
  const openPptxElementReference = useOpenPptxElementReference({
    workspacePath,
    workspaceIdentity,
    remoteSessionId,
    onOpenCodeViewer,
  });
  const {
    references: conversationSelectionReferences,
    limitReason: conversationSelectionLimitReason,
    removeReference: removeConversationSelectionReference,
    clearReferences: clearConversationSelectionReferences,
  } = useConversationSelectionReferences({
    // 编辑态的会话引用属于 edit scope，不能与原草稿共用同一份。
    sessionId: draftScopeIdProp ?? sessionId,
    workspaceKey,
    draftScopeKey: rootDraftScopeKey,
    liveSourceRows: draftScopeIdProp ? null : snapshot?.rows,
  });
  const hasConversationSelectionReferences = conversationSelectionReferences.length > 0;

  // ── 草稿 per-session 持久化（切会话/刷新不丢；mention pill 经 editorStateJson 保真）──
  const draftScopeRef = useRef(draftScopeId);
  const editorDraftScopeTokenRef = useRef(composerDraftScopeToken);
  const draftTargetRef = useRef({
    workspacePath,
    workspaceIdentity,
    scopeId: draftScopeId,
    scopeToken: composerDraftScopeToken,
  });
  const ownerDraftRef = useRef({
    draft: composerDraft,
    workspacePath,
    workspaceIdentity,
    scopeId: draftScopeId,
  });
  // Owner 更新不能重放正文恢复；scope effect 只在绑定变化时取最新传入草稿。
  const incomingComposerDraftRef = useRef(composerDraft);
  incomingComposerDraftRef.current = composerDraft;
  const draftPersistTimerRef = useRef<number | null>(null);
  const activeSubmissionDraftTransactionRef = useRef<ComposerSubmissionDraftTransaction | null>(
    null,
  );

  const snapshotDraftOfEditor = useCallback((): {
    text: string;
    editorStateJson?: string;
  } => {
    let currentText = textRef.current;
    let editorStateJson: string | undefined;
    try {
      const inputApi = inputApiRef.current;
      const editorState = inputApi?.getEditorState();
      if (inputApi && editorState) {
        // Bug 根因：IME 候选阶段不向 React 发布正文，textRef 会暂时落后于 Lexical。
        // 生命周期 flush 必须直接读取编辑器事实，否则 compositionend 前切任务或关窗会丢草稿。
        currentText = inputApi.getMarkdown();
        editorStateJson = JSON.stringify(editorState.toJSON());
      }
    } catch (error) {
      logger.warn(`[v4-composer] 草稿 editorState 序列化失败: ${String(error)}`);
    }
    return currentText.trim()
      ? { text: currentText, ...(editorStateJson ? { editorStateJson } : {}) }
      : { text: "" };
  }, []);

  useEffect(() => {
    // 新建 scope 已包含项目身份；不能只匹配旧的裸 __draft__ 而漏掉当前编辑器。
    if (!draftScopeId.startsWith(V4_DRAFT_SCOPE_ROOT)) return;
    return registerV4ComposerDraftReader(workspaceKey, () => ({
      draft: { ...ownerDraftRef.current.draft, ...snapshotDraftOfEditor() },
      attachments: attachmentsApi.attachments,
    }));
  }, [draftScopeId, workspaceKey, snapshotDraftOfEditor, attachmentsApi.attachments]);

  const persistDraftNow = useCallback(
    (scopeId: string) => {
      if (activeSubmissionDraftTransactionRef.current?.matchesTarget(composerDraftScopeToken)) {
        return;
      }
      const content = snapshotDraftOfEditor();
      if (scopeId === draftScopeRef.current) {
        persistComposerContent(content);
        return;
      }
    },
    [composerDraftScopeToken, snapshotDraftOfEditor, persistComposerContent],
  );

  const scheduleDraftPersist = useCallback(() => {
    if (typeof window === "undefined") return;
    stageComposerContent({ text: textRef.current });
    if (draftPersistTimerRef.current !== null) {
      window.clearTimeout(draftPersistTimerRef.current);
    }
    draftPersistTimerRef.current = window.setTimeout(() => {
      draftPersistTimerRef.current = null;
      persistDraftNow(draftScopeRef.current);
    }, 350);
  }, [persistDraftNow, stageComposerContent]);

  // ── 自动聚焦（新建任务 / 切会话 / 挂载后把光标交还输入框）──
  // 触发源：startDraft 递增的 draftFocusVersion（覆盖 Cmd/Ctrl+N 与所有「新建任务」入口）、
  // sessionId→draftScopeId 变化（切会话/切草稿）、以及挂载。三者置位聚焦意图；因切到需
  // 连接的会话时 composer 短暂 disabled，聚焦意图暂存，待可编辑时兑现一次。
  const draftFocusVersion = useZCodeSessionStore(
    (state) => state.getWorkspaceState(workspacePath, workspaceIdentity).draftFocusVersion,
  );
  useEffect(() => {
    if (!draftScopeId.startsWith(V4_DRAFT_SCOPE_ROOT)) return;
    const attachments = consumeV4ComposerDraftAttachments(workspaceKey, draftFocusVersion);
    if (attachments) restoreDraftAttachments(attachments);
  }, [draftFocusVersion, draftScopeId, workspaceKey, restoreDraftAttachments]);
  const pendingFocusRef = useRef(false);
  // 修饰键点击先于 form submit；这里只保存这一拍的 delivery 反转意图，submit 消费后清零。
  const reversePointerDeliveryRef = useRef(false);
  const appliedExternalTextInsertRequestRef = useRef<number | null>(null);
  const externalInsertTargetRef = useRef<{
    requestId: number;
    scopeToken: symbol;
  } | null>(null);
  if (
    externalTextInsertRequest &&
    externalInsertTargetRef.current?.requestId !== externalTextInsertRequest.requestId
  ) {
    externalInsertTargetRef.current = {
      requestId: externalTextInsertRequest.requestId,
      scopeToken: composerDraftScopeToken,
    };
  }
  // 决策入参经 ref 读取，避免把 autoFocusEnabled/disabled/viewport 灌进 scope effect 依赖，
  // 触发多余的草稿重恢复（disabled 变化本不应重放草稿）。
  const focusOptsRef = useRef<ComposerAutoFocusOptions>({
    autoFocusEnabled,
    disabled,
    isMobileViewport: isMobileTextInputViewport,
  });
  focusOptsRef.current = {
    autoFocusEnabled,
    disabled,
    isMobileViewport: isMobileTextInputViewport,
  };
  const flushPendingFocus = useCallback(() => {
    if (!pendingFocusRef.current) return;
    if (resolveComposerAutoFocus(focusOptsRef.current) !== "focus-now") return;
    if (!inputApiRef.current) return;
    pendingFocusRef.current = false;
    // Lexical root 可能晚一帧就绪，聚焦排到下一帧（与草稿回填同款时序）。
    if (typeof requestAnimationFrame === "function") {
      const target = draftTargetRef.current;
      requestAnimationFrame(() => {
        if (
          draftTargetRef.current === target &&
          resolveComposerAutoFocus(focusOptsRef.current) === "focus-now"
        )
          inputApiRef.current?.focus();
      });
    } else {
      inputApiRef.current.focus();
    }
  }, []);
  const requestComposerFocus = useCallback(() => {
    if (resolveComposerAutoFocus(focusOptsRef.current) === "skip") return;
    pendingFocusRef.current = true;
    flushPendingFocus();
  }, [flushPendingFocus]);

  const handleCodeCommentRemoved = useCallback(
    (comment: Parameters<typeof removeCodeCommentPreview>[0]) => {
      removeCodeCommentPreview(comment, services?.broadcastService);
    },
    [services?.broadcastService],
  );
  const {
    contexts: codeCommentContexts,
    hasContexts: hasCodeCommentContexts,
    removeContext: removeCodeCommentContext,
    clearContexts: clearCodeCommentContexts,
    getContexts: getCodeCommentContexts,
  } = useCodeCommentContexts({
    // queue 撤回等待 ACK 时 composer 处于 disabled；与网页上下文保持同一写入门禁。
    listenAddToChatEvents: listenAddToChatEvents && !disabled,
    onContextRemoved: handleCodeCommentRemoved,
    requestFocus: requestComposerFocus,
    scopeKey: `${workspaceKey}\0${draftScopeId}`,
  });

  // 离开 composer 编辑态的 edit scope 时（取消、切换目标）丢弃其中未提交的附件；
  // 已提交的附件在结算时已 adopt 并移除，这里只剩需要按未发送规则清理的部分。
  const attachmentScopeKey = attachmentsApi.scopeKey;
  const previousAttachmentScopeRef = useRef({ draftScopeId, attachmentScopeKey });
  useEffect(() => {
    const previous = previousAttachmentScopeRef.current;
    previousAttachmentScopeRef.current = { draftScopeId, attachmentScopeKey };
    if (
      previous.attachmentScopeKey === attachmentScopeKey ||
      !isComposerEditScopeId(previous.draftScopeId)
    )
      return;
    attachmentsApi.clearAttachments(undefined, previous.attachmentScopeKey);
  }, [attachmentScopeKey, attachmentsApi, draftScopeId]);

  const lastEditFocusRequestRef = useRef(editFocusRequest);
  useEffect(() => {
    if (lastEditFocusRequestRef.current === editFocusRequest) return;
    lastEditFocusRequestRef.current = editFocusRequest;
    // 占位点击是用户显式意图：直接聚焦，不受自动聚焦策略限制，也不滚动时间线。
    inputApiRef.current?.focus();
  }, [editFocusRequest]);

  // 根因：摘要／父级回调换引用曾重新安排旧草稿恢复，在外部填入 ACK 后清空正文。
  // 恢复只跟随原生 owner 的 scope；命令读取最新实现，不把展示层身份当作恢复信号。
  const draftCommandsRef = useRef({
    updateText,
    updateComposerContent,
    replaceComposerDraft,
    scheduleDraftPersist,
    persistDraftNow,
    onExternalTextInsertApplied,
    clearAttachments: attachmentsApi.clearAttachments,
  });
  draftCommandsRef.current = {
    updateText,
    updateComposerContent,
    replaceComposerDraft,
    scheduleDraftPersist,
    persistDraftNow,
    onExternalTextInsertApplied,
    clearAttachments: attachmentsApi.clearAttachments,
  };

  // 最近一次已把草稿载入 Lexical 的 edit scope；只用于编辑态顶部内容的显示时机。
  const [appliedDraftScopeId, setAppliedDraftScopeId] = useState<string | null>(null);
  // scope 切换：先落旧 scope 草稿，再恢复新 scope（editorStateJson 优先，退纯文本）。
  useEffect(() => {
    const previousTarget = draftTargetRef.current;
    const targetChanged =
      previousTarget.scopeId !== draftScopeId ||
      previousTarget.workspacePath !== workspacePath ||
      previousTarget.workspaceIdentity !== workspaceIdentity;
    let transferredDraft: ReturnType<typeof snapshotDraftOfEditor> | null = null;
    if (
      targetChanged &&
      !activeSubmissionDraftTransactionRef.current?.matchesTarget(previousTarget.scopeToken)
    ) {
      if (draftPersistTimerRef.current !== null) {
        window.clearTimeout(draftPersistTimerRef.current);
        draftPersistTimerRef.current = null;
      }
      const previousDraft = snapshotDraftOfEditor();
      const shouldTransferDraft =
        previousTarget.scopeId.startsWith(V4_DRAFT_SCOPE_ROOT) &&
        draftScopeId.startsWith(V4_DRAFT_SCOPE_ROOT) &&
        consumeV4ComposerDraftWorkspaceTransferRequest({
          sourceWorkspacePath: previousTarget.workspacePath,
          sourceWorkspaceIdentity: previousTarget.workspaceIdentity,
          targetWorkspacePath: workspacePath,
          targetWorkspaceIdentity: workspaceIdentity,
        });
      if (shouldTransferDraft) {
        // 项目解绑只改变草稿的 cwd；输入正文、mention editor state 和组件内附件继续保留。
        draftCommandsRef.current.replaceComposerDraft({
          ...ownerDraftRef.current.draft,
          ...previousDraft,
        });
        transferredDraft = previousDraft;
      }
    }
    draftScopeRef.current = draftScopeId;
    draftTargetRef.current = {
      workspacePath,
      workspaceIdentity,
      scopeId: draftScopeId,
      scopeToken: composerDraftScopeToken,
    };

    const draft = transferredDraft ?? incomingComposerDraftRef.current;
    const restoreDraftInto = (api: LexicalChatInputHandle) => {
      // Composer 跨会话复用时，恢复正文也曾推入同一 undo 栈，留下旧会话内容。
      // 在新 scope 回填前断开旧历史；晋升沿用 token，项目解绑沿用正文，都不结束编辑周期。
      if (editorDraftScopeTokenRef.current !== composerDraftScopeToken && !transferredDraft) {
        api.clearHistory();
      }
      editorDraftScopeTokenRef.current = composerDraftScopeToken;
      if (!draft) {
        if (textRef.current) {
          api.clear();
          draftCommandsRef.current.updateText("");
        }
        return;
      }
      draftCommandsRef.current.updateText(
        restorePersistedComposerDraftIntoInput({
          draft,
          inputApi: api,
          onEditorStateError: (error) => {
            logger.warn(`[v4-composer] 草稿 editorState 恢复失败，退纯文本: ${String(error)}`);
          },
        }),
      );
    };
    let unsubscribeSettled: (() => void) | null = null;
    const applyDraft = () => {
      const api = inputApiRef.current;
      if (api) restoreDraftInto(api);
      // 与草稿正文同一帧显示编辑态顶部内容（见 editPresentationReady）；输入框未就绪时
      // 没有正文可等，也必须放行，否则编辑态状态条（含「取消」）不会出现。
      if (isComposerEditScopeId(draftScopeId)) {
        flushSync(() => setAppliedDraftScopeId(draftScopeId));
      }
      if (!api) return;
      // Bug 根因（R3A-B-07）：ACK 丢失时传输先 reject，提交正文被恢复回草稿；随即断连让
      // SessionPane 连同本组件卸载，闭包里的结算订阅一起消失。重连重挂后正文从草稿回填，
      // 权威 projection 到达却无人清空，用户再点发送就重复归属。这里在回填后向模块级账本
      // 认领该 scope 尚未结算的提交：结算已到则同步清空，否则等它到达。
      const restoredText = draft?.text ?? "";
      const restoredRevision = contentRevisionRef.current;
      unsubscribeSettled = subscribeComposerSubmissionSettled(
        configPickerScopeKey,
        (submission) => {
          if (submission.attachmentIds.length > 0) {
            draftCommandsRef.current.clearAttachments(
              submission.attachmentIds,
              configPickerScopeKey,
            );
          }
          // 只清"确实是那次提交、且用户还没在其上继续编辑"的正文；编辑器把回填正文
          // 重新序列化后若与提交原文一致，也视为未编辑。
          if (submission.text !== restoredText) return;
          if (
            contentRevisionRef.current !== restoredRevision &&
            textRef.current !== submission.text
          ) {
            return;
          }
          inputApiRef.current?.clear();
          draftCommandsRef.current.updateText("");
          draftCommandsRef.current.updateComposerContent({ text: "" });
        },
      );
      // 草稿恢复后把光标交还输入框（切会话/切草稿/挂载）；连接中会话待可编辑后兑现。
      requestComposerFocus();
    };
    // Lexical root 可能晚一帧就绪；draft 恢复排到下一帧（与旧 initialValue 回填同款时序）。
    if (typeof requestAnimationFrame === "function") {
      const frame = requestAnimationFrame(applyDraft);
      return () => {
        cancelAnimationFrame(frame);
        unsubscribeSettled?.();
      };
    }
    applyDraft();
    return () => unsubscribeSettled?.();
    // 依赖收敛到 scope/workspace：draft 恢复只应发生在 scope 切换或 workspace 切换。
  }, [
    configPickerScopeKey,
    draftScopeId,
    composerDraftScopeToken,
    requestComposerFocus,
    snapshotDraftOfEditor,
    workspaceIdentity,
    workspaceKey,
    workspacePath,
  ]);

  useEffect(() => {
    ownerDraftRef.current = {
      draft: composerDraft,
      workspacePath,
      workspaceIdentity,
      scopeId: draftScopeId,
    };
  }, [composerDraft, draftScopeId, workspaceIdentity, workspacePath]);

  // scope 恢复先入帧，外部写入后入帧；Lexical 提交后再读真实正文并落原生草稿才 ACK。
  // 不可用的 editor 不伪造成功，由调用方现有的未确认提示保留表单并报告失败。
  useEffect(() => {
    if (!externalTextInsertRequest || disabled || pending) return;
    if (externalInsertTargetRef.current?.scopeToken !== composerDraftScopeToken) return;
    if (appliedExternalTextInsertRequestRef.current === externalTextInsertRequest.requestId) return;
    let confirmationFrame: number | null = null;
    const applyRequest = () => {
      const api = inputApiRef.current;
      if (!api) return;
      const nextAppliedRequestId = applyExternalTextInsertRequestToComposer({
        appliedRequestId: appliedExternalTextInsertRequestRef.current,
        inputApi: api,
        request: externalTextInsertRequest,
        requestFocus: requestComposerFocus,
        scheduleDraftPersist: draftCommandsRef.current.scheduleDraftPersist,
        updateText: draftCommandsRef.current.updateText,
      });
      if (nextAppliedRequestId !== externalTextInsertRequest.requestId) return;
      appliedExternalTextInsertRequestRef.current = nextAppliedRequestId;
      const expectedText = textRef.current;
      const confirmApplied = () => {
        if (inputApiRef.current !== api || api.getMarkdown() !== expectedText) return;
        draftCommandsRef.current.persistDraftNow(draftScopeId);
        draftCommandsRef.current.onExternalTextInsertApplied?.(nextAppliedRequestId);
      };
      if (typeof requestAnimationFrame === "function") {
        confirmationFrame = requestAnimationFrame(confirmApplied);
      } else {
        queueMicrotask(() => {
          if (!cancelled) confirmApplied();
        });
      }
    };
    let cancelled = false;
    if (typeof requestAnimationFrame !== "function") {
      queueMicrotask(() => {
        if (!cancelled) applyRequest();
      });
      return () => {
        cancelled = true;
      };
    }
    const frame = requestAnimationFrame(applyRequest);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (confirmationFrame !== null) cancelAnimationFrame(confirmationFrame);
    };
  }, [
    externalTextInsertRequest,
    composerDraftScopeToken,
    disabled,
    pending,
    draftScopeId,
    requestComposerFocus,
  ]);

  // 新建任务（含已在草稿态重复 Cmd/Ctrl+N，scope 未变）：startDraft 递增 nonce 即重新聚焦。
  const lastFocusVersionRef = useRef(draftFocusVersion);
  useEffect(() => {
    if (lastFocusVersionRef.current === draftFocusVersion) return;
    lastFocusVersionRef.current = draftFocusVersion;
    requestComposerFocus();
  }, [draftFocusVersion, requestComposerFocus]);

  // 切到需连接的会话时 disabled=true，聚焦意图 defer；连接完成 disabled→false 时兑现一次。
  useEffect(() => {
    flushPendingFocus();
  }, [disabled, flushPendingFocus]);

  // 刷新/关窗前落盘当前草稿。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const commitLifecycleContent = captureComposerContentLifecycleCommit();
    // 清理本次生命周期持有的集合；集合内容仍由发送回执实时更新。
    const commandResolutionCleanups = commandResolutionCleanupsRef.current;
    const flush = () => persistDraftNow(draftScopeRef.current);
    window.addEventListener("pagehide", flush);
    window.addEventListener("blur", flush);
    return () => {
      if (!activeSubmissionDraftTransactionRef.current?.matchesTarget(composerDraftScopeToken)) {
        commitLifecycleContent(snapshotDraftOfEditor());
      }
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("blur", flush);
      if (draftPersistTimerRef.current !== null) {
        window.clearTimeout(draftPersistTimerRef.current);
        draftPersistTimerRef.current = null;
      }
      for (const cleanup of commandResolutionCleanups) cleanup();
      commandResolutionCleanups.clear();
    };
  }, [
    captureComposerContentLifecycleCommit,
    composerDraftScopeToken,
    persistDraftNow,
    snapshotDraftOfEditor,
  ]);

  // ── prompt history（与草稿同身份隔离，↑/↓ 导航由 PromptHistoryPlugin 消费）──
  const [promptHistory, setPromptHistoryState] = useState<{
    key: string;
    entries: readonly string[];
  }>(() => ({
    key: promptHistoryScopeKey,
    entries: readPromptHistoryEntries(promptHistoryScopeKey),
  }));
  if (promptHistory.key !== promptHistoryScopeKey)
    setPromptHistoryState({
      key: promptHistoryScopeKey,
      entries: readPromptHistoryEntries(promptHistoryScopeKey),
    });
  const setPromptHistory = useCallback(
    (entries: readonly string[]) =>
      setPromptHistoryState((current) =>
        current.key === promptHistoryScopeKey ? { key: promptHistoryScopeKey, entries } : current,
      ),
    [promptHistoryScopeKey],
  );

  const mode = snapshot?.inputRouting.mode ?? "startNow";
  const streamingChoice = mode === "streamingChoice";
  const modifiedEnterSubmits =
    !sessionBoundInput && shouldEnableModifiedEnterSubmit({ inputRoutingMode: mode });
  const canStop =
    !readOnly &&
    Boolean(snapshot?.control.canStop) &&
    (!sessionBoundInput ||
      (!disabled &&
        !runtimeBlocked &&
        Boolean(snapshot?.control.activeWorks.some((work) => work.foregroundExecutionId))));
  const modifiedEnterReversesDelivery = modifiedEnterSubmits && canStop;
  const hasText = textPresence.trimmed;
  const hasDraftToSubmit =
    hasText ||
    hasAttachments ||
    hasCodeCommentContexts ||
    hasWebElementContexts ||
    hasPptxElementReferences ||
    hasConversationSelectionReferences;
  const hasComposerDraftContent =
    textPresence.raw ||
    hasAttachments ||
    hasCodeCommentContexts ||
    hasWebElementContexts ||
    hasPptxElementReferences ||
    hasConversationSelectionReferences;
  useEffect(() => {
    onDraftStateChange?.({
      hasContent: hasComposerDraftContent,
      busy: pending,
    });
  }, [hasComposerDraftContent, onDraftStateChange, pending]);
  // choice 保留正常发送按钮；提交后由 SessionPane 按 slash 语义决定是否弹确认框。
  // V4 重构时把 guide 当成“不可提交”状态，导致按钮和 Enter 同时失效；
  // guide 是 CLI 已授权的 busy 输入路由，是否最终 steer 或回退 queue 由命令层裁决。
  const routingAllowsSend =
    draftMode ||
    (snapshot !== null && mode !== "reject" && (!sessionBoundInput || mode !== "choice"));
  const attachmentsReady = !attachmentsApi.hasUnreadyAttachments;
  const recoveryCommand = appSlashCommands?.find(
    (command) => command.recovery && command.value === "reload",
  );
  // 面板选择是 AppSlashCommand 操作，草稿不是参数；只有文本提交才要求独立命令。
  const recoveryAvailable = !readOnly && Boolean(recoveryCommand) && remoteAvailable;
  const recoveryAllowed =
    recoveryAvailable &&
    !hasAttachments &&
    !hasCodeCommentContexts &&
    !hasWebElementContexts &&
    !hasPptxElementReferences &&
    !hasConversationSelectionReferences;
  const connectionPendingRef = useRef(false);
  const [connectionPending, setConnectionPending] = useState(false);
  const handleConnectionPendingChange = useCallback((pending: boolean) => {
    connectionPendingRef.current = pending;
    setConnectionPending(pending);
  }, []);
  const canReload = recoveryAllowed && reloadText && remoteAvailable;
  const canSend =
    !connectionPending &&
    !disabled &&
    !pending &&
    hasDraftToSubmit &&
    (canReload || (routingAllowsSend && attachmentsReady && submissionReady && !runtimeBlocked));
  // 旧 UI 状态机：streaming + 空草稿 → Stop；有草稿 → 发送键（入队）。
  const showStopControl = canStop && (sessionBoundInput || !hasDraftToSubmit);

  useEffect(() => {
    if (!canSend) setActionTooltipOpen(false);
  }, [canSend]);

  const submit: ComposerSubmit = useCallback(
    async (
      heldQueueDisposition?: "clearQueueAndSend" | "keepQueueAndSend",
      expectedHeldQueueItemIds?: readonly string[],
      existingTelemetrySeed?: ConversationPromptTelemetrySeed,
      requestedDelivery?: "startNow" | "queue" | "guide",
      streamingBehavior?: ConversationComposerSendOptions["streamingBehavior"],
    ) => {
      // 连接 pending 同步进入 ref，覆盖菜单点击后 React 尚未提交的一帧及快捷键提交。
      // 只阻止新输入，不取消正在执行或已排队消息，也不清空草稿。
      if (connectionPendingRef.current) return;
      if (
        sessionBoundInput &&
        snapshotRef.current?.inputRouting.mode === "streamingChoice" &&
        !streamingBehavior
      ) {
        return;
      }
      // IME 候选期间 textRef 尚未接收最终 onChange；提交必须与 claim/恢复共用 Lexical 快照。
      const submittedDraft = snapshotDraftOfEditor();
      const trimmed = submittedDraft.text.trim();
      const submittedQueueItemIds =
        snapshotRef.current?.queue.items.map((item) => item.queueItemId) ?? [];
      const hasPendingAttachments = attachmentsApi.attachments.length > 0;
      const currentCodeCommentContexts = getCodeCommentContexts();
      const hasPendingCodeCommentContexts = currentCodeCommentContexts.length > 0;
      const currentWebElementContexts = webElementContexts;
      const hasPendingWebElementContexts = currentWebElementContexts.length > 0;
      const currentPptxElementReferences = pptxElementReferences;
      const hasPendingPptxElementReferences = currentPptxElementReferences.length > 0;
      const currentConversationSelections = conversationSelectionReferences;
      const hasPendingConversationSelections = currentConversationSelections.length > 0;
      // /reload 是本地操作，在模型配置、队列和消息历史处理之前截获；参数和附件不发给模型。
      if (!sessionBoundInput && /^\/reload(?:\s|$)/.test(trimmed)) {
        if (
          trimmed !== "/reload" ||
          !recoveryCommand ||
          !recoveryAllowed ||
          !remoteAvailable ||
          pendingRef.current
        )
          return;
        const revision = contentRevisionRef.current;
        const scope = draftScopeRef.current;
        pendingRef.current = true;
        setPending(true);
        try {
          const completed = await recoveryCommand.run();
          if (
            completed !== false &&
            scope === draftScopeRef.current &&
            revision === contentRevisionRef.current
          ) {
            inputApiRef.current?.clear();
            updateText("");
            persistDraftNow(scope);
          }
        } finally {
          pendingRef.current = false;
          setPending(false);
        }
        return;
      }
      // 草稿首发 accepted 后同一 composer 会原地从 __draft__ promotion 到
      // session scope；若成功清理时再读可变 ref，会误清新 scope，并把首条输入残留在
      // __draft__，下次新建任务又恢复。发送开始时冻结真正提交的 scope。
      const submissionDraftTransaction = captureComposerSubmissionDraftTransaction(submittedDraft);
      const submittedScopeId = draftScopeRef.current;
      const submittedScopeKey = configPickerScopeKey;
      let cleanupRevision = contentRevisionRef.current;
      const submission = createSubmissionFromComposer?.() ?? null;
      const submittedAttachmentIds = attachmentsApi.attachments.map((item) => item.id);
      const submittedAttachmentScopeKey = attachmentsApi.scopeKey;
      if (
        disabled ||
        (!trimmed &&
          !hasPendingAttachments &&
          !hasPendingCodeCommentContexts &&
          !hasPendingWebElementContexts &&
          !hasPendingPptxElementReferences &&
          !hasPendingConversationSelections) ||
        pendingRef.current ||
        targetSelectionPendingRef.current ||
        !remoteAvailable ||
        !submissionReady ||
        runtimeBlocked ||
        (createSubmissionFromComposer !== undefined && submission === null) ||
        attachmentsApi.hasUnreadyAttachments
      ) {
        return;
      }
      pendingRef.current = true;
      setPending(true);
      // Bug 根因：草稿 intent 只保存用户显式改动，正常继承模型位于冻结初始化 config。
      // prewarm snapshot 尚未到达时若只读 draftConfig，send_btn 会错误落成空模型/glm。
      const telemetryConfig = telemetryDraftConfig ?? snapshotRef.current?.config ?? draftConfig;
      let telemetrySeed: ConversationPromptTelemetrySeed;
      if (existingTelemetrySeed) {
        // 队列二次确认复用首次发送的遥测种子。
        telemetrySeed = existingTelemetrySeed;
      } else {
        telemetrySeed = {
          sendTime: Date.now(),
          extraDetail: buildV4ConversationPromptTelemetryExtraDetail({
            // 与首次发送 seed 一起冻结，排队确认和执行中切换界面都不能改写本轮归属。
            uiMode: toTelemetryUiMode(uiStore?.getState().interfaceMode),
            askMode: telemetryConfig?.mode,
            modelName: telemetryConfig?.model,
            configProvider: telemetryConfig?.provider,
            agentProvider: provider,
          }),
        };
      }
      let promptHistoryBeforeSend: readonly string[] | null = null;
      let promptHistoryAfterAppend: readonly string[] | null = null;
      let promptHistoryWasPersisted = false;
      let editorClearedOptimistically = false;
      let submittedCommandId: string | null = null;
      const claimSubmittedDraft = () => {
        if (draftPersistTimerRef.current !== null) {
          window.clearTimeout(draftPersistTimerRef.current);
          draftPersistTimerRef.current = null;
        }
        // 首发 promotion 会在 onSendText 返回前切换 scope 或重建 Composer。
        // 若仍允许旧 scope effect 落盘，新 Composer 会把已经发送的正文当草稿恢复。
        // 提交前先占用并隐藏该草稿；失败路径再恢复，避免用等待时间掩盖竞态。
        activeSubmissionDraftTransactionRef.current = submissionDraftTransaction.claim()
          ? submissionDraftTransaction
          : null;
      };
      const restoreSubmittedDraft = (awaitsAuthority = false) => {
        const result = submissionDraftTransaction.restore();
        const shouldRestoreEditor =
          result.applied && result.current && draftScopeRef.current === submittedScopeId;
        if (
          submittedCommandId &&
          awaitsAuthority &&
          (result.applied || submittedAttachmentIds.length > 0)
        ) {
          // 传输层失败不等于 CLI 未 admission（ACK 丢失即如此）。正文虽已恢复回草稿，
          // 该 command 仍待权威结论；登记到模块级账本，让卸载重挂后的 composer 也能收口。
          trackUnsettledComposerSubmission(submittedScopeKey, {
            commandId: submittedCommandId,
            text: result.applied ? submittedDraft.text : undefined,
            attachmentIds: submittedAttachmentIds,
          });
        }
        // 正文已恢复给用户后，写盘抑制立即结束；事务闭包仍等待迟到的权威结算。
        activeSubmissionDraftTransactionRef.current = null;
        if (editorClearedOptimistically && shouldRestoreEditor) {
          if (submittedDraft.editorStateJson) {
            inputApiRef.current?.setEditorStateJson(submittedDraft.editorStateJson);
          } else {
            inputApiRef.current?.setText(submittedDraft.text);
          }
          updateText(submittedDraft.text);
          // 程序化恢复不是用户新编辑；迟到 authoritative 仍应能清除这份原文。
          cleanupRevision = contentRevisionRef.current;
          editorClearedOptimistically = false;
        } else if (
          !result.applied &&
          result.current &&
          draftScopeRef.current === submittedScopeId
        ) {
          // 原 scope 在等待期间已产生新正文；claim 解除后只补当前 A₂ 的 owner flush。
          persistDraftNow(submittedScopeId);
        }
      };
      const settleSubmittedContent = async () => {
        const result = submissionDraftTransaction.finalize();
        if (!result) return;
        activeSubmissionDraftTransactionRef.current = null;
        if (
          result.applied &&
          result.current &&
          draftScopeRef.current === submittedScopeId &&
          contentRevisionRef.current === cleanupRevision
        ) {
          inputApiRef.current?.clear();
          updateText("");
        }
        // v4 字节附件由发送命令接纳；只结算提交时冻结的 scope，不再调用宿主路径转移服务。
        attachmentsApi.clearAttachments(submittedAttachmentIds, submittedAttachmentScopeKey);
        currentCodeCommentContexts.forEach(removeCodeCommentContext);
        removeSentWebElementContexts(currentWebElementContexts.map((context) => context.id));
        currentPptxElementReferences.forEach((reference) =>
          removePptxElementReference(reference.id),
        );
        // 已发出的注释在正文里改画灰色“已发送”标记；编辑态（edit scope）的引用不属于主时间线。
        if (sessionId && !draftScopeIdProp) {
          recordSentConversationSelections(sessionId, workspaceKey, currentConversationSelections);
        }
        currentConversationSelections.forEach((reference) =>
          removeConversationSelectionReference(reference.id),
        );
        onSubmissionSettled?.(submittedScopeId, submittedCommandId);
      };
      const subscribeToCommandResolution = (commandId: string) => {
        let active = true;
        let cleanup = () => undefined;
        submittedCommandId = commandId;
        const unsubscribe = pendingCommandRegistry.subscribeResolution(commandId, (resolution) => {
          if (!active) return;
          cleanup();
          if (
            resolution !== "accepted" &&
            resolution !== "duplicate" &&
            resolution !== "authoritative"
          ) {
            // 直接 rejected/failed 时 claim 仍持有空草稿；先恢复正文，再释放事务。
            restoreSubmittedDraft();
            submissionDraftTransaction.release();
            activeSubmissionDraftTransactionRef.current = null;
            return;
          }
          void settleSubmittedContent().catch((error) => {
            logger.warn("[v4-composer] 已接纳输入的附件交接失败", error);
          });
        });
        cleanup = () => {
          if (!active) return;
          active = false;
          unsubscribe();
          commandResolutionCleanupsRef.current.delete(cleanup);
        };
        commandResolutionCleanupsRef.current.add(cleanup);
      };
      const rollbackPromptHistory = () => {
        if (!promptHistoryWasPersisted || !promptHistoryBeforeSend || !promptHistoryAfterAppend) {
          return;
        }
        const currentPromptHistory = readPromptHistoryEntries(promptHistoryScopeKey);
        if (arePromptHistoryEntriesEqual(currentPromptHistory, promptHistoryAfterAppend)) {
          persistPromptHistoryEntries(promptHistoryScopeKey, promptHistoryBeforeSend);
          setPromptHistory(promptHistoryBeforeSend);
          return;
        }
        setPromptHistory(currentPromptHistory);
      };
      try {
        // 二次门禁：只消费预传完成的 ref，不在点击发送时回落上传。
        const readyAttachmentRefs = await attachmentsApi.prepareForSend();
        if (readyAttachmentRefs === null) {
          return;
        }
        // 外部上下文不走协议附件；按 selection -> code comment -> web -> PPTX 的固定尾块顺序
        // 序列化，历史 user row 才能按相反顺序无损解析并隐藏内部 prompt block。
        //
        // 分享 handover 不在这里序列化：share URL 块纯粹是 renderer 自产自销（CLI/shared
        // 里没有任何东西解析它），唯一作用是驱动一个已被产品裁掉的 chip，代价却是把一个
        // share URL 塞进发给模型的正文。模型侧内容由隐藏的 shared_context 消息经
        // inputIntent.sharedContextRefs 注入，与正文无关。
        const promptText = serializeComposerPromptContexts(trimmed, {
          codeComments: currentCodeCommentContexts,
          conversationSelections: [],
          webElements: currentWebElementContexts,
          pptxElements: currentPptxElementReferences,
        });
        const contextAttachmentCount = countComposerPromptContexts({
          codeComments: currentCodeCommentContexts,
          conversationSelections: currentConversationSelections,
          webElements: currentWebElementContexts,
          pptxElements: currentPptxElementReferences,
        });
        if (trimmed) {
          promptHistoryBeforeSend = readPromptHistoryEntries(promptHistoryScopeKey);
          promptHistoryAfterAppend = appendPromptHistoryEntry(promptHistoryBeforeSend, trimmed);
          if (!arePromptHistoryEntriesEqual(promptHistoryBeforeSend, promptHistoryAfterAppend)) {
            // 预热首发 accepted 后，SessionPane 会立即 promote 到新 session，
            // draft composer 可能在 await 恢复前卸载；不能把写盘藏在 React state updater 里。
            // 这里继续沿用旧 UI 的 localStorage history，不接 input_history 数据库：
            // 发起真实发送前先同步写盘，若发送失败再恢复到发送前快照。
            persistPromptHistoryEntries(promptHistoryScopeKey, promptHistoryAfterAppend);
            promptHistoryWasPersisted = true;
            setPromptHistory(promptHistoryAfterAppend);
          }
        }
        claimSubmittedDraft();
        if (requestedDelivery === "startNow") {
          // 原子抢占需要等旧 turn 退出并提交新 TurnStarted ACK；
          // 若编辑器也等整条链路才清空，用户会误以为快捷键未生效。
          // 先清空可见正文；命令拒绝时用冻结 editor state 原样恢复。
          inputApiRef.current?.clear();
          updateText("");
          cleanupRevision = contentRevisionRef.current;
          editorClearedOptimistically = true;
        }
        const sendResult = await onSendText(promptText, {
          submittedDraftText: submittedDraft.text,
          submission,
          ...(currentConversationSelections.length
            ? {
                conversationQuotes: currentConversationSelections.map(
                  ({ text, path, senderName, senderId, messageId, sentAt, comment, agent }) => ({
                    text,
                    path,
                    senderName,
                    senderId,
                    messageId,
                    sentAt,
                    ...(!sessionBoundInput ? { comment } : {}),
                    agent,
                  }),
                ),
              }
            : {}),
          telemetrySeed,
          onCommandCreated: subscribeToCommandResolution,
          ...(requestedDelivery ? { requestedDelivery } : {}),
          ...(streamingBehavior ? { streamingBehavior } : {}),
          ...(heldQueueDisposition ? { heldQueueDisposition } : {}),
          ...(expectedHeldQueueItemIds ? { expectedHeldQueueItemIds } : {}),
          ...(readyAttachmentRefs.length > 0 ? { attachments: readyAttachmentRefs } : {}),
          ...(contextAttachmentCount > 0 ? { contextAttachmentCount } : {}),
        });
        if (sendResult === "blocked") {
          // 产品 guard 是一次正常拒绝，不应借异常路径表达；回滚发送前暂记的 history，
          // 同时不 clear editor/draft/附件，让用户切换模式后可以直接重试。
          rollbackPromptHistory();
          restoreSubmittedDraft();
          return;
        }
        if (sendResult === "confirmationRequired") {
          rollbackPromptHistory();
          restoreSubmittedDraft();
          const latestQueueItemIds =
            snapshotRef.current?.queue.items.map((item) => item.queueItemId) ?? [];
          // 首次提交冻结当前队列；跨端 stale 后用最新投影替换，要求用户重新确认。
          setHeldQueueConfirmation({
            // 标记 queueConfirmed：确认后复用该 seed 落定，send_cost_ms 含用户在弹窗上的停留。
            telemetrySeed: { ...telemetrySeed, queueConfirmed: true },
            ...(requestedDelivery ? { requestedDelivery } : {}),
            queueItemIds:
              latestQueueItemIds.length > 0 ? latestQueueItemIds : submittedQueueItemIds,
          });
          return;
        }
        setHeldQueueConfirmation(null);
        // 发送成功或 ACK 丢失后由权威 projection 结算：清本次提交捕获的内容，
        // prompt history 已在真实发送前同步写盘，避免首发 promote 丢失或误清新 scope。
        await settleSubmittedContent();
      } catch (error) {
        rollbackPromptHistory();
        // 已结算事务不会恢复；只有未确定命令结果的传输失败才保留迟到权威结算订阅。
        restoreSubmittedDraft(true);
        // 发送失败草稿保留在输入框（不清空），仅记录原因。
        logger.warn(`[v4-composer] 发送失败: ${String(error)}`);
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [
      recoveryCommand,
      recoveryAllowed,
      sessionBoundInput,
      uiStore,
      attachmentsApi,
      captureComposerSubmissionDraftTransaction,
      configPickerScopeKey,
      disabled,
      conversationSelectionReferences,
      draftConfig,
      draftScopeIdProp,
      createSubmissionFromComposer,
      submissionReady,
      remoteAvailable,
      runtimeBlocked,
      getCodeCommentContexts,
      telemetryDraftConfig,
      onSendText,
      persistDraftNow,
      provider,
      removeCodeCommentContext,
      removeConversationSelectionReference,
      removePptxElementReference,
      removeSentWebElementContexts,
      sessionId,
      snapshotDraftOfEditor,
      updateText,
      webElementContexts,
      pptxElementReferences,
      workspaceKey,
      promptHistoryScopeKey,
      setPromptHistory,
      onSubmissionSettled,
    ],
  );

  const lastEditSubmitRequestRef = useRef(editSubmitRequest);
  useEffect(() => {
    if (lastEditSubmitRequestRef.current === editSubmitRequest) return;
    lastEditSubmitRequestRef.current = editSubmitRequest;
    // 与发送按钮共用提交事务：草稿冻结、附件门禁、失败恢复与成功结算保持一致。
    void submit();
  }, [editSubmitRequest, submit]);

  const handleUserInputPresenceChange = useCallback(
    (presence: { raw: boolean; trimmed: boolean }) => {
      const currentPresence = textPresenceRef.current;
      if (currentPresence.raw === presence.raw && currentPresence.trimmed === presence.trimmed) {
        return;
      }
      textPresenceRef.current = presence;
      setTextPresence(presence);
    },
    [],
  );

  // Lexical onChange（首字符也稳定回传，见 LexicalChatInput.TextContentPlugin）。
  const handleEditorChange = useCallback(
    (value: string) => {
      updateText(value);
      scheduleDraftPersist();
    },
    [scheduleDraftPersist, updateText],
  );

  // 编辑器提交（Enter / 发送键 form submit 同路径）。返回 false：编辑器不自行 reset，
  // 由 submit 成功后经 inputApiRef.clear() 清空——失败时草稿留在输入框。
  const handleEditorSubmit = useCallback(
    (value: string) => {
      textRef.current = value;
      const reverseDelivery = reversePointerDeliveryRef.current;
      reversePointerDeliveryRef.current = false;
      const followupMode = snapshotRef.current?.config.followupMode;
      void submit(
        undefined,
        undefined,
        undefined,
        reverseDelivery && followupMode ? resolveOppositeFollowupDelivery(followupMode) : undefined,
      );
      return false;
    },
    [submit],
  );

  const handleFollowUp = useCallback(() => {
    void submit(undefined, undefined, undefined, undefined, "followUp");
  }, [submit]);

  const handleModifiedEditorSubmit = useCallback(
    (value: string) => {
      const followupMode = snapshotRef.current?.config.followupMode;
      textRef.current = value;
      // inputRouting 在 turn 启动初期可能仍为 startNow，不能用它
      // 推断空闲。组合键始终表达单次反向 delivery；空闲时 CLI 自然 startNow。
      void submit(
        undefined,
        undefined,
        undefined,
        followupMode ? resolveOppositeFollowupDelivery(followupMode) : undefined,
      );
      return false;
    },
    [submit],
  );

  const handleClearQueueSend = useCallback(() => {
    if (!heldQueueConfirmation) return;
    void submit(
      "clearQueueAndSend",
      heldQueueConfirmation.queueItemIds,
      heldQueueConfirmation.telemetrySeed,
      heldQueueConfirmation.requestedDelivery,
    );
  }, [heldQueueConfirmation, submit]);

  const handleKeepQueueSend = useCallback(() => {
    if (!heldQueueConfirmation) return;
    void submit(
      "keepQueueAndSend",
      heldQueueConfirmation.queueItemIds,
      heldQueueConfirmation.telemetrySeed,
      heldQueueConfirmation.requestedDelivery,
    );
  }, [heldQueueConfirmation, submit]);

  // click 先于 form submit，这里只记录修饰键是否反转本次跟进投递方式。
  const handleSendButtonClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      reversePointerDeliveryRef.current = shouldReverseFollowupDeliveryForPointer({
        enabled: modifiedEnterReversesDelivery,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        isApplePlatform: appleKeyboardPlatform,
      });
    },
    [appleKeyboardPlatform, modifiedEnterReversesDelivery],
  );

  // ACK 清空正文与消息投影不是同一时刻；提交及待投影命令共同覆盖首发交接窗口。
  // 切回已有会话时 lease 先切换、快照后到；未知历史不能当作新草稿，
  // 否则运行中的输入框会闪出新任务提示。只等待当前快照，不复用上一会话状态。
  const normalPlaceholder =
    sessionId !== null && snapshot === null
      ? ""
      : intl.formatMessage({
          id: resolveChatPlaceholderKey({
            hasHistoryMessages: (snapshot?.rows.totalCount ?? 0) > 0,
            isTaskProcessing: pending || inputPending || canStop,
          }),
        });
  const interactionState = composerInteractionState({
    readOnly,
    offline: !remoteAvailable,
    waiting: disabledProp || targetSelectionPending || (!draftMode && snapshot === null),
    blocked: runtimeBlocked,
    mode,
  });
  const zh = locale === "zh-CN";
  const interactionHints = {
    readOnly:
      readOnlyReason || (zh ? "当前会话只读，不能发送消息。" : "This conversation is read-only."),
    offline: zh
      ? "连接不可用，恢复连接后可继续。"
      : "Connection unavailable. Reconnect to continue.",
    waiting: zh ? "输入暂不可用，请稍候。" : "Input is temporarily unavailable. Please wait.",
    blocked: zh
      ? "当前暂不接收消息，请先处理待办交互或恢复会话。"
      : "Messages are unavailable. Resolve the pending interaction or recover the session.",
    queued: zh
      ? "处理中，可输入下一条消息，发送后排队。"
      : "Working. Your next message will be queued.",
    guide: zh ? "处理中，可继续补充指令。" : "Working. You can add further instructions.",
    choice: zh
      ? "有待发送消息，发送时可选择保留或清空队列。"
      : "Messages are queued. Choose whether to keep or clear them when sending.",
    streamingChoice: "",
    ready: "",
  };
  const interactionHint = showInteractionStatus ? interactionHints[interactionState] : "";
  const inputUnavailable =
    disabled ||
    (mode === "reject" && !recoveryAvailable) ||
    (showInteractionStatus && runtimeBlocked && !recoveryAvailable);

  const sendTooltipTitle =
    showInteractionStatus && mode === "guide"
      ? zh
        ? "补充指令"
        : "Add instructions"
      : intl.formatMessage({ id: mode === "enqueue" ? "chat.queue.enqueue" : "chat.send" });
  const modifierTooltip = resolveFollowupModifierTooltip({
    enabled: modifiedEnterReversesDelivery,
    canSend,
    modifierPressed: primaryModifierPressed,
    followupMode: snapshot?.config.followupMode,
    isApplePlatform: appleKeyboardPlatform,
  });
  const resolvedSendTooltipTitle = modifierTooltip
    ? intl.formatMessage({ id: modifierTooltip.titleId })
    : sendTooltipTitle;
  const resolvedSendTooltipShortcut = modifierTooltip?.shortcut ?? sendShortcut;
  const stopTooltipTitle = intl.formatMessage({ id: "chat.stop" });
  const boundSelection = sessionBoundInput ? snapshot?.config.modelSelection : undefined;
  const boundModel = boundSelection
    ? [boundSelection.modelId, boundSelection.options?.reasoningLevel].filter(Boolean).join(" · ")
    : undefined;
  const boundModelLabel = zh ? "会话模型" : "Session model";
  const [sketchOpen, setSketchOpen] = useState(false);
  const followUpLabel = intl.formatMessage({ id: "chat.followup.addToQueue" });
  const visibleError = error && !shouldSuppressChatErrorBanner(error) ? error : null;

  const attachmentAction = useMemo(
    () => ({
      label: intl.formatMessage({ id: "chat.composer.attachment" }),
      menuItemTestId: TID_CHAT_ATTACHMENT_MENU_ITEM,
      onSelect: attachmentsApi.openAttachmentPicker,
      testId: TID_CHAT_ATTACHMENT_BUTTON,
    }),
    [intl, attachmentsApi.openAttachmentPicker],
  );

  // ── 附件预览网格 ──
  const composerAttachments = attachmentsApi.attachments;
  const orderedComposerAttachments = useMemo(() => {
    // 媒体组（图片/视频）优先、文件在后；组内保持添加顺序。
    const media: (typeof composerAttachments)[number][] = [];
    const files: (typeof composerAttachments)[number][] = [];
    for (const attachment of composerAttachments) {
      (isMediaChatComposerAttachment(attachment) ? media : files).push(attachment);
    }
    return [...media, ...files];
  }, [composerAttachments]);
  const composerMediaPreviewItems = useMemo(
    () =>
      composerAttachments.flatMap((attachment) =>
        attachment.objectUrl && isMediaChatComposerAttachment(attachment)
          ? [
              {
                alt: attachment.filename,
                filename: attachment.filename,
                mediaType: attachment.mimeType,
                src: attachment.objectUrl,
              },
            ]
          : [],
      ),
    [composerAttachments],
  );
  const attachmentsTopContentNode = useMemo(() => {
    if (
      !hasAttachments &&
      codeCommentContexts.length === 0 &&
      pillWebElementContexts.length === 0 &&
      pptxElementReferences.length === 0 &&
      conversationSelectionReferences.length === 0
    ) {
      return null;
    }
    return (
      <div className="flex max-w-full flex-col items-start gap-2">
        {hasAttachments ? (
          <Attachments
            variant="inline"
            className="flex max-w-full flex-wrap gap-2"
            data-composer-file-attachments-row="true"
          >
            {orderedComposerAttachments.map((attachment) => {
              const isClipboardTextAttachment = attachment.sourceKind === "clipboard-text";
              const isMediaAttachment = isMediaChatComposerAttachment(attachment);
              const isVideoAttachment = isVideoChatComposerAttachment(attachment);
              const isPdfAttachment = isPdfChatComposerAttachment(attachment);
              const mediaType = attachment.objectUrl
                ? attachment.mimeType
                : attachment.mimeType.startsWith("image/")
                  ? "application/octet-stream"
                  : attachment.mimeType;
              const canPreviewImageAttachment =
                Boolean(attachment.objectUrl) && isImageChatComposerAttachment(attachment);
              const canPreviewVideoAttachment = Boolean(attachment.objectUrl) && isVideoAttachment;
              const canPreviewPdfAttachment = Boolean(attachment.objectUrl) && isPdfAttachment;
              const fileDisplayDescriptor = resolveFileDisplayDescriptor(
                attachment.localPath ?? attachment.filename,
              );
              const uploadStatusLabel =
                attachment.uploadStatus === "uploading"
                  ? intl.formatMessage(
                      { id: "chat.attachments.upload.uploading" },
                      { progress: String(attachment.uploadProgress) },
                    )
                  : attachment.uploadStatus === "failed"
                    ? intl.formatMessage(
                        { id: "chat.attachments.upload.failed" },
                        { message: attachment.uploadError ?? "unknown" },
                      )
                    : intl.formatMessage({
                        id: `chat.attachments.upload.${attachment.uploadStatus}`,
                      });
              const showUploadStatus =
                !attachment.localZeroCopy &&
                (attachment.uploadStatus !== "ready" || attachment.showComplete);
              return (
                <Attachment
                  key={attachment.id}
                  variant={isMediaAttachment ? "grid" : "inline"}
                  data-composer-attachment-kind={
                    isVideoAttachment
                      ? "video"
                      : isMediaAttachment
                        ? "image"
                        : isPdfAttachment
                          ? "pdf"
                          : "file"
                  }
                  data-testid={testId(TID_V4_ATTACHMENT, attachment.id)}
                  data-upload-status={attachment.uploadStatus}
                  className={
                    isMediaAttachment
                      ? "relative size-12 overflow-hidden rounded-lg bg-surface after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:border after:border-border after:content-['']"
                      : "h-12 w-fit max-w-full min-w-0 gap-2 rounded-lg border border-border bg-surface p-1.5 [--attachment-bg:var(--color-surface)] hover:bg-surface-hover"
                  }
                  data={{
                    id: attachment.id,
                    type: "file",
                    filename: attachment.filename,
                    ...(isClipboardTextAttachment
                      ? {
                          description: intl.formatMessage(
                            {
                              id: "chat.attachments.clipboardText.description",
                            },
                            {
                              lineCount: formatAttachmentLineCount(attachment, locale),
                            },
                          ),
                          displayName: intl.formatMessage({
                            id: "chat.attachments.clipboardText",
                          }),
                          sourceKind: "clipboard-text" as const,
                        }
                      : {}),
                    mediaType,
                    url: attachment.objectUrl ?? "",
                  }}
                  onRemove={() => attachmentsApi.removeAttachment(attachment.id)}
                  // 附件支持非图片格式，PDF 走独立 PdfViewer，
                  // 其他文件展示类型图标和文件名，避免 doc 等普通文件被当成图片渲染失败。
                  // 图片与视频统一按添加顺序进入发送前 gallery，
                  // 保证同一组媒体可以连续导航。
                  onOpen={
                    canPreviewImageAttachment || canPreviewVideoAttachment
                      ? () => {
                          const previewIndex = composerMediaPreviewItems.findIndex(
                            (item) => item.src === attachment.objectUrl,
                          );
                          if (previewIndex < 0) return;
                          setAttachmentPreviewIndex(previewIndex);
                          setAttachmentPreviewOpen(true);
                        }
                      : canPreviewPdfAttachment
                        ? () => {
                            setPdfAttachmentPreview({
                              filename: attachment.filename,
                              mediaType: "application/pdf",
                              url: attachment.objectUrl,
                            });
                            setPdfAttachmentPreviewOpen(true);
                          }
                        : undefined
                  }
                  openLabel={
                    canPreviewVideoAttachment
                      ? videoAttachmentPreviewTitle
                      : canPreviewImageAttachment
                        ? attachmentPreviewTitle
                        : canPreviewPdfAttachment
                          ? intl.formatMessage({ id: "chat.attachments.preview.openPdf" })
                          : undefined
                  }
                >
                  <div
                    className={cn(
                      "relative shrink-0",
                      isMediaAttachment ? "size-full" : "size-9 rounded-md bg-background",
                    )}
                  >
                    <AttachmentPreview
                      className={cn(
                        isMediaAttachment ? "size-full rounded-none" : "size-9 rounded-md",
                      )}
                      fallbackIcon={
                        isClipboardTextAttachment ? (
                          <ClipboardPenLineIcon className="size-3.5 text-muted-foreground" />
                        ) : (
                          <FileDisplayIcon
                            src={fileDisplayDescriptor.fileIconSrc}
                            size={16}
                            className="size-4 shrink-0"
                          />
                        )
                      }
                    />
                    {showUploadStatus && isMediaAttachment ? (
                      <span
                        data-testid={testId(TID_V4_ATTACHMENT_UPLOAD_PROGRESS, attachment.id)}
                        role={attachment.uploadStatus === "failed" ? "alert" : "status"}
                        aria-label={uploadStatusLabel}
                        className="absolute inset-0 grid place-items-center rounded-lg bg-background/85 text-[7px] font-semibold text-foreground"
                      >
                        <svg
                          aria-hidden="true"
                          className="absolute inset-0 size-full -rotate-90 text-brand"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="stroke-border"
                            cx="12"
                            cy="12"
                            fill="none"
                            pathLength="100"
                            r="9"
                            strokeWidth="2"
                          />
                          <circle
                            className={
                              attachment.uploadStatus === "failed"
                                ? "stroke-destructive"
                                : "stroke-current"
                            }
                            cx="12"
                            cy="12"
                            fill="none"
                            pathLength="100"
                            r="9"
                            strokeDasharray={`${attachment.uploadProgress} 100`}
                            strokeLinecap="round"
                            strokeWidth="2"
                          />
                        </svg>
                        <span className="relative">
                          {attachment.uploadStatus === "failed"
                            ? "!"
                            : `${attachment.uploadProgress}%`}
                        </span>
                      </span>
                    ) : null}
                  </div>
                  {!isMediaAttachment ? (
                    isClipboardTextAttachment ? (
                      <AttachmentInfo className="max-w-48 text-ui-base text-foreground" />
                    ) : (
                      <div className="min-w-0 max-w-40 flex-1">
                        <span
                          className="block truncate text-ui-base font-medium text-foreground"
                          title={attachment.filename}
                        >
                          {attachment.sourceKind === "topic-history"
                            ? intl.formatMessage(
                                { id: "chat.attachments.topicHistory" },
                                { count: attachment.messageCount ?? 0 },
                              )
                            : attachment.filename}
                        </span>
                        <span className="block truncate text-ui-sm font-normal text-foreground-subtle">
                          {getComposerAttachmentTypeLabel(attachment.filename, attachment.mimeType)}
                        </span>
                      </div>
                    )
                  ) : null}
                  {showUploadStatus && !isMediaAttachment ? (
                    <span
                      data-testid={testId(TID_V4_ATTACHMENT_UPLOAD_PROGRESS, attachment.id)}
                      role={attachment.uploadStatus === "failed" ? "alert" : "status"}
                      title={uploadStatusLabel}
                      className={cn(
                        "max-w-28 truncate text-ui-sm font-normal text-foreground-subtle",
                        attachment.uploadStatus === "failed" && "text-destructive",
                      )}
                    >
                      {attachment.uploadStatus === "uploading"
                        ? `${attachment.uploadProgress}%`
                        : uploadStatusLabel}
                    </span>
                  ) : null}
                  {attachment.uploadStatus === "failed" ? (
                    <button
                      type="button"
                      data-testid={testId(TID_V4_ATTACHMENT_UPLOAD_RETRY, attachment.id)}
                      aria-label={intl.formatMessage({
                        id: "chat.attachments.upload.retry",
                      })}
                      title={uploadStatusLabel}
                      className="grid size-5 shrink-0 place-items-center rounded-md text-destructive hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        attachmentsApi.retryAttachment(attachment.id);
                      }}
                    >
                      <RotateCcwIcon className="size-3" />
                    </button>
                  ) : null}
                  <span
                    // 动效主题按下时会让按钮相对定位。由外层定位可避免按钮在按下与松开之间移出点击点。
                    className={
                      isMediaAttachment
                        ? "absolute top-0.5 right-0.5 z-20 inline-flex"
                        : "inline-flex shrink-0"
                    }
                  >
                    <Button
                      type="button"
                      variant={isMediaAttachment ? "default" : "ghost"}
                      size="icon-sm"
                      data-composer-attachment-remove={attachment.id}
                      aria-label={intl.formatMessage({ id: "chat.attachments.remove" })}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        attachmentsApi.removeAttachment(attachment.id);
                      }}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </span>
                </Attachment>
              );
            })}
          </Attachments>
        ) : null}
        {codeCommentContexts.length > 0 ||
        pillWebElementContexts.length > 0 ||
        pptxElementReferences.length > 0 ||
        conversationSelectionReferences.length > 0 ? (
          <div
            className="flex max-w-full flex-wrap items-center gap-2"
            data-composer-context-attachments-row="true"
          >
            <CodeCommentAttachmentChip
              comments={codeCommentContexts}
              onRemove={removeCodeCommentContext}
              onRemoveAll={clearCodeCommentContexts}
            />
            <WebElementContextAttachmentChip
              contexts={pillWebElementContexts}
              onRemove={removeWebElementContext}
              onRemoveAll={clearWebElementContexts}
            />
            <PptxElementReferenceChip
              references={pptxElementReferences}
              onOpen={onOpenCodeViewer ? openPptxElementReference : undefined}
              onRemove={removePptxElementReference}
              onRemoveAll={clearPptxElementReferences}
            />
            <ConversationSelectionReferenceChip
              references={conversationSelectionReferences}
              // 正文编号对应主 composer scope；编辑态（edit scope）的列表不编号，避免与正文错位。
              numbered={!draftScopeIdProp}
              onRemove={(id) => {
                deleteConversationAnnotationWithUndo({
                  sessionId: draftScopeIdProp ?? sessionId,
                  workspaceKey,
                  draftScopeKey: rootDraftScopeKey,
                  id,
                  formatMessage: (messageId) => intl.formatMessage({ id: messageId }),
                });
                // 存储里已删除；这里只同步清掉 hook 内的超限提示。
                removeConversationSelectionReference(id);
              }}
              onRemoveAll={clearConversationSelectionReferences}
            />
          </div>
        ) : null}
      </div>
    );
  }, [
    attachmentPreviewTitle,
    videoAttachmentPreviewTitle,
    attachmentsApi,
    clearCodeCommentContexts,
    clearConversationSelectionReferences,
    clearWebElementContexts,
    clearPptxElementReferences,
    codeCommentContexts,
    composerMediaPreviewItems,
    orderedComposerAttachments,
    hasAttachments,
    intl,
    locale,
    removeCodeCommentContext,
    removeConversationSelectionReference,
    removeWebElementContext,
    removePptxElementReference,
    conversationSelectionReferences,
    pillWebElementContexts,
    pptxElementReferences,
    onOpenCodeViewer,
    openPptxElementReference,
    draftScopeIdProp,
    rootDraftScopeKey,
    sessionId,
    workspaceKey,
  ]);
  // Bug 根因：草稿正文晚一帧（rAF）才载入 Lexical，状态条与附件行却随 scope 切换立即渲染；
  // 多行编辑时队列面板会先因状态条上移、下一帧再因正文上移（两次跳位，B09g 逐帧采样复现）。
  // 进入 edit scope 时等正文载入后再显示顶部内容，使高度变化只发生一次。
  const editPresentationReady =
    !isComposerEditScopeId(draftScopeId) || appliedDraftScopeId === draftScopeId;
  const topContentNode = !editPresentationReady ? null : editBar && attachmentsTopContentNode ? (
    <div className="flex w-full max-w-full flex-col gap-2">
      {editBar}
      {attachmentsTopContentNode}
    </div>
  ) : (
    (editBar ?? attachmentsTopContentNode)
  );

  // 发送/停止控制簇（对齐旧 ChatViewComposer.submitControlNode 结构：
  // 左侧 model/thought/usage 簇 + 右侧 stop 或 send）。
  // useMemo：composer 随流式 snapshot 高频重渲染，控制簇只在语义依赖变化时重建，
  // 避免每个 token 批次都重建 Tooltip/Select 子树。
  const composerUsage = snapshot?.usage ?? null;
  const composerPhase = snapshot?.control.phase ?? null;
  const handleSelectModel = useCallback(
    (
      nextProvider: string,
      nextModel: string,
      sourceModel: ModelSelectionSource | null,
      reasoningLevel?: string,
    ) =>
      reasoningLevel === undefined
        ? onSelectModel(nextProvider, nextModel, sourceModel)
        : onSelectModel(nextProvider, nextModel, sourceModel, reasoningLevel),
    [onSelectModel],
  );
  const toolsPort: ComposerToolsPort = {
    disabled: disabled || runtimeBlocked || pending,
    appendText: (text) => {
      if (disabled || runtimeBlocked || pending || !inputApiRef.current) return false;
      const current = inputApiRef.current.getMarkdown();
      const next = current ? `${current}\n\n${text}` : text;
      inputApiRef.current.setText(next);
      updateText(next);
      scheduleDraftPersist();
      return true;
    },
    addFiles: attachmentsApi.addAttachmentFiles,
    focusInput: () => {
      // 用户主动关闭工具时要归还输入焦点，即使宿主禁用了进入会话时的自动聚焦。
      if (!disabled && !runtimeBlocked) inputApiRef.current?.focus();
    },
  };
  const trailingToolsNode = composerTrailingTools?.(toolsPort);
  const submitControlNode = useMemo(
    () => (
      <div className="flex min-w-0 items-center gap-1">
        {!remoteAvailable ? (
          <span
            data-testid="remote-send-unavailable"
            className="max-w-40 text-right text-ui-sm text-foreground-subtle"
          >
            {intl.formatMessage({ id: "remote.conversation.sendUnavailable" })}
          </span>
        ) : null}
        {remoteAvailable && sessionBoundInput && boundModel ? (
          <span
            className="min-w-0 truncate text-ui-caption text-foreground-subtle"
            data-composer-bound-model=""
            title={`${boundModelLabel}: ${boundModel}`}
          >
            {boundModel}
          </span>
        ) : null}
        {remoteAvailable && !sessionBoundInput ? (
          <span className="flex min-w-0 shrink items-center gap-1 overflow-hidden empty:hidden">
            <V4ComposerModelControls
              workspacePath={workspacePath}
              workspaceIdentity={workspaceIdentity}
              modelSelectionView={modelSelectionView}
              modelSelectionState={modelSelectionState}
              modelSelectionReload={modelSelectionReload}
              modelSelectionRefresh={modelSelectionRefresh}
              sessionId={sessionId ?? null}
              phase={composerPhase}
              provider={provider}
              draftMode={draftMode}
              draftConfig={draftConfig}
              usage={composerUsage}
              disabled={disabled || runtimeBlocked}
              modelSelectionPending={modelSelectionPending}
              onConnectionPendingChange={handleConnectionPendingChange}
              activeConfigPicker={activeConfigPicker}
              onConfigPickerOpenChange={handleConfigPickerOpenChange}
              onSelectModel={handleSelectModel}
              onSelectThought={onSelectThought}
              onSwitchMode={onSwitchMode}
              onSendCompressionCommand={onSendCompressionCommand}
              onOpenModelSettings={onOpenModelSettings}
            />
          </span>
        ) : null}
        {/* 业务辅助工具放在原生模型之后、发送之前，避免模型控制簇把右侧工具顺序截断。 */}
        {trailingToolsNode}
        {streamingChoice ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canSend}
              onClick={handleFollowUp}
              data-testid="v4-composer-follow-up"
              className="shrink-0"
            >
              {followUpLabel}
            </Button>
          </>
        ) : null}
        {showStopControl ? (
          <ControlHintTooltip
            title={stopTooltipTitle}
            shortcut="Esc"
            open={actionTooltipOpen}
            onOpenChange={setActionTooltipOpen}
          >
            <Button
              type="button"
              variant="secondary"
              size="icon-md"
              onClick={() => onStop()}
              data-testid={TID_V4_STOP}
              className="rounded-full"
              aria-label={stopTooltipTitle}
            >
              <SquareIcon className="size-4 fill-current" />
              <span className="sr-only">{stopTooltipTitle}</span>
            </Button>
          </ControlHintTooltip>
        ) : null}
        {!streamingChoice && !showStopControl ? (
          <ControlHintTooltip
            title={resolvedSendTooltipTitle}
            shortcut={resolvedSendTooltipShortcut}
            open={Boolean(modifierTooltip) || actionTooltipOpen}
            onOpenChange={setActionTooltipOpen}
          >
            <Button
              type="submit"
              size="icon-md"
              disabled={!canSend}
              onClick={handleSendButtonClick}
              data-testid={TID_V4_COMPOSER_SEND}
              aria-label={resolvedSendTooltipTitle}
              className="cursor-pointer gap-1 rounded-full bg-brand text-ui-base text-foreground-inverse hover:bg-brand/80"
            >
              {pending ? <Spinner className="size-4" /> : <ArrowUpIcon className="size-4" />}
              <span className="sr-only">{resolvedSendTooltipTitle}</span>
            </Button>
          </ControlHintTooltip>
        ) : null}
      </div>
    ),
    [
      intl,
      canSend,
      boundModel,
      boundModelLabel,
      handleFollowUp,
      sessionBoundInput,
      followUpLabel,
      streamingChoice,
      activeConfigPicker,
      composerPhase,
      composerUsage,
      disabled,
      modelSelectionPending,
      handleConnectionPendingChange,
      runtimeBlocked,
      draftConfig,
      draftMode,
      onStop,
      handleSendButtonClick,
      handleConfigPickerOpenChange,
      handleSelectModel,
      modelSelectionReload,
      modelSelectionRefresh,
      modelSelectionState,
      modelSelectionView,
      onSelectThought,
      onSendCompressionCommand,
      onOpenModelSettings,
      onSwitchMode,
      pending,
      provider,
      modifierTooltip,
      resolvedSendTooltipShortcut,
      resolvedSendTooltipTitle,
      actionTooltipOpen,
      remoteAvailable,
      sessionId,
      showStopControl,
      stopTooltipTitle,
      trailingToolsNode,
      workspaceIdentity,
      workspacePath,
    ],
  );

  // 左下：模式选择 + 当前 session 后台任务入口。followupMode 由 app 设置页同步到 CLI，
  // 不在 composer 暴露局部开关；后台入口只消费同一 snapshot，不维护第二份任务状态。
  // memo 捕获整个 snapshot 会让共享词法环境中的稳定发送回调也持有旧历史；只捕获展示字段。
  const backgroundWorks = snapshot?.backgroundWorks;
  const leadingActionsNode = useMemo(
    () => (
      <>
        {!sessionBoundInput ? (
          <V4ComposerModeSwitch
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            provider={provider}
            draftConfig={draftConfig}
            disabled={disabled || runtimeBlocked}
            activeConfigPicker={activeConfigPicker}
            onConfigPickerOpenChange={handleConfigPickerOpenChange}
            onSwitchMode={onSwitchMode}
          />
        ) : null}
        {!sessionBoundInput ? (
          <ConversationBackgroundWorkTrigger
            backgroundWorks={backgroundWorks ?? []}
            runningSubagentCount={runningSubagentCount}
            onOpen={onOpenRunningBackgroundWorks}
            openTarget={backgroundWorkOpenTarget}
          />
        ) : null}
      </>
    ),
    [
      activeConfigPicker,
      disabled,
      runtimeBlocked,
      draftConfig,
      handleConfigPickerOpenChange,
      backgroundWorkOpenTarget,
      onOpenRunningBackgroundWorks,
      onSwitchMode,
      provider,
      sessionBoundInput,
      runningSubagentCount,
      backgroundWorks,
      workspaceIdentity,
      workspacePath,
    ],
  );
  const isBlockedByInteraction = blockingRequestId !== null;

  // v4 pendingInteractions 是 bottom dock 阻塞态；composer 必须保留挂载，
  // 只在视觉和可访问树中隐藏，避免权限/问答卡片出现时丢失草稿和编辑器内部状态。
  return (
    // 外层 bottom dock 负责 sticky 与横向主列宽度；composer 自身组织错误提示与输入壳。
    // centered（居中草稿布局，m5）：收窄 max-w-2xl（旧
    // getChatViewComposerWidthClassName 的 draft 档），由宿主的居中容器摆位。
    // 有 contextHeader（草稿态）时，内层输入 surface 套旧 ChatViewComposer 同款卡：
    // rounded-2xl bg-surface shadow-xl/5；会话态回落不透明页面底色。
    // 错误横幅虽然排在 contextHeader 前面，但不能与输入区共用同一个圆角 surface，
    // 视觉上会被误认为输入卡标题栏；将 surface 边界收窄到工作区头和编辑器后，桌面与手机
    // Web 仍共享同一 DOM 顺序，同时恢复错误提示与输入卡之间的独立层级。
    <div
      data-testid={TID_V4_COMPOSER}
      role={composerAriaLabel ? "group" : undefined}
      aria-label={composerAriaLabel}
      data-input-routing={mode}
      data-interaction-state={showInteractionStatus ? interactionState : undefined}
      aria-hidden={isBlockedByInteraction ? true : undefined}
      style={isBlockedByInteraction ? { display: "none" } : undefined}
      className={cn(
        "chat-composer-region z-20 w-full shrink-0 @container/composer",
        centered && "max-w-2xl",
      )}
    >
      {interactionHint && (
        <p
          role="status"
          className="mb-2 break-words px-1 text-ui-sm text-foreground-subtle"
          data-testid="composer-interaction-status"
        >
          {interactionHint}
        </p>
      )}
      {/* 旧 ChatViewComposer 同款隐藏 file input（web/无 native picker 平台回退）。 */}
      <input
        ref={attachmentsApi.attachmentInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={attachmentsApi.handleAttachmentInputChange}
      />
      {visibleError ? (
        // 仅展示附件错误会漏掉会话级 lastError，任务失败后也应在输入框上方显示原因。
        // 这里复用旧 ChatErrorBanner 壳，只接收 SessionPane 已归一化后的当前错误。
        // 错误横幅独立于输入 surface，并先于桌面和手机共用的 contextHeader。
        <div className="mb-6 w-full shrink-0">
          <ChatErrorBanner
            error={visibleError}
            onRetry={onRetryError}
            onDismiss={onDismissError}
            onOpenModelSettings={onOpenModelSettings}
            modelConfigTarget={modelConfigTarget}
          />
        </div>
      ) : null}
      {initialization?.status === "failed" ? (
        // 初始化中只限制执行，不额外显示提示；失败时才显示错误和重试。
        // 状态条悬在可滚动正文上方；必须使用不透明 card，避免历史文字透入错误提示。
        <div
          data-testid="v4-session-initialization"
          role="alert"
          className="mb-2 flex w-full flex-wrap items-center gap-2 rounded-lg border border-card-border bg-card px-3 py-2 text-ui-base text-foreground-subtle"
        >
          <span className="min-w-0 flex-1">
            {intl.formatMessage({ id: "chat.initialization.failed" })}
          </span>
          {onRetryInitialization ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="v4-session-initialization-retry"
              onClick={onRetryInitialization}
            >
              {intl.formatMessage({ id: "chat.initialization.retry" })}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          "chat-composer-input-surface relative w-full",
          contextHeader && "rounded-2xl bg-surface shadow-xl/5",
          showInteractionStatus &&
            ["readOnly", "offline", "waiting", "blocked"].includes(interactionState) &&
            "rounded-2xl bg-surface text-foreground-subtle",
        )}
      >
        {contextHeader ? (
          // 旧 ChatViewComposer contextHeaderContent 同款包装（workspace 菜单 + Git 分支）。
          <div className="relative z-10 p-1.5 flex min-w-0 flex-wrap items-center gap-0">
            <ComposerSubmissionPendingContext.Provider value={updateTargetSelectionPending}>
              {contextHeader}
            </ComposerSubmissionPendingContext.Provider>
          </div>
        ) : null}
        {conversationSelectionLimitReason ? (
          <div
            role="alert"
            className="relative z-10 mb-2 w-full rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-2 text-ui-base text-foreground"
          >
            {intl.formatMessage({
              id: `chat.selections.limit.${conversationSelectionLimitReason}`,
            })}
          </div>
        ) : null}
        {previewMatches ? (
          <div className="px-3 py-2 text-ui-base">
            {!previewExpanded ? (
              <p className="line-clamp-2">{composerInputPreview?.summary}</p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={previewExpanded}
              onClick={() => setPreviewExpanded((value) => !value)}
            >
              {previewExpanded ? "收起完整待发送内容" : "查看并编辑完整待发送内容"}
            </Button>
          </div>
        ) : null}
        <div
          className={
            previewMatches && !previewExpanded ? "[&_[contenteditable]]:hidden" : undefined
          }
        >
          <ChatPromptEditor
            inputLabel={composerAriaLabel}
            extraPlugins={elementMentionPlugin}
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            taskId={sessionId}
            skillCatalogSessionId={skillCatalogSessionId}
            placeholder={
              readOnly
                ? zh
                  ? "只读会话"
                  : "Read-only conversation"
                : remoteAvailable
                  ? (composerPlaceholder ?? normalPlaceholder)
                  : intl.formatMessage({ id: "remote.conversation.sendUnavailable" })
            }
            disabled={inputUnavailable}
            shellClassName={
              showInteractionStatus && inputUnavailable
                ? "bg-surface shadow-none border-border text-foreground-subtle hover:border-border focus-within:!border-border focus-within:bg-surface"
                : undefined
            }
            disabledReason={interactionHint || undefined}
            submitting={pending}
            submitDisabled={
              pending ||
              connectionPending ||
              streamingChoice ||
              (!canReload &&
                (runtimeBlocked || !routingAllowsSend || !attachmentsReady || !submissionReady))
            }
            allowSubmitWhenEmpty={
              // 发送按钮已把代码评论视为可发送上下文，但这里曾漏掉同一状态，
              // 导致空文本仅附代码评论时 Enter 被编辑器判为空，必须改点发送按钮。
              hasCodeCommentContexts ||
              hasAttachments ||
              hasWebElementContexts ||
              hasPptxElementReferences ||
              hasConversationSelectionReferences
            }
            enterSubmits={enterSubmits}
            onModifiedSubmit={modifiedEnterSubmits ? handleModifiedEditorSubmit : undefined}
            submitLabel={sendTooltipTitle}
            showSlashButton
            // @ 是文件 / 对话 / 画板主入口；# 会话与 $ / ¥ / ￥ Skills
            // 仍由 MentionPlugin 保留兼容触发，但不在 + 菜单重复展示。
            showMentionButton
            topContent={topContentNode}
            attachmentAction={runtimeBlocked ? undefined : attachmentAction}
            drawingAction={
              composerSketch
                ? {
                    label: zh ? "画图" : "Draw",
                    disabled: toolsPort.disabled,
                    onSelect: () => setSketchOpen(true),
                  }
                : undefined
            }
            inputTestId={TID_V4_COMPOSER_INPUT}
            inputApiRef={inputApiRef}
            promptHistory={promptHistory.entries}
            // Bugfix 原因：命令目录必须完整来自 CLI workspace slash catalog；UI 只在
            // secondary pane 按产品能力隐藏 goal，不再追加任何内建命令或别名。
            excludedSlashCommandNames={suppressGoalCommands ? ["goal"] : undefined}
            appSlashCommands={appSlashCommands?.filter((command) =>
              command.recovery ? recoveryAvailable : !runtimeBlocked,
            )}
            conversationCommands={conversationCommands}
            enableMentionPanel
            leadingActions={
              <>
                {composerTools?.(toolsPort)}
                {leadingActionsNode}
              </>
            }
            submitControl={submitControlNode}
            className="p-0"
            onChange={handleEditorChange}
            onUserInputPresenceChange={handleUserInputPresenceChange}
            onSubmit={handleEditorSubmit}
            onPaste={attachmentsApi.handlePaste}
          />
        </div>
        {attachmentsApi.attachmentError ? (
          <p className="flex items-start gap-2 p-3 text-ui-base text-warning">
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
            <span>{attachmentsApi.attachmentError}</span>
          </p>
        ) : null}
      </div>
      {composerSketch?.(toolsPort, { open: sketchOpen, onOpenChange: setSketchOpen })}
      <ImagePreviewDialog
        initialIndex={attachmentPreviewIndex}
        items={composerMediaPreviewItems}
        onOpenChange={setAttachmentPreviewOpen}
        open={attachmentPreviewOpen}
      />
      <ChatMediaAttachmentPreviewDialog
        attachment={pdfAttachmentPreview}
        open={pdfAttachmentPreviewOpen}
        onOpenChange={(open) => {
          setPdfAttachmentPreviewOpen(open);
          if (!open) setPdfAttachmentPreview(null);
        }}
      />
      <Dialog
        open={heldQueueConfirmation !== null}
        onOpenChange={(open) => {
          if (!open && !pendingRef.current) {
            setHeldQueueConfirmation(null);
          }
        }}
      >
        <DialogContent
          data-testid={TID_V4_PAUSED_QUEUE_SEND_DIALOG}
          showCloseButton={false}
          className="max-w-xl gap-6 p-6 sm:p-8"
        >
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-md"
              disabled={pending}
              aria-label={intl.formatMessage({ id: "common.close" })}
              className="absolute top-4 right-4"
            >
              <XIcon className="size-5" />
            </Button>
          </DialogClose>
          <DialogHeader className="gap-3 pr-8">
            <DialogTitle className="text-xl font-semibold sm:text-2xl">
              {intl.formatMessage({ id: "chat.queue.sendConfirm.title" })}
            </DialogTitle>
            <DialogDescription className="text-ui-base sm:text-ui-lg">
              {intl.formatMessage(
                { id: "chat.queue.sendConfirm.description" },
                {
                  count: String(heldQueueConfirmation?.queueItemIds.length ?? 0),
                },
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3 sm:gap-3">
            <Button
              type="button"
              variant="destructive"
              size="lg"
              data-testid={TID_V4_COMPOSER_CLEAR_QUEUE_SEND}
              disabled={pending}
              className="min-w-32 rounded-full"
              onClick={handleClearQueueSend}
            >
              {intl.formatMessage({ id: "chat.queue.sendConfirm.clear" })}
            </Button>
            <Button
              type="button"
              size="lg"
              data-testid={TID_V4_COMPOSER_KEEP_QUEUE_SEND}
              disabled={pending}
              className="min-w-32 rounded-full"
              onClick={handleKeepQueueSend}
            >
              {pending ? <Spinner className="size-4" /> : null}
              {intl.formatMessage({ id: "chat.queue.sendConfirm.keep" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const ConversationComposer = memo(ConversationComposerImpl);
