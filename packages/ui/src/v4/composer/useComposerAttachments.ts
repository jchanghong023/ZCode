/* oxlint-disable eslint(max-lines) -- 附件采集、分 scope 上传调度和生命周期必须在同一 hook 中原子收口。 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { registerImageComposerTarget } from "@/image-preview-editor/index.js";
import { toast } from "@/components/ui/toast.js";
import { nanoid } from "nanoid";
import type { AttachmentRef } from "@zcode/shared/zcode-protocol-v4";
import { WORKSPACE_FILE_DRAG_MIME } from "@/lib/workspaceFileDrag.js";
import {
  MAX_CHAT_ATTACHMENTS,
  MissingInlinePdfContentError,
  OversizedInlinePdfAttachmentError,
  OversizedInlineVideoAttachmentError,
  createChatComposerAttachment,
  createChatComposerPathAttachment,
  createClipboardTextComposerAttachment,
  formatAttachmentSize,
  revokeChatComposerAttachment,
  serializeChatComposerAttachment,
  shouldCreateClipboardTextAttachment,
  shouldPreferSpreadsheetClipboardText,
  type ChatComposerAttachment,
} from "@/lib/chatAttachments.js";
import type { ChatComposerPasteEvent } from "@/LexicalChatInput.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { logger } from "@/logger.js";
import {
  readComposerAttachmentScope,
  updateComposerAttachmentScope,
  useComposerAttachmentUploadStore,
  type ComposerAttachmentUploadItem,
  type ComposerAttachmentUploadStatus,
} from "@/store/composerAttachmentUploadStore.js";
import { uploadComposerAttachment, type AttachmentPutFn } from "@/v4/composer/attachmentUpload.js";
import { composerDraftScopeKey } from "@/v4/composer/composerDraftStore.js";

export const COMPOSER_ATTACHMENT_UPLOAD_CONCURRENCY = 2;
export const COMPOSER_ATTACHMENT_AUTO_RETRY_DELAY_MS = 500;
export const COMPOSER_ATTACHMENT_COMPLETE_VISIBLE_MS = 300;
/**
 * 换代重传的兜底上限。dev 实测同一 workspace 可达 runtimeGeneration=4（3 次换代），
 * 取 5 留余量；它只防 Helper 反复崩溃时的无限重传，正常使用不该触达。
 */
export const COMPOSER_ATTACHMENT_REBUILD_RETRY_LIMIT = 5;
const EMPTY_COMPOSER_ATTACHMENTS: ComposerAttachmentUploadItem[] = [];
const REMOTE_ATTACHMENT_NOT_STAGED_ERROR_CODE = "remoteAttachmentNotStaged";
export type {
  ComposerAttachmentUploadItem,
  ComposerAttachmentUploadStatus,
} from "@/store/composerAttachmentUploadStore.js";

interface UploadTarget {
  sessionId: string | null;
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  attachmentPut: AttachmentPutFn;
}

interface UploadQueueEntry {
  scopeKey: string;
  attachmentId: string;
}

export interface ComposerAttachmentsApi {
  attachments: ComposerAttachmentUploadItem[];
  attachmentError: string | null;
  hasAttachments: boolean;
  hasUnreadyAttachments: boolean;
  composerDragKind: "attachment" | "workspace" | null;
  isDraggingOverComposer: boolean;
  attachmentInputRef: React.RefObject<HTMLInputElement | null>;
  openAttachmentPicker: () => void;
  handleAttachmentInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handlePaste: (event: ChatComposerPasteEvent) => void;
  handleDragOverComposer: (event: React.DragEvent<HTMLElement>) => void;
  handleDragLeaveComposer: (event: React.DragEvent<HTMLElement>) => void;
  handleDropComposer: (event: React.DragEvent<HTMLElement>) => void;
  /** 程序化加入文件（插件 UI 图片上下文等）；返回被接受的附件 id，超出上限的部分被丢弃。 */
  addAttachmentFiles: (files: File[]) => string[];
  removeAttachment: (id: string) => void;
  retryAttachment: (id: string) => void;
  /**
   * 发送成功只清冻结的附件 id；不传表示用户主动清空整个附件区。targetScopeKey 用于提交期间
   * scope 已切走（composer 编辑态结束）时仍结算提交时的 scope。
   */
  clearAttachments: (attachmentIds?: readonly string[], targetScopeKey?: string) => void;
  /** 草稿跨工作区时重新准备附件，不能继承旧 session 的上传引用。 */
  restoreDraftAttachments: (attachments: readonly ChatComposerAttachment[]) => void;
  /** 把已由 session 接管的 queue refs 原样恢复为 ready chips；不重复上传。 */
  restoreSessionOwnedAttachments: (attachments: readonly AttachmentRef[]) => boolean;
  /** 只返回已 ready ref；任一附件未就绪时返回 null 作 submit 二次门禁。 */
  prepareForSend: () => Promise<AttachmentRef[] | null>;
  /** 当前附件 scope 的 key；提交时冻结，供结算时传回。 */
  scopeKey: string;
  setAttachmentError: (message: string | null) => void;
}

export interface UseComposerAttachmentsOptions {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  scopeId: string;
  clientNamespace?: string;
  attachmentSessionId?: string | null;
  attachmentPut: AttachmentPutFn;
  onRuntimeRestart?: (listener: () => void) => () => void;
  /**
   * 承载 transport 暴露 runtime 存活态时优先用它，替代 onRuntimeRestart。
   * unavailable 在 workspace-dispose 当场到达，把作废与唤醒拆到两个真实时点。
   */
  onRuntimeLifecycle?: (listener: (state: "available" | "unavailable") => void) => () => void;
  disabled?: boolean;
  /**
   * 是否消费全局 add-to-chat 事件（图片/附件注入）。
   * 语义与 useWebElementContexts 等一致：由调用方传 `listenAddToChatEvents && !disabled`
   * （SessionPane 以 focused 区分聚焦 composer）。SidePane forceMount 常驻多个同
   * workspace 的 SessionPane，若不门控，一次事件会被所有 composer 同时消费并各自注入附件。
   */
  listenAddToChatEvents?: boolean;
}

export function buildScopeKey(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  scopeId: string,
  clientNamespace?: string,
): string {
  return composerDraftScopeKey(
    workspaceIdentity?.trim() || workspacePath,
    scopeId,
    clientNamespace,
  );
}

/** queue / 已发送消息中的 AttachmentRef 已由 session 接管：恢复为 ready chip，不重复上传。 */
function createSessionOwnedAttachmentItems(
  attachmentRefs: readonly AttachmentRef[],
): ComposerAttachmentUploadItem[] {
  return attachmentRefs.map((attachmentRef) => {
    const id = nanoid();
    return {
      id,
      filename: attachmentRef.fileName,
      ...(attachmentRef.sourceKind
        ? { sourceKind: attachmentRef.sourceKind, messageCount: attachmentRef.messageCount }
        : {}),
      mimeType: attachmentRef.mime,
      sizeBytes: attachmentRef.bytes,
      referenceOwnership: "session",
      uploadStatus: "ready",
      uploadProgress: 100,
      attachmentRef: { ...attachmentRef },
      autoRetryCount: 0,
      runtimeRebuildRetryCount: 0,
      showComplete: false,
      localZeroCopy: false,
    };
  });
}

/**
 * composer 编辑态：进入前把待编辑消息的附件预置到 edit scope，
 * 退出后清空该 scope。附件 store 按 scope 隔离，原草稿的附件留在原 scope 不受影响。
 */
export function replaceComposerAttachmentsForScope(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  scopeId: string,
  attachmentRefs: readonly AttachmentRef[],
  clientNamespace?: string,
): readonly ComposerAttachmentUploadItem[] {
  const items = createSessionOwnedAttachmentItems(attachmentRefs);
  updateComposerAttachmentScope(
    buildScopeKey(workspacePath, workspaceIdentity, scopeId, clientNamespace),
    () => items,
  );
  return items;
}

/**
 * session-owned 媒体没有本地文件，读回后补上预览 URL，composer 卡片才有缩略图与 gallery 入口。
 * 条目已被删除或 scope 已退出时返回 false，由调用方回收自己创建的 Blob URL。
 */
export function setComposerAttachmentPreviewUrlForScope(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  scopeId: string,
  attachmentId: string,
  objectUrl: string,
  clientNamespace?: string,
): boolean {
  const scopeKey = buildScopeKey(workspacePath, workspaceIdentity, scopeId, clientNamespace);
  if (!readComposerAttachmentScope(scopeKey).some((item) => item.id === attachmentId)) return false;
  updateComposerAttachmentScope(scopeKey, (current) =>
    current.map((item) => (item.id === attachmentId ? { ...item, objectUrl } : item)),
  );
  return true;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  return error instanceof Error && error.cause !== undefined ? isAbortError(error.cause) : false;
}

class RemoteAttachmentNotStagedError extends Error {
  readonly code = REMOTE_ATTACHMENT_NOT_STAGED_ERROR_CODE;
}

export function isTransientAttachmentUploadError(error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (error instanceof OversizedInlineVideoAttachmentError) return false;
  if (error instanceof OversizedInlinePdfAttachmentError) return false;
  if (error instanceof MissingInlinePdfContentError) return false;
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === REMOTE_ATTACHMENT_NOT_STAGED_ERROR_CODE
  ) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  // video 超限错误必须在黑名单里，否则会触发一次无意义重试；按错误类型精确拦截，
  // 避免扩大 message 正则后改变 image 超限的既有判定。
  return !/(?:payloadTooLarge|invalidBase64|invalidServerProgress|frameTooLarge|permission|EACCES|ENOENT|not found|unsupported|附件缺少|缺少可读取内容|远端附件未完成物化)/iu.test(
    message,
  );
}

function progressPercent(uploadedBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0;
  return Math.min(99, Math.max(0, Math.floor((uploadedBytes / totalBytes) * 99)));
}

function isRemoteAttachmentTarget(
  target: Pick<UploadTarget, "remoteSessionId" | "workspaceIdentity">,
) {
  // 这里曾要求 workspaceIdentity 能被当前解析器识别。远端 identity 新增格式或
  // 暂时非规范时，在 remoteSessionId 注入前会被误判为本地 workspace，使 host localPath
  // 直接走零复制交给远端 Agent。identity 只承担隔离语义；任意非空值都必须按远端 fail closed。
  return Boolean(target.remoteSessionId?.trim() || target.workspaceIdentity?.trim());
}

export function useComposerAttachments(
  options: UseComposerAttachmentsOptions,
): ComposerAttachmentsApi {
  const {
    workspacePath,
    workspaceIdentity,
    remoteSessionId,
    scopeId,
    clientNamespace,
    attachmentSessionId = null,
    attachmentPut,
    onRuntimeRestart,
    onRuntimeLifecycle,
    disabled = false,
    listenAddToChatEvents = true,
  } = options;
  const { intl } = useZCodeIntl();
  const scopeKey = buildScopeKey(workspacePath, workspaceIdentity, scopeId, clientNamespace);

  const targetsRef = useRef(new Map<string, UploadTarget>());
  const uploadQueueRef = useRef<UploadQueueEntry[]>([]);
  const activeUploadsRef = useRef(0);
  const controllersRef = useRef(new Map<string, AbortController>());
  const completeTimersRef = useRef(new Map<string, number>());
  const retryTimersRef = useRef(new Map<string, number>());
  const pumpQueueRef = useRef<() => void>(() => {});
  const attachments = useComposerAttachmentUploadStore(
    (state) => state.scopes[scopeKey] ?? EMPTY_COMPOSER_ATTACHMENTS,
  );
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  /**
   * runtime 换代计数。换代后 attachmentSessionId 可能原地不变（正式会话由 cold-resume 恢复），
   * 只靠它做依赖会漏掉唤醒，附件将永久停在 waitingSession。
   */
  const [restartEpoch, setRestartEpoch] = useState(0);
  const [composerDragKind, setComposerDragKind] = useState<"attachment" | "workspace" | null>(null);
  const isDraggingOverComposer = composerDragKind !== null;
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const dragFeedbackTimerRef = useRef<number | null>(null);

  targetsRef.current.set(scopeKey, {
    sessionId: attachmentSessionId,
    workspacePath,
    workspaceIdentity,
    remoteSessionId,
    attachmentPut,
  });

  const commitScope = useCallback(
    (
      targetScopeKey: string,
      update: (current: ComposerAttachmentUploadItem[]) => ComposerAttachmentUploadItem[],
    ) => {
      updateComposerAttachmentScope(targetScopeKey, update);
    },
    [],
  );

  const updateItem = useCallback(
    (
      targetScopeKey: string,
      attachmentId: string,
      update: (item: ComposerAttachmentUploadItem) => ComposerAttachmentUploadItem,
    ) => {
      commitScope(targetScopeKey, (current) =>
        current.map((item) => (item.id === attachmentId ? update(item) : item)),
      );
    },
    [commitScope],
  );

  const enqueueUpload = useCallback((targetScopeKey: string, attachmentId: string) => {
    const exists = uploadQueueRef.current.some(
      (entry) => entry.scopeKey === targetScopeKey && entry.attachmentId === attachmentId,
    );
    if (!exists) uploadQueueRef.current.push({ scopeKey: targetScopeKey, attachmentId });
    queueMicrotask(() => pumpQueueRef.current());
  }, []);

  const finishWithReady = useCallback(
    (targetScopeKey: string, attachmentId: string, ref: AttachmentRef) => {
      updateItem(targetScopeKey, attachmentId, (item) => ({
        ...item,
        uploadStatus: "ready",
        uploadProgress: 100,
        uploadError: undefined,
        uploadErrorKind: undefined,
        attachmentRef: ref,
        showComplete: !item.localZeroCopy,
      }));
      const timerKey = `${targetScopeKey}\u0000${attachmentId}`;
      const previousTimer = completeTimersRef.current.get(timerKey);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      const timer = window.setTimeout(() => {
        completeTimersRef.current.delete(timerKey);
        updateItem(targetScopeKey, attachmentId, (item) => ({
          ...item,
          showComplete: false,
        }));
      }, COMPOSER_ATTACHMENT_COMPLETE_VISIBLE_MS);
      completeTimersRef.current.set(timerKey, timer);
    },
    [updateItem],
  );

  const runUpload = useCallback(
    async (targetScopeKey: string, attachmentId: string, target: UploadTarget) => {
      const controllerKey = `${targetScopeKey}\u0000${attachmentId}`;
      const controller = new AbortController();
      controllersRef.current.set(controllerKey, controller);
      updateItem(targetScopeKey, attachmentId, (item) => ({
        ...item,
        uploadStatus: "uploading",
        uploadProgress: Math.min(item.uploadProgress, 99),
        uploadError: undefined,
        uploadErrorKind: undefined,
      }));
      try {
        const item = readComposerAttachmentScope(targetScopeKey).find(
          (candidate) => candidate.id === attachmentId,
        );
        if (!item || !target.sessionId) return;
        // Web 只上传浏览器持有的字节；宿主路径不能冒充可跨主机转移的附件。
        if (item.localPath && isRemoteAttachmentTarget(target)) {
          throw new RemoteAttachmentNotStagedError(
            intl.formatMessage({ id: "chat.attachments.upload.remoteMaterializationRequired" }),
          );
        }

        const serialized = await serializeChatComposerAttachment(item);
        const ref = await uploadComposerAttachment(
          target.attachmentPut,
          target.sessionId,
          serialized,
          {
            signal: controller.signal,
            onProgress(progress) {
              if (controllersRef.current.get(controllerKey) !== controller) return;
              updateItem(targetScopeKey, attachmentId, (current) => ({
                ...current,
                uploadStatus: progress.phase === "committing" ? "committing" : "uploading",
                uploadProgress: Math.max(
                  current.uploadProgress,
                  progressPercent(progress.uploadedBytes, progress.totalBytes),
                ),
              }));
            },
          },
        );
        if (!ref) throw new Error("附件缺少可读取内容");
        if (controllersRef.current.get(controllerKey) !== controller) return;
        finishWithReady(targetScopeKey, attachmentId, ref);
      } catch (error) {
        if (controllersRef.current.get(controllerKey) !== controller || controller.signal.aborted) {
          return;
        }
        const current = readComposerAttachmentScope(targetScopeKey).find(
          (candidate) => candidate.id === attachmentId,
        );
        if (!current) return;
        // 结构化超限错误在 UI 层按 locale 格式化（与 chatAttachments 序列化边界约定一致）。
        const message =
          error instanceof OversizedInlineVideoAttachmentError
            ? intl.formatMessage(
                { id: "chat.attachments.oversizedInlineVideo" },
                {
                  filename: error.filename,
                  size: formatAttachmentSize(error.sizeBytes),
                  maxSize: formatAttachmentSize(error.maxSizeBytes),
                },
              )
            : error instanceof OversizedInlinePdfAttachmentError
              ? intl.formatMessage(
                  { id: "chat.attachments.oversizedInlinePdf" },
                  {
                    filename: error.filename,
                    size: formatAttachmentSize(error.sizeBytes),
                    maxSize: formatAttachmentSize(error.maxSizeBytes),
                  },
                )
              : error instanceof MissingInlinePdfContentError
                ? intl.formatMessage(
                    { id: "chat.attachments.missingInlinePdfContent" },
                    { filename: error.filename },
                  )
                : formatUserFacingError(
                    error,
                    intl.formatMessage({ id: "chat.attachments.upload.unavailable" }),
                  );
        const transient = isTransientAttachmentUploadError(error);
        if (transient && current.autoRetryCount < 1) {
          updateItem(targetScopeKey, attachmentId, (item) => ({
            ...item,
            uploadStatus: "queued",
            uploadProgress: 0,
            uploadError: message,
            uploadErrorKind: "transient",
            autoRetryCount: item.autoRetryCount + 1,
          }));
          const timerKey = `${targetScopeKey}\u0000${attachmentId}`;
          const timer = window.setTimeout(() => {
            retryTimersRef.current.delete(timerKey);
            enqueueUpload(targetScopeKey, attachmentId);
          }, COMPOSER_ATTACHMENT_AUTO_RETRY_DELAY_MS);
          retryTimersRef.current.set(timerKey, timer);
        } else {
          updateItem(targetScopeKey, attachmentId, (item) => ({
            ...item,
            uploadStatus: "failed",
            uploadProgress: Math.min(item.uploadProgress, 99),
            uploadError: message,
            uploadErrorKind: transient ? "transient" : "permanent",
          }));
          logger.warn("[v4-composer-attachments] 附件上传失败", {
            attachmentId,
            error: error instanceof Error ? error.message : String(error),
            scopeKey: targetScopeKey,
          });
        }
      } finally {
        if (controllersRef.current.get(controllerKey) === controller) {
          controllersRef.current.delete(controllerKey);
        }
        activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
        pumpQueueRef.current();
      }
    },
    [enqueueUpload, finishWithReady, intl, updateItem],
  );

  const pumpQueue = useCallback(() => {
    while (
      activeUploadsRef.current < COMPOSER_ATTACHMENT_UPLOAD_CONCURRENCY &&
      uploadQueueRef.current.length > 0
    ) {
      const entry = uploadQueueRef.current.shift();
      if (!entry) break;
      const item = readComposerAttachmentScope(entry.scopeKey).find(
        (candidate) => candidate.id === entry.attachmentId,
      );
      if (!item || (item.uploadStatus !== "queued" && item.uploadStatus !== "waitingSession")) {
        continue;
      }
      const target = targetsRef.current.get(entry.scopeKey);
      const waitingForRemoteSession = Boolean(
        target && item.localPath && isRemoteAttachmentTarget(target) && !target.remoteSessionId,
      );
      if (!target?.sessionId || waitingForRemoteSession) {
        updateItem(entry.scopeKey, entry.attachmentId, (current) => ({
          ...current,
          uploadStatus: "waitingSession",
        }));
        continue;
      }
      activeUploadsRef.current += 1;
      void runUpload(entry.scopeKey, entry.attachmentId, target);
    }
  }, [runUpload, updateItem]);
  pumpQueueRef.current = pumpQueue;

  useEffect(() => {
    const current = readComposerAttachmentScope(scopeKey);
    const remoteTargetReady =
      !isRemoteAttachmentTarget({ remoteSessionId, workspaceIdentity }) || Boolean(remoteSessionId);
    if (attachmentSessionId && remoteTargetReady) {
      for (const item of current) {
        if (item.uploadStatus === "waitingSession") {
          updateItem(scopeKey, item.id, (candidate) => ({
            ...candidate,
            uploadStatus: "queued",
          }));
          enqueueUpload(scopeKey, item.id);
        }
      }
    }
  }, [
    attachmentSessionId,
    enqueueUpload,
    remoteSessionId,
    restartEpoch,
    scopeKey,
    updateItem,
    workspaceIdentity,
  ]);

  /**
   * 换代作废：撤掉 in-flight 上传与远端暂存，把附件降回 waitingSession 等新会话。
   * silent=true 时不写错误文案——那是一次全自动恢复（作废 → 预热重建 → 重传，1-2s 内完成），
   * 报错只会让用户以为出了问题；waitingSession 本身已渲染成「正在等待会话」。
   */
  const invalidateAttachmentsForRuntimeChange = useCallback(
    ({ silent }: { silent: boolean }) => {
      for (const [targetScopeKey, items] of Object.entries(
        useComposerAttachmentUploadStore.getState().scopes,
      )) {
        const target = targetsRef.current.get(targetScopeKey);
        if (!target) continue;
        for (const item of items) {
          if (
            item.referenceOwnership === "session" ||
            item.localZeroCopy ||
            item.uploadStatus === "failed"
          ) {
            continue;
          }
          const key = `${targetScopeKey}\u0000${item.id}`;
          controllersRef.current.get(key)?.abort();
          controllersRef.current.delete(key);
          if (item.runtimeRebuildRetryCount >= COMPOSER_ATTACHMENT_REBUILD_RETRY_LIMIT) {
            // 重传配额用尽是真失败，无论静默与否都必须让用户看见。
            updateItem(targetScopeKey, item.id, (current) => ({
              ...current,
              uploadStatus: "failed",
              uploadProgress: 0,
              uploadError: intl.formatMessage({
                id: "chat.attachments.upload.runtimeRestarted",
              }),
              uploadErrorKind: "runtimeRestarted",
              attachmentRef: undefined,
              showComplete: false,
            }));
            continue;
          }
          // 换代后 targetsRef 里的 sessionId 必然陈旧（它在渲染期写入，而换代事件先于
          // 下一次渲染到达），拿它入队会直撞 sessionNotFound。一律降到 waitingSession，
          // 由 restartEpoch / 新 attachmentSessionId 驱动的唤醒 effect 在会话可用后统一入队。
          updateItem(targetScopeKey, item.id, (current) => ({
            ...current,
            uploadStatus: "waitingSession",
            uploadProgress: 0,
            ...(silent
              ? { uploadError: undefined, uploadErrorKind: undefined }
              : {
                  uploadError: intl.formatMessage({
                    id: "chat.attachments.upload.runtimeRestarted",
                  }),
                  uploadErrorKind: "runtimeRestarted" as const,
                }),
            attachmentRef: undefined,
            showComplete: false,
            runtimeRebuildRetryCount: current.runtimeRebuildRetryCount + 1,
          }));
        }
      }
    },
    [intl, updateItem],
  );

  useEffect(() => {
    // 二选一订阅：两条通道都订会让同一次换代作废两次，白烧一次重传配额。
    if (onRuntimeLifecycle) {
      return onRuntimeLifecycle((state) => {
        if (state === "unavailable") {
          // 作废与唤醒到此才真正解耦：此刻旧 CLI 已死、新的还没起来，递增 restartEpoch 会让
          // 唤醒 effect 立即入队并直撞死进程（正式会话态 sessionId 原地不变时尤其明显）。
          invalidateAttachmentsForRuntimeChange({ silent: true });
          return;
        }
        // 草稿态实际由重建后的新 attachmentSessionId 唤醒；这一路是正式会话态的兜底。
        setRestartEpoch((current) => current + 1);
      });
    }
    if (!onRuntimeRestart) return;
    return onRuntimeRestart(() => {
      invalidateAttachmentsForRuntimeChange({ silent: false });
      // 作废与唤醒解耦：这里只负责作废，入队交给依赖 restartEpoch 的唤醒 effect。
      setRestartEpoch((current) => current + 1);
    });
  }, [invalidateAttachmentsForRuntimeChange, onRuntimeLifecycle, onRuntimeRestart]);

  const showAttachmentLimitWarning = useCallback(() => {
    // 只更新输入框底部文字时，重复超限缺少明显反馈；每次添加都弹提示，同一输入框不堆叠。
    toast(
      intl.formatMessage(
        { id: "chat.attachments.maxFiles" },
        { count: String(MAX_CHAT_ATTACHMENTS) },
      ),
      { variant: "warning", position: "bottom-center", dedupeKey: `attachment-limit:${scopeKey}` },
    );
  }, [intl, scopeKey]);

  const addPreparedAttachments = useCallback(
    (selectedAttachments: ChatComposerAttachment[]): string[] => {
      if (selectedAttachments.length === 0) return [];
      const current = readComposerAttachmentScope(scopeKey);
      const remainingSlots = MAX_CHAT_ATTACHMENTS - current.length;
      if (remainingSlots <= 0) {
        selectedAttachments.forEach(revokeChatComposerAttachment);
        showAttachmentLimitWarning();
        return [];
      }
      const accepted = selectedAttachments.slice(0, remainingSlots);
      selectedAttachments.slice(remainingSlots).forEach(revokeChatComposerAttachment);
      const target = targetsRef.current.get(scopeKey);
      const items: ComposerAttachmentUploadItem[] = accepted.map((attachment) => {
        // 远端 identity 往往早于 remoteSessionId 注入；这段窗口不能退化为本地路径直读。
        const localZeroCopy = Boolean(
          attachment.localPath && target && !isRemoteAttachmentTarget(target),
        );
        return {
          ...attachment,
          referenceOwnership: "composer",
          uploadStatus: localZeroCopy ? "ready" : target?.sessionId ? "queued" : "waitingSession",
          uploadProgress: localZeroCopy ? 100 : 0,
          ...(localZeroCopy && attachment.localPath
            ? {
                attachmentRef: {
                  ref: attachment.localPath,
                  fileName: attachment.filename,
                  mime: attachment.mimeType,
                  bytes: attachment.sizeBytes,
                },
              }
            : {}),
          autoRetryCount: 0,
          runtimeRebuildRetryCount: 0,
          showComplete: false,
          localZeroCopy,
        };
      });
      commitScope(scopeKey, (existing) => [...existing, ...items]);
      setAttachmentError(null);
      if (selectedAttachments.length > remainingSlots) showAttachmentLimitWarning();
      for (const item of items) {
        if (item.uploadStatus === "queued") enqueueUpload(scopeKey, item.id);
      }
      return items.map((item) => item.id);
    },
    [commitScope, enqueueUpload, scopeKey, showAttachmentLimitWarning],
  );

  const addAttachmentFiles = useCallback(
    (selectedFiles: File[]): string[] => {
      if (disabled) return [];
      // 浏览器没有宿主绝对路径；选择器/拖拽/粘贴拿到的 File 一律走上传字节链路。
      return addPreparedAttachments(
        selectedFiles.map((file) => createChatComposerAttachment(file)),
      );
    },
    [addPreparedAttachments, disabled],
  );

  useLayoutEffect(() => {
    if (!listenAddToChatEvents || disabled) return;
    // 导出 PNG 是异步的；在 commit 阶段释放旧接收方，避免 passive effect 前的回调写入旧草稿。
    return registerImageComposerTarget({
      append: (file) => addAttachmentFiles([file]).length === 1,
    });
  }, [listenAddToChatEvents, disabled, addAttachmentFiles, scopeKey]);

  const openAttachmentPicker = useCallback(() => {
    if (readComposerAttachmentScope(scopeKey).length >= MAX_CHAT_ATTACHMENTS) {
      showAttachmentLimitWarning();
      return;
    }
    // 选择器返回 File 后直接生成浏览器本地缩略图，发送走上传字节链路。
    attachmentInputRef.current?.click();
  }, [scopeKey, showAttachmentLimitWarning]);

  const handleAttachmentInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      addAttachmentFiles(files);
    },
    [addAttachmentFiles],
  );

  const handlePaste = useCallback(
    (event: ChatComposerPasteEvent) => {
      if (disabled || !event.clipboardData) return;
      const files = Array.from(event.clipboardData.files);
      const text = event.clipboardData.getData("text/plain");
      const html = event.clipboardData.getData("text/html");
      const prefersSpreadsheetText =
        files.length > 0 && shouldPreferSpreadsheetClipboardText(text, html);
      if (files.length > 0) {
        logger.debug("[v4-composer-attachments] 识别剪贴板多表示 payload", {
          clipboardTypes: Array.from(event.clipboardData.types),
          fileTypes: files.map((file) => file.type),
          prefersSpreadsheetText,
          textLength: text.length,
        });
      }
      if (files.length > 0 && !prefersSpreadsheetText) {
        event.preventDefault();
        event.stopPropagation?.();
        addAttachmentFiles(files);
        return;
      }
      if (!shouldCreateClipboardTextAttachment(text)) return;
      event.preventDefault();
      event.stopPropagation?.();
      try {
        // 长粘贴在浏览器内直接构造文本 File，不依赖宿主临时文件目录。
        addPreparedAttachments([createClipboardTextComposerAttachment(text)]);
      } catch (error) {
        logger.warn("[v4-composer-attachments] 创建粘贴文本附件失败", error);
        setAttachmentError(
          intl.formatMessage(
            { id: "chat.attachments.readFailed" },
            { message: error instanceof Error ? error.message : String(error) },
          ),
        );
      }
    },
    [addAttachmentFiles, addPreparedAttachments, disabled, intl],
  );

  const clearDragFeedbackTimer = useCallback(() => {
    if (dragFeedbackTimerRef.current !== null) {
      window.clearTimeout(dragFeedbackTimerRef.current);
      dragFeedbackTimerRef.current = null;
    }
  }, []);
  const resetComposerDragFeedback = useCallback(() => {
    clearDragFeedbackTimer();
    setComposerDragKind(null);
  }, [clearDragFeedbackTimer]);
  const scheduleComposerDragFeedbackReset = useCallback(() => {
    clearDragFeedbackTimer();
    dragFeedbackTimerRef.current = window.setTimeout(resetComposerDragFeedback, 300);
  }, [clearDragFeedbackTimer, resetComposerDragFeedback]);

  useEffect(() => {
    const handleDocumentDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) resetComposerDragFeedback();
    };
    window.addEventListener("dragend", resetComposerDragFeedback);
    window.addEventListener("drop", resetComposerDragFeedback);
    window.addEventListener("blur", resetComposerDragFeedback);
    document.addEventListener("dragleave", handleDocumentDragLeave);
    return () => {
      clearDragFeedbackTimer();
      window.removeEventListener("dragend", resetComposerDragFeedback);
      window.removeEventListener("drop", resetComposerDragFeedback);
      window.removeEventListener("blur", resetComposerDragFeedback);
      document.removeEventListener("dragleave", handleDocumentDragLeave);
    };
  }, [clearDragFeedbackTimer, resetComposerDragFeedback]);

  const handleDragOverComposer = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      const types = Array.from(event.dataTransfer.types);
      const hasFiles = Array.from(event.dataTransfer.items ?? []).some(
        (item) => item.kind === "file",
      );
      if (!hasFiles && !types.includes("Files") && !types.includes(WORKSPACE_FILE_DRAG_MIME)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setComposerDragKind(types.includes(WORKSPACE_FILE_DRAG_MIME) ? "workspace" : "attachment");
      scheduleComposerDragFeedbackReset();
    },
    [scheduleComposerDragFeedbackReset],
  );
  const handleDragLeaveComposer = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node && event.currentTarget.contains(nextTarget))) {
        resetComposerDragFeedback();
      }
    },
    [resetComposerDragFeedback],
  );
  const handleDropComposer = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (Array.from(event.dataTransfer.types).includes(WORKSPACE_FILE_DRAG_MIME)) {
        event.preventDefault();
        resetComposerDragFeedback();
        return;
      }
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        event.preventDefault();
        addAttachmentFiles(files);
      }
      resetComposerDragFeedback();
    },
    [addAttachmentFiles, resetComposerDragFeedback],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      const current = readComposerAttachmentScope(scopeKey);
      const item = current.find((candidate) => candidate.id === id);
      if (!item) return;
      const key = `${scopeKey}\u0000${id}`;
      controllersRef.current.get(key)?.abort();
      controllersRef.current.delete(key);
      uploadQueueRef.current = uploadQueueRef.current.filter(
        (entry) => !(entry.scopeKey === scopeKey && entry.attachmentId === id),
      );
      const completeTimer = completeTimersRef.current.get(key);
      if (completeTimer !== undefined) window.clearTimeout(completeTimer);
      const retryTimer = retryTimersRef.current.get(key);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      completeTimersRef.current.delete(key);
      retryTimersRef.current.delete(key);
      revokeChatComposerAttachment(item);
      commitScope(scopeKey, (items) => items.filter((candidate) => candidate.id !== id));
      setAttachmentError(null);
    },
    [commitScope, scopeKey],
  );

  const retryAttachment = useCallback(
    (id: string) => {
      const current = readComposerAttachmentScope(scopeKey).find(
        (candidate) => candidate.id === id,
      );
      if (!current || current.uploadStatus !== "failed") return;
      const target = targetsRef.current.get(scopeKey);
      updateItem(scopeKey, id, (item) => ({
        ...item,
        uploadStatus: target?.sessionId ? "queued" : "waitingSession",
        uploadProgress: 0,
        uploadError: undefined,
        uploadErrorKind: undefined,
        attachmentRef: undefined,
        autoRetryCount: 0,
        runtimeRebuildRetryCount: 0,
        showComplete: false,
      }));
      if (target?.sessionId) enqueueUpload(scopeKey, id);
    },
    [enqueueUpload, scopeKey, updateItem],
  );

  const clearAttachments = useCallback(
    (attachmentIds?: readonly string[], targetScopeKey: string = scopeKey) => {
      const ids = attachmentIds ? new Set(attachmentIds) : null;
      const current = readComposerAttachmentScope(targetScopeKey).filter(
        (item) => !ids || ids.has(item.id),
      );
      for (const item of current) {
        const key = `${targetScopeKey}\u0000${item.id}`;
        controllersRef.current.get(key)?.abort();
        controllersRef.current.delete(key);
        const completeTimer = completeTimersRef.current.get(key);
        if (completeTimer !== undefined) window.clearTimeout(completeTimer);
        const retryTimer = retryTimersRef.current.get(key);
        if (retryTimer !== undefined) window.clearTimeout(retryTimer);
        completeTimersRef.current.delete(key);
        retryTimersRef.current.delete(key);
        revokeChatComposerAttachment(item);
      }
      // ACK 到达后清空整个 scope，会顺手删除等待期间新加入的附件。
      uploadQueueRef.current = uploadQueueRef.current.filter(
        (entry) =>
          entry.scopeKey !== targetScopeKey || (ids !== null && !ids.has(entry.attachmentId)),
      );
      commitScope(targetScopeKey, (items) =>
        ids ? items.filter((item) => !ids.has(item.id)) : [],
      );
      setAttachmentError(null);
    },
    [commitScope, scopeKey],
  );

  const restoreDraftAttachments = useCallback(
    (source: readonly ChatComposerAttachment[]) => {
      // 新项目可能使用另一 Host/session；保留原始 File/路径，重新生成预览和上传归属。
      const restored = source.map((item) => ({
        sourceKind: item.sourceKind,
        messageCount: item.messageCount,
        lineCount: item.lineCount,
        charCount: item.charCount,
        ...(item.file
          ? createChatComposerAttachment(item.file, item.localPath)
          : createChatComposerPathAttachment(item.localPath!)),
      }));
      clearAttachments();
      addPreparedAttachments(restored);
    },
    [addPreparedAttachments, clearAttachments],
  );

  const restoreSessionOwnedAttachments = useCallback(
    (attachmentRefs: readonly AttachmentRef[]): boolean => {
      if (attachmentRefs.length === 0) return true;
      if (readComposerAttachmentScope(scopeKey).length > 0) return false;
      const restored = createSessionOwnedAttachmentItems(attachmentRefs);
      // queue 中的 AttachmentRef 已在首次发送时由 session 接管；若按普通
      // composer 文件重建会在撤回后重复上传，并在 runtime restart 时误清引用。
      commitScope(scopeKey, () => restored);
      setAttachmentError(null);
      return true;
    },
    [commitScope, scopeKey],
  );

  const prepareForSend = useCallback(async (): Promise<AttachmentRef[] | null> => {
    const current = readComposerAttachmentScope(scopeKey);
    if (current.some((item) => item.uploadStatus !== "ready" || !item.attachmentRef)) {
      return null;
    }
    return current.flatMap((item) => (item.attachmentRef ? [item.attachmentRef] : []));
  }, [scopeKey]);

  return useMemo(
    () => ({
      scopeKey,
      attachments,
      attachmentError,
      composerDragKind,
      hasAttachments: attachments.length > 0,
      hasUnreadyAttachments: attachments.some((item) => item.uploadStatus !== "ready"),
      isDraggingOverComposer,
      attachmentInputRef,
      openAttachmentPicker,
      handleAttachmentInputChange,
      handlePaste,
      handleDragOverComposer,
      handleDragLeaveComposer,
      handleDropComposer,
      addAttachmentFiles,
      removeAttachment,
      retryAttachment,
      clearAttachments,
      restoreDraftAttachments,
      restoreSessionOwnedAttachments,
      prepareForSend,
      setAttachmentError,
    }),
    [
      addAttachmentFiles,
      attachmentError,
      scopeKey,
      attachments,
      composerDragKind,
      clearAttachments,
      restoreDraftAttachments,
      restoreSessionOwnedAttachments,
      handleAttachmentInputChange,
      handleDragLeaveComposer,
      handleDragOverComposer,
      handleDropComposer,
      handlePaste,
      isDraggingOverComposer,
      openAttachmentPicker,
      prepareForSend,
      removeAttachment,
      retryAttachment,
    ],
  );
}

export interface ContextImageAttachmentsPort {
  addAttachmentFiles(files: File[]): string[];
  removeAttachment(id: string): void;
}

export interface ContextImageAttachmentsOptions<T> {
  toFiles: (context: T) => File[];
}

interface MaterializedContext<T> {
  context: T;
  ids: string[];
  /** 附加时的撤销函数；切会话后仍清理原 scope 的截图。 */
  remove: (id: string) => void;
}

export function useContextImageAttachments<T extends { id: string }>(
  contexts: readonly T[],
  port: ContextImageAttachmentsPort,
  options: ContextImageAttachmentsOptions<T>,
): ReadonlySet<string> {
  const materialized = useRef(new Map<string, MaterializedContext<T>>());
  /** 这里管着的附件 id：调用方可以据此只在条目上展示（如网页元素引用不在附件行重复出缩略图） */
  const [managedIds, setManagedIds] = useState<ReadonlySet<string>>(() => new Set());
  const portRef = useRef(port);
  portRef.current = port;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(() => {
    const { toFiles } = optionsRef.current;
    const release = (entry: MaterializedContext<T>) => {
      const remove = entry.remove;
      for (const id of entry.ids) {
        remove(id);
      }
    };
    const seen = new Set<string>();
    for (const context of contexts) {
      seen.add(context.id);
      const existing = materialized.current.get(context.id);
      if (existing?.context === context) continue;
      if (existing) {
        release(existing);
        materialized.current.delete(context.id);
      }
      const files = toFiles(context);
      if (files.length === 0) continue;
      materialized.current.set(context.id, {
        context,
        ids: portRef.current.addAttachmentFiles(files),
        remove: portRef.current.removeAttachment,
      });
    }
    for (const [id, entry] of materialized.current) {
      if (seen.has(id)) continue;
      release(entry);
      materialized.current.delete(id);
    }
    const ids = new Set([...materialized.current.values()].flatMap((entry) => entry.ids));
    setManagedIds((current) =>
      current.size === ids.size && [...ids].every((id) => current.has(id)) ? current : ids,
    );
  }, [contexts]);
  useEffect(() => {
    const entries = materialized.current;
    return () => {
      for (const entry of entries.values()) {
        for (const id of entry.ids) entry.remove(id);
      }
      entries.clear();
    };
  }, []);
  return managedIds;
}
