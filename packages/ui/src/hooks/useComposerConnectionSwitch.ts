import { completeNewModelSelection } from "@zcode/provider";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { chooseConnectionModel } from "@/lib/composerPlanGroups.js";
import { buildRegistryModelSelectGroups } from "@/lib/modelSelectionGroups.js";
import { decodeCustomModelValue } from "@/lib/zcodeCustomModelValue.js";
import { logger } from "@/logger.js";
import type { ZCodeProvider } from "@zcode/shared";

export function useComposerConnectionSwitch({
  workspacePath,
  workspaceIdentity,
  agentProvider,
  normalizedValue,
  onSelectModel,
  onPendingChange,
  scopeId,
  presentationStatus = "ready",
  presentationRevision,
  presentationErrorRevision,
  refreshPresentation,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  agentProvider: ZCodeProvider;
  normalizedValue: string;
  onSelectModel: (value: string, reasoningLevel?: string) => void | Promise<void>;
  onPendingChange?: (pending: boolean) => void;
  scopeId?: string;
  presentationStatus?: "ready" | "loading" | "error" | "unavailable";
  presentationRevision?: number;
  presentationErrorRevision?: number;
  refreshPresentation?: () => Promise<unknown>;
}) {
  const { services: target, rpcReady } = useWorkspaceServicesResolution(
    workspacePath,
    undefined,
    workspaceIdentity,
  );
  const { intl } = useZCodeIntl();
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const token = useMemo(
    () => ({ target, workspaceKey, scopeId, mounted: true }),
    [target, workspaceKey, scopeId],
  );
  const owner = useRef(token);
  owner.current = token;
  const inFlight = useRef(false);
  const [state, setState] = useState<{
    pending: boolean;
    error: string | null;
    previousKey?: string;
    expectedValue?: string;
    expectedRevision?: number;
  }>({
    pending: false,
    error: null,
  });
  // 根因：连接刷新先于选模完成，旧实现只锁菜单，发送仍可冻结旧 provider。
  // 同步通知提交门禁；完成仍以此 owner 的展示回执为准，不另设计时器。
  useLayoutEffect(() => {
    onPendingChange?.(state.pending);
  }, [state.pending, onPendingChange]);
  useLayoutEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  useEffect(() => {
    token.mounted = true;
    setState({ pending: false, error: null });
    inFlight.current = false;
    return () => {
      token.mounted = false;
    };
  }, [token]);
  useEffect(() => {
    if (!state.expectedValue) return;
    if (
      presentationStatus === "error" ||
      presentationStatus === "unavailable" ||
      // 原因：旧 ready 可保留目录，但目标刷新失败必须是本次切换的终态。
      (presentationErrorRevision !== undefined &&
        state.expectedRevision !== undefined &&
        presentationErrorRevision >= state.expectedRevision)
    ) {
      inFlight.current = false;
      setState({
        pending: false,
        error: intl.formatMessage({ id: "chat.toolbar.connection.switchFailed" }),
      });
    } else if (presentationStatus === "ready") {
      // 原因：选择 owner 在重读时保留旧 ready；只有目标目录版本到达才是本次展示回执。
      if (
        presentationRevision !== undefined &&
        state.expectedRevision !== undefined &&
        presentationRevision < state.expectedRevision
      )
        return;
      // 原因：RPC 完成早于 Renderer 的选择重解析；提前结束 loading 会暴露新旧目录混合帧。
      inFlight.current = false;
      // 原因：有效选择可能被过滤或被另一草稿改写；ready 不匹配也必须结束等待，不能永久锁住工具条。
      const matched = normalizedValue === state.expectedValue;
      if (!matched)
        logger.lifecycle.warn("[composer-connection] 展示选择与目标不匹配", {
          expectedValue: state.expectedValue,
          normalizedValue,
        });
      setState({
        pending: false,
        error: matched ? null : intl.formatMessage({ id: "chat.toolbar.connection.switchFailed" }),
      });
    }
  }, [
    state.expectedValue,
    state.expectedRevision,
    presentationStatus,
    presentationRevision,
    presentationErrorRevision,
    normalizedValue,
    intl,
  ]);
  const select = useCallback(
    async (providerId: string, previousKey?: string) => {
      if (inFlight.current || !rpcReady || owner.current !== token || !token.mounted) return;
      const stillCurrent = () => token.mounted && owner.current === token;
      inFlight.current = true;
      onPendingChange?.(true);
      setState({ pending: true, error: null, previousKey });
      let awaitingPresentation = false;
      try {
        const view = await token.target.modelSelectionService.getView();
        if (!stillCurrent()) return;
        const group = buildRegistryModelSelectGroups(agentProvider, view).find(
          (g) => g.key === `registry-provider:${providerId}`,
        );
        const model = chooseConnectionModel(
          group?.items ?? [],
          decodeCustomModelValue(normalizedValue)?.modelName,
        );
        if (!model) throw new Error("Selected connection has no available models");
        logger.debug("[composer-connection] 连接同步完成", {
          providerId,
          workspaceKey: token.workspaceKey,
        });
        const selection = completeNewModelSelection(view, {
          providerId,
          modelId: model.name,
        });
        await onSelectModel(model.value, selection?.options?.reasoningLevel);
        if (!stillCurrent()) return;
        // 重选同连接可能没有目录事件；每次显式读取当前展示 owner，不消费旧失败回执。
        await refreshPresentation?.();
        if (!stillCurrent()) return;
        awaitingPresentation = true;
        setState({
          pending: true,
          error: null,
          previousKey,
          expectedValue: model.value,
          expectedRevision: view.revision,
        });
      } catch (error) {
        // 连接切换失败属于低频生命周期诊断，生产回放也需要保留明确失败原因。
        logger.lifecycle.warn("[composer-connection] 切换连接失败", {
          providerId,
          workspaceKey: token.workspaceKey,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
        if (stillCurrent())
          setState({
            pending: false,
            error: intl.formatMessage({ id: "chat.toolbar.connection.switchFailed" }),
          });
      } finally {
        if (stillCurrent() && !awaitingPresentation) {
          inFlight.current = false;
          setState((previous) => ({ ...previous, pending: false }));
        }
      }
    },
    [
      agentProvider,
      intl,
      normalizedValue,
      onSelectModel,
      onPendingChange,
      rpcReady,
      token,
      refreshPresentation,
    ],
  );
  return { ...state, select };
}
