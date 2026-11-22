import { isHighspeedProviderId } from "@zcode/shared";
import { modelSelectionSchema, type ModelSelection } from "@zcode/shared/model-selection";
import { submissionModeSchema, type SubmissionMode } from "@zcode/shared/zcode-protocol-v4";
import type { WebModelSelectionView } from "@zcode/services";
import { logger } from "@/logger.js";
import { composerScopeKey, type ComposerScope } from "@/v4/composer/composerDraftStore.js";

// 沿用旧 key，读取时兼容只保存 ModelSelection 的历史记录。
const COMPOSER_RECENT_KEY_PREFIX = "zcode-model-selection-recent-v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ComposerRecent {
  readonly modelSelection?: ModelSelection;
  readonly mode?: SubmissionMode;
}

interface RecentScopeReceipt {
  scope: ComposerScope;
  order: number;
}

export interface FullAccessRecentReceipt extends RecentScopeReceipt {
  mode: "yolo" | "guarded";
}

export interface ComposerRecentReceipt extends RecentScopeReceipt {
  selection: { modelSelection: ModelSelection; mode: SubmissionMode };
}
let lastReceiptOrder = 0;
export function captureRecentOrder(): number {
  lastReceiptOrder = Math.max(Date.now() * 1000, lastReceiptOrder + 1);
  return lastReceiptOrder;
}

export function prepareComposerRecentReceipt(
  scope: ComposerScope,
  selection: ComposerRecentReceipt["selection"],
): ComposerRecentReceipt {
  return {
    scope: { ...scope },
    selection: JSON.parse(JSON.stringify(selection)),
    order: captureRecentOrder(),
  };
}
export function acceptComposerRecentReceipt(
  receipt: ComposerRecentReceipt | FullAccessRecentReceipt,
  storage: StorageLike | null = browserStorage(),
): boolean {
  if (!storage) return false;
  const submission = "selection" in receipt ? receipt.selection : undefined;
  const selection = modelSelectionSchema.safeParse(submission?.modelSelection);
  const mode = submissionModeSchema.safeParse("mode" in receipt ? receipt.mode : submission?.mode);
  if (
    !mode.success ||
    (submission && (!selection.success || isHighspeedProviderId(selection.data.providerId)))
  )
    return true;
  const key = resolveComposerRecentKey("", undefined, receipt.scope);
  try {
    let previous: { order?: number; modeOrder?: number } | null = null;
    try {
      previous = JSON.parse(storage.getItem(key) ?? "null");
    } catch {
      /* 损坏偏好可被真实接纳替换。 */
    }
    // 回执/查询/快照可能重复到达；持久化顺序让刷新后的旧回执也不能回滚默认配置。
    if (typeof previous?.order === "number" && previous.order >= receipt.order) return true;
    // 授权只推进权限顺序。较早提交的回执仍可补齐模型，但不能撤销较新的授权。
    const updateMode = receipt.order > (previous?.modeOrder ?? previous?.order ?? -1);
    if (!submission && !updateMode) return true;
    storage.setItem(
      key,
      JSON.stringify({
        ...previous,
        ...(submission && selection.success
          ? { modelSelection: selection.data, order: receipt.order }
          : {}),
        ...(updateMode ? { mode: mode.data, modeOrder: receipt.order } : {}),
      }),
    );
    return true;
  } catch (error) {
    logger.warn("[ComposerRecent] 接纳配置交接失败，保留命令恢复线索", error);
    return false;
  }
}

function resolveComposerRecentKey(
  workspacePath: string,
  workspaceIdentity?: string,
  scope?: ComposerScope,
): string {
  if (scope) return `zcode-composer-recent:v2:${composerScopeKey(scope)}`;
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  return `${COMPOSER_RECENT_KEY_PREFIX}:${workspaceKey}`;
}

export function readComposerRecent(
  workspacePath: string,
  workspaceIdentity?: string,
  storage: StorageLike | null = browserStorage(),
  scope?: ComposerScope,
): ComposerRecent | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(resolveComposerRecentKey(workspacePath, workspaceIdentity, scope));
    if (!raw) return null;
    const record: unknown = JSON.parse(raw);
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    // 两个叶子独立校验：模型过期或坏数据不能连带丢掉合法权限，反之亦然。
    const selection = modelSelectionSchema.safeParse(
      "modelSelection" in record ? record.modelSelection : record,
    );
    const mode = submissionModeSchema.safeParse("mode" in record ? record.mode : undefined);
    // 自愈（spec §5.1）：存量 Recent 可能被加速轮覆盖写入隐藏加速 Provider，模型视图里它
    // 解析为 provider-not-found，会让新任务草稿的模型选择器卡在空态。按叶子丢弃模型、保留
    // mode，新草稿回落默认选择；与 readSessionModelSelection 丢弃加速常驻 entry 同口径。
    const healedSelection =
      selection.success && !isHighspeedProviderId(selection.data.providerId)
        ? selection.data
        : undefined;
    if (!healedSelection && !mode.success) return null;
    return {
      ...(healedSelection ? { modelSelection: healedSelection } : {}),
      ...(mode.success ? { mode: mode.data } : {}),
    };
  } catch {
    return null;
  }
}

export function resolveDraftInitialModelSelection(
  view: WebModelSelectionView | null,
  recent: ModelSelection | null,
): { readonly selection: ModelSelection | null; readonly invalidated: boolean } {
  // Registry 尚未到达时不能把已有草稿意图误判为失效；先原样保留，等同一 Hook
  // 收到 View 后再做语义校验。
  if (!view) return { selection: recent, invalidated: false };
  if (recent) {
    const model = findModel(view, recent);
    if (!model) return { selection: null, invalidated: true };
    const reasoning = recent.options?.reasoningLevel;
    if (
      reasoning === undefined ||
      !model.config.optionSpecs.reasoningLevel.values.includes(reasoning)
    ) {
      // 仍保留 Provider/Model 身份，但清空失效档位；Composer 不弹泛化通知，
      // 让空的 Reasoning 控件直接要求用户作出新的明确选择。
      return {
        selection: { providerId: recent.providerId, modelId: recent.modelId },
        invalidated: true,
      };
    }
    return { selection: recent, invalidated: false };
  }
  return {
    selection:
      view.preferredSelection && isSelectionInView(view, view.preferredSelection)
        ? view.preferredSelection
        : null,
    invalidated: recent !== null,
  };
}

export function isSelectionInView(view: WebModelSelectionView, selection: ModelSelection): boolean {
  const model = findModel(view, selection);
  if (!model) return false;
  const reasoning = selection.options?.reasoningLevel;
  const reasoningSpec = model.config.optionSpecs.reasoningLevel;
  return reasoning !== undefined && reasoningSpec.values.includes(reasoning);
}

function findModel(view: WebModelSelectionView, selection: ModelSelection) {
  return view.providers
    .find((provider) => provider.providerId === selection.providerId)
    ?.models.find((candidate) => candidate.modelId === selection.modelId);
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
