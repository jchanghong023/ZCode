import { requirementObjectLink } from "../navigationState.js";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { AIReqContextProjection, useAIReq, type AIReqContextValue } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIReqWorkspaceActiveContext } from "../shell/ModelSettingsNavigationContext.js";
import type {
  AIReqAction,
  AIReqMaterialReadRequest,
  AIReqSelection,
  AIReqWorkflowView,
} from "../contract.js";
import type { AIReqSidePaneGuard } from "./contract.js";

type ReadProjection = {
  key: string;
  pending: boolean;
  view?: AIReqWorkflowView;
  error?: string;
};
type ScopedError = { key: string; message: string };
interface AIReqDetailScopeProps {
  target: AIReqSelection;
  releaseId: string;
  tabId: string;
  active?: boolean;
  onSelect(selection: AIReqSelection, releaseId?: string): void;
  onGuardChange?(guard: AIReqSidePaneGuard): void;
  children: ReactNode;
}

function targetKey(target: AIReqSelection, releaseId: string): string {
  return JSON.stringify([target, releaseId]);
}

function targetAvailable(
  view: AIReqWorkflowView,
  target: AIReqSelection,
  releaseId: string,
): boolean {
  const group = [...view.groups, ...view.drafts].find(
    (item) =>
      item.projectId === target.projectId &&
      item.id === target.irId &&
      item.releaseId === releaseId,
  );
  return Boolean(
    group &&
    (!target.srId ||
      view.srs.some(
        (sr) => sr.projectId === group.projectId && sr.irId === group.id && sr.id === target.srId,
      )),
  );
}

/** Tab 仅保存可失效的查询投影；命令始终发给既有服务 owner 的显式对象与版本。 */
export function AIReqDetailScope({
  target,
  releaseId,
  tabId,
  active = true,
  onSelect,
  onGuardChange,
  children,
}: AIReqDetailScopeProps) {
  const main = useAIReq()!;
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const key = targetKey(target, releaseId);
  const current = useRef({ target, releaseId, key, onSelect, onGuardChange, main, source, active });
  current.current = { target, releaseId, key, onSelect, onGuardChange, main, source, active };
  const [read, setRead] = useState<ReadProjection>({ key: "", pending: true });
  const [operationError, setOperationError] = useState<ScopedError>();
  const [busyKey, setBusyKey] = useState<string>();
  const generation = useRef(0);
  const alive = useRef(false);
  const view = read.key === key ? read.view : undefined;
  const viewRef = useRef(view);
  viewRef.current = view;
  const draftGuard = useRef<AIReqSidePaneGuard>(null);
  const navigationGuard = useRef<AIReqSidePaneGuard>(null);
  const combinedGuard = useRef<AIReqSidePaneGuard>(null);
  const owner = `side-pane:${tabId}`;
  const setMainDraftGuard = main.setDraftNavigationGuard;
  const publishGuard = useCallback(() => {
    const guards = [navigationGuard.current, draftGuard.current].filter(
      (guard): guard is NonNullable<AIReqSidePaneGuard> => Boolean(guard),
    );
    const combined: AIReqSidePaneGuard = guards.length
      ? (action) => {
          const run = (index: number) => {
            if (index === guards.length) action();
            else guards[index]!(() => run(index + 1));
          };
          run(0);
        }
      : null;
    combinedGuard.current = combined;
    setMainDraftGuard(combined, owner);
    current.current.onGuardChange?.(combined);
  }, [owner, setMainDraftGuard]);
  const setDraftNavigationGuard = useCallback(
    (guard: AIReqSidePaneGuard) => {
      draftGuard.current = guard;
      publishGuard();
    },
    [publishGuard],
  );
  const setNavigationGuard = useCallback(
    (guard: AIReqSidePaneGuard) => {
      navigationGuard.current = guard;
      publishGuard();
    },
    [publishGuard],
  );
  const navigate = useCallback((action: () => void) => {
    // 右侧局部切换只检查自己的表单，不改主区目标或干扰主区草稿。
    if (combinedGuard.current) combinedGuard.current(action);
    else action();
  }, []);
  useEffect(() => {
    onGuardChange?.(combinedGuard.current);
    return () => onGuardChange?.(null);
  }, [onGuardChange]);
  useEffect(
    () => () => {
      setMainDraftGuard(null, owner);
    },
    [owner, setMainDraftGuard],
  );

  const report = useCallback((cause: unknown) => {
    setOperationError({
      key: current.current.key,
      message: formatUserFacingError(cause, "操作暂时未能完成，请重试。"),
    });
  }, []);
  const refresh = useCallback(
    async (throwOnError = false) => {
      const request = current.current;
      const revision = ++generation.current;
      setRead((previous) => ({
        key: request.key,
        pending: true,
        view: previous.key === request.key ? previous.view : undefined,
      }));
      try {
        const next = await source.readWorkflow({ ...request.target });
        if (
          !alive.current ||
          revision !== generation.current ||
          current.current.key !== request.key
        )
          return;
        if (!targetAvailable(next, request.target, request.releaseId)) {
          // owner 已确认目标缺失时清除旧投影；网络失败才允许保留同目标上次内容。
          viewRef.current = undefined;
          setRead({
            key: request.key,
            pending: false,
            error: "所选需求或版本已不可用，请关闭此标签或重新选择。",
          });
          return;
        }
        viewRef.current = next;
        setRead({ key: request.key, pending: false, view: next });
      } catch (cause) {
        if (
          !alive.current ||
          revision !== generation.current ||
          current.current.key !== request.key
        )
          return;
        const message = formatUserFacingError(cause, "详情读取失败，请重试。");
        setRead((previous) => ({
          key: request.key,
          pending: false,
          view: previous.key === request.key ? previous.view : undefined,
          error: message,
        }));
        if (throwOnError) throw cause;
      }
    },
    [source],
  );
  useEffect(() => {
    alive.current = true;
    void refresh();
    const unsubscribe = source.subscribeWorkflow(() => void refresh());
    return () => {
      alive.current = false;
      generation.current += 1;
      unsubscribe();
    };
  }, [key, source, refresh]);

  const select = useCallback(
    (selection: AIReqSelection, selectedRelease?: string) => {
      navigate(() =>
        current.current.onSelect(selection, selectedRelease ?? current.current.releaseId),
      );
    },
    [navigate],
  );
  const command = useCallback(
    async (action: AIReqAction) => {
      const request = current.current;
      const snapshot = viewRef.current;
      if (!snapshot) {
        report(new Error("详情尚未读取，请重试后操作。"));
        return undefined;
      }
      setBusyKey(request.key);
      setOperationError(undefined);
      try {
        const result = await source.command(action, { ...request.target }, snapshot.revision);
        if (result.receipt.status === "failed")
          throw new Error(result.receipt.error ?? "操作失败。");
        if (!alive.current || current.current.key !== request.key) return result;
        await refresh();
        return result;
      } catch (cause) {
        if (alive.current && current.current.key === request.key) report(cause);
        return undefined;
      } finally {
        if (alive.current) setBusyKey((value) => (value === request.key ? undefined : value));
      }
    },
    [source, refresh, report],
  );
  const retryMaterial = useCallback(
    async (material: AIReqMaterialReadRequest) => {
      const request = current.current;
      if (
        request.target.projectId !== material.projectId ||
        request.target.irId !== material.irId ||
        request.releaseId !== material.releaseId
      )
        return false;
      try {
        return await source.retryMaterial(material);
      } catch {
        return false;
      } finally {
        if (alive.current && current.current.key === request.key) await refresh();
      }
    },
    [source, refresh],
  );
  const retrySession = useCallback(
    async (selection: AIReqSelection, sessionId: string, isCurrentPane: () => boolean) => {
      const request = current.current;
      const isCurrent = () =>
        isCurrentPane() &&
        alive.current &&
        current.current.active &&
        current.current.source === source &&
        current.current.key === request.key &&
        viewRef.current !== undefined &&
        source.resolveSession(viewRef.current, selection)?.sessionId === sessionId;
      if (JSON.stringify(selection) !== JSON.stringify(request.target) || !isCurrent())
        throw new Error("会话已切换，请在当前标签中重试。");
      try {
        await source.retrySession({ ...request.target }, sessionId);
        if (!isCurrent()) throw new Error("会话已切换，请在当前标签中重试。");
        await refresh(true);
        if (!isCurrent()) throw new Error("会话已切换，请在当前标签中重试。");
      } catch (cause) {
        if (isCurrent()) report(cause);
        throw cause;
      }
    },
    [source, refresh, report],
  );
  const objectLink = useCallback(() => {
    const request = current.current;
    if (!viewRef.current || !targetAvailable(viewRef.current, request.target, request.releaseId))
      return undefined;
    return requirementObjectLink(window.location.href, request.target, request.releaseId);
  }, []);
  const value: AIReqContextValue = {
    ...main,
    selection: target,
    releaseId,
    view,
    session: view && source.resolveSession(view, target),
    pending: read.key !== key || read.pending || busyKey === key,
    selectionReady: Boolean(view),
    error:
      operationError?.key === key
        ? operationError.message
        : read.key === key
          ? read.error
          : undefined,
    linkError: undefined,
    clearLinkError: () => setOperationError(undefined),
    refresh,
    retryMaterial,
    retrySession,
    command,
    select,
    objectLink,
    navigate,
    report,
    setDraftNavigationGuard,
    setNavigationGuard,
  };
  return (
    <AIReqWorkspaceActiveContext.Provider value={active && !main.settingsOpen}>
      <AIReqContextProjection value={value}>
        {!view ? (
          <div
            role={value.error ? "alert" : "status"}
            className="space-y-3 p-6 text-ui-sm text-remote-foreground-muted"
          >
            <p>
              {value.pending
                ? zh
                  ? "正在读取详情…"
                  : "Loading details…"
                : (value.error ?? (zh ? "详情暂不可用。" : "Details are unavailable."))}
            </p>
            <Button
              variant="outline"
              className="focus-visible:border-remote-foreground-muted"
              onClick={() => void refresh()}
            >
              {zh ? "重新读取" : "Reload"}
            </Button>
          </div>
        ) : (
          <>
            {value.error && (
              <div
                role="alert"
                className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-ui-sm text-destructive"
              >
                <span className="min-w-0 flex-1 break-words">{value.error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="focus-visible:border-remote-foreground-muted"
                  onClick={() => {
                    setOperationError(undefined);
                    void refresh();
                  }}
                >
                  {zh ? "重试" : "Retry"}
                </Button>
              </div>
            )}
            {children}
          </>
        )}
      </AIReqContextProjection>
    </AIReqWorkspaceActiveContext.Provider>
  );
}
