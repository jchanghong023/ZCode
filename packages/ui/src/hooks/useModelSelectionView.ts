import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  IServiceAccessor,
  ModelSelectionViewInput,
  WebModelSelectionView,
} from "@zcode/services";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import { logger } from "@/logger.js";

type ModelSelectionReader = IServiceAccessor["modelSelectionService"];
type ModelSelectionCatalog = Pick<WebModelSelectionView, "revision" | "providers">;

export type ModelSelectionState =
  | { status: "loading"; catalog?: ModelSelectionCatalog }
  | {
      status: "ready";
      view: WebModelSelectionView;
      refreshError?: { revision: number; error: Error };
    }
  | { status: "unavailable"; reason: "remote-waiting" | "missing-target" }
  | { status: "error"; error: Error };

export type ModelSelectionRefreshResult =
  | { kind: "ready"; view: WebModelSelectionView }
  | { kind: "superseded" };

export interface ModelSelectionRead {
  state: ModelSelectionState;
  reload(): void;
  refresh(): Promise<ModelSelectionRefreshResult>;
}

interface OwnedModelSelectionState {
  service: ModelSelectionReader | null;
  enabled: boolean;
  unavailableReason: "remote-waiting" | "missing-target";
  inputKey: string | undefined;
  state: ModelSelectionState;
}

// 首读的临时 IO 失败只重读两次，不轮询业务状态或重试写操作。
const INITIAL_READ_RETRY_DELAYS = [500, 1500] as const;
function isTransientReadError(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as { code?: unknown; name?: unknown; message?: unknown };
  return (
    ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN"].includes(String(error.code)) ||
    (error.name === "TypeError" &&
      ["Failed to fetch", "fetch failed", "Load failed"].includes(String(error.message)))
  );
}

function initialState(
  service: ModelSelectionReader | null,
  enabled: boolean,
  unavailableReason: "remote-waiting" | "missing-target",
  catalog?: ModelSelectionCatalog,
): ModelSelectionState {
  return enabled && service
    ? { status: "loading", ...(catalog ? { catalog } : {}) }
    : { status: "unavailable", reason: unavailableReason };
}

function retainedCatalog(
  previous: OwnedModelSelectionState,
  service: ModelSelectionReader | null,
  enabled: boolean,
  unavailableReason: "remote-waiting" | "missing-target",
): ModelSelectionCatalog | undefined {
  if (
    previous.service !== service ||
    previous.enabled !== enabled ||
    previous.unavailableReason !== unavailableReason
  )
    return undefined;
  // 调档/换模型只改变解析输入；清空同 Host 目录会让菜单收缩闪烁。
  // 仅保留目录，绝不把旧 effectiveSelection 当作新选择的解析结果。
  if (previous.state.status === "ready") {
    const { revision, providers } = previous.state.view;
    return { revision, providers };
  }
  return previous.state.status === "loading" ? previous.state.catalog : undefined;
}

/** 读取明确 Host 的模型目录；返回状态在同一次 render 即绑定新 owner，不暴露旧 Host View。 */
export function useModelSelectionServiceView(
  service: ModelSelectionReader | null | undefined,
  enabled = true,
  unavailableReason: "remote-waiting" | "missing-target" = "remote-waiting",
  input?: ModelSelectionViewInput,
): ModelSelectionRead {
  const normalizedService = service ?? null;
  // 调用方可每次 render 创建参数对象；所有权按选择内容绑定，不按对象引用反复读取。
  const inputKey = input === undefined ? undefined : JSON.stringify(input);
  const stableInput = useMemo<ModelSelectionViewInput | undefined>(
    () => (inputKey === undefined ? undefined : (JSON.parse(inputKey) as ModelSelectionViewInput)),
    [inputKey],
  );
  const [reloadVersion, reload] = useReducer((value: number) => value + 1, 0);
  const [owned, setOwned] = useState<OwnedModelSelectionState>(() => ({
    service: normalizedService,
    enabled,
    unavailableReason,
    inputKey,
    state: initialState(normalizedService, enabled, unavailableReason),
  }));
  const ownedRef = useRef(owned);
  ownedRef.current = owned;
  const generationRef = useRef(0);
  const readRef = useRef<(() => Promise<ModelSelectionRefreshResult>) | null>(null);
  const ownerMatches =
    owned.service === normalizedService &&
    owned.enabled === enabled &&
    owned.inputKey === inputKey &&
    owned.unavailableReason === unavailableReason;
  const visibleState = ownerMatches
    ? owned.state
    : initialState(
        normalizedService,
        enabled,
        unavailableReason,
        retainedCatalog(owned, normalizedService, enabled, unavailableReason),
      );

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const previous = ownedRef.current;
    const catalog = retainedCatalog(previous, normalizedService, enabled, unavailableReason);
    const retainedReady =
      previous.service === normalizedService &&
      previous.enabled === enabled &&
      previous.inputKey === inputKey &&
      previous.unavailableReason === unavailableReason &&
      previous.state.status === "ready"
        ? previous.state
        : null;
    setOwned({
      service: normalizedService,
      enabled,
      unavailableReason,
      inputKey,
      state: retainedReady ?? initialState(normalizedService, enabled, unavailableReason, catalog),
    });
    if (!enabled || !normalizedService) return;

    let latestRevision = retainedReady?.view.revision ?? catalog?.revision ?? -1;
    let hasReadyView = retainedReady !== null;
    let requestId = 0;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelRetry = () => {
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = undefined;
    };
    const commit = (candidate: WebModelSelectionView): void => {
      if (generation !== generationRef.current || candidate.revision < latestRevision) return;
      latestRevision = candidate.revision;
      hasReadyView = true;
      cancelRetry();
      setOwned({
        service: normalizedService,
        enabled,
        unavailableReason,
        inputKey,
        state: { status: "ready", view: candidate },
      });
    };
    const read = (): Promise<ModelSelectionRefreshResult> => {
      cancelRetry();
      const request = ++requestId;
      return normalizedService.getView(stableInput).then(
        (candidate) => {
          if (generation !== generationRef.current || request !== requestId)
            return { kind: "superseded" };
          commit(candidate);
          return { kind: "ready", view: candidate };
        },
        (cause: unknown) => {
          // 原因：旧读取虽不能写展示 state，其 rejection 仍会被等待它的 Composer 当成当前失败。
          // owner 明确返回已被取代回执；仅当前读取失败才发布失败并拒绝。
          if (generation !== generationRef.current || request !== requestId)
            return { kind: "superseded" };
          const error = cause instanceof Error ? cause : new Error(String(cause));
          logger.warn("[model-selection] 目标 Host View 读取失败", { error });
          // 保留旧 ready 不能吞掉重读失败，否则连接切换会永久等待。
          // 失败与当前 service/input 及最近已读 revision 绑定；成功重读清除回执。
          if (hasReadyView) {
            setOwned((previous) =>
              previous.state.status === "ready"
                ? {
                    ...previous,
                    state: { ...previous.state, refreshError: { revision: latestRevision, error } },
                  }
                : previous,
            );
          } else {
            setOwned({
              service: normalizedService,
              enabled,
              unavailableReason,
              inputKey,
              state: { status: "error", error },
            });
            const delay = INITIAL_READ_RETRY_DELAYS[retryCount];
            if (delay !== undefined && isTransientReadError(cause)) {
              retryCount += 1;
              retryTimer = setTimeout(() => {
                void read().catch(() => {});
              }, delay);
            }
          }
          throw error;
        },
      );
    };
    // 显式重读和自动首读共享请求序号，旧结果不能覆盖更新的读取。
    readRef.current = read;
    void read().catch(() => {});
    return () => {
      generationRef.current += 1;
      if (readRef.current === read) readRef.current = null;
      cancelRetry();
    };
  }, [enabled, normalizedService, reloadVersion, unavailableReason, inputKey, stableInput]);

  return {
    state: visibleState,
    reload: useCallback(() => reload(), []),
    refresh: useCallback(
      () =>
        readRef.current
          ? readRef.current()
          : Promise.reject(new Error("Model selection owner unavailable")),
      [],
    ),
  };
}

/** 模型候选只来自明确的工作区；旧远程目标不回退到基础服务。 */
export function useModelSelectionView(
  workspacePath: string | null | undefined,
  remoteSessionId?: string | null,
  workspaceIdentity?: string | null,
  remoteTarget?: unknown,
  input?: ModelSelectionViewInput,
): ModelSelectionRead {
  const hasTarget = Boolean(workspacePath?.trim() || workspaceIdentity?.trim());
  const resolution = useWorkspaceServicesResolution(
    workspacePath,
    remoteSessionId,
    workspaceIdentity,
    remoteTarget,
  );
  return useModelSelectionServiceView(
    resolution.services.modelSelectionService,
    hasTarget && resolution.rpcReady,
    hasTarget ? "remote-waiting" : "missing-target",
    input,
  );
}
