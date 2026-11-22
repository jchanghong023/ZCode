import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getWebElementContextWorkspaceKey,
  type WebElementContextComposerAttachment,
} from "@/lib/webElementContext.js";
import { isComposerEditScopeId } from "@/composer-edit-mode/contract.js";

export interface UseWebElementContextsOptions {
  workspacePath: string;
  workspaceIdentity?: string;
  scopeId?: string | null;
}

export interface UseWebElementContextsResult {
  contexts: readonly WebElementContextComposerAttachment[];
  hasContexts: boolean;
  removeContext: (id: string) => void;
  clearContexts: () => void;
  removeSentContexts: (ids: string[]) => void;
}

// 按 composer 草稿 scope 缓存未发送的网页元素上下文；切任务或进入/退出编辑态后切回原样恢复。
const scopedWebElementContexts = new Map<string, readonly WebElementContextComposerAttachment[]>();

function webElementScopeKey(workspaceKey: string, scopeId: string | null) {
  return `${workspaceKey}\0${scopeId ?? ""}`;
}

/** 进入编辑态前为 edit scope 预置待编辑消息的网页元素上下文。 */
export function seedWebElementContextsForScope(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  scopeId: string,
  contexts: readonly WebElementContextComposerAttachment[],
) {
  const key = webElementScopeKey(
    getWebElementContextWorkspaceKey(workspacePath, workspaceIdentity),
    scopeId,
  );
  if (contexts.length > 0) scopedWebElementContexts.set(key, [...contexts]);
  else scopedWebElementContexts.delete(key);
}

export function useWebElementContexts({
  workspacePath,
  workspaceIdentity,
  scopeId = null,
}: UseWebElementContextsOptions): UseWebElementContextsResult {
  const [contexts, setContexts] = useState<readonly WebElementContextComposerAttachment[]>([]);
  const workspaceKey = getWebElementContextWorkspaceKey(workspacePath, workspaceIdentity);
  const scopeKey = webElementScopeKey(workspaceKey, scopeId);
  const contextsRef = useRef(contexts);
  contextsRef.current = contexts;
  const scopeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const previousKey = scopeKeyRef.current;
    if (previousKey === scopeKey) return;
    if (previousKey !== null) {
      // composer 编辑态的 edit scope 用完即弃，不缓存。
      if (contextsRef.current.length > 0 && !isComposerEditScopeId(previousKey))
        scopedWebElementContexts.set(previousKey, contextsRef.current);
      else scopedWebElementContexts.delete(previousKey);
    }
    scopeKeyRef.current = scopeKey;
    const restored = scopedWebElementContexts.get(scopeKey) ?? [];
    scopedWebElementContexts.delete(scopeKey);
    setContexts(restored);
  }, [scopeKey]);
  useEffect(
    () => () => {
      // composer 卸载（关闭分屏等）时保留当前 scope 的未发送上下文。
      const key = scopeKeyRef.current;
      if (key !== null && contextsRef.current.length > 0 && !isComposerEditScopeId(key))
        scopedWebElementContexts.set(key, contextsRef.current);
    },
    [],
  );

  const removeContext = useCallback((id: string) => {
    setContexts((items) => items.filter((item) => item.id !== id));
  }, []);

  const clearContexts = useCallback(() => {
    setContexts([]);
  }, []);

  const removeSentContexts = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const sentIds = new Set(ids);
    setContexts((items) => items.filter((item) => !sentIds.has(item.id)));
  }, []);

  return useMemo(
    () => ({
      contexts,
      hasContexts: contexts.length > 0,
      removeContext,
      clearContexts,
      removeSentContexts,
    }),
    [
      clearContexts,
      contexts,
      removeContext,
      removeSentContexts,
    ],
  );
}
