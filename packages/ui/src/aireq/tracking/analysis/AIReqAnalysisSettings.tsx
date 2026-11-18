import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAIReqDataSource } from "../../data-source.js";
import { useAIReq } from "../../AIReqContext.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { AIReqProgressScheduler, AIReqSettingsDraftActions } from "../../contract.js";
import { AnalysisSettings, analysisIntervalMinutes } from "./AnalysisSettings.js";
import { QueryFeedback, UpdateFeedback } from "./AnalysisPresentation.js";
import { useSchedulerQuery } from "./useSchedulerQuery.js";

interface AnalysisSettingsProps {
  onOpenModelSettings(): void;
  onDraftActionsChange?: (actions: AIReqSettingsDraftActions | null) => void;
  focusProjectId?: string;
}

export function AIReqAnalysisSettings(props: AnalysisSettingsProps) {
  const source = useAIReqDataSource();
  if (!source.progressScheduler)
    return (
      <p role="alert" className="text-ui-sm text-destructive">
        分析设置服务不可用，请检查连接后重试。
      </p>
    );
  return <ConnectedAnalysisSettings {...props} scheduler={source.progressScheduler} />;
}

function ConnectedAnalysisSettings({
  scheduler,
  onOpenModelSettings,
  onDraftActionsChange,
  focusProjectId,
}: AnalysisSettingsProps & { scheduler: AIReqProgressScheduler }) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const currentProjectId = useAIReq()?.selection.projectId;
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const read = useCallback(() => scheduler.read(), [scheduler]);
  const query = useSchedulerQuery(read, revision);
  const snapshot = query.value;
  const [interval, setInterval] = useState<string>();
  const [projectSearch, setProjectSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const mutation = useRef(false);
  const lifecycle = useRef<object | undefined>(undefined);
  const actions = useRef<AIReqSettingsDraftActions | null>(null);
  useEffect(() => {
    // 从项目运行页进入时清除旧的本地筛选，避免目标项目被上次查询隐藏。
    if (focusProjectId) setProjectSearch("");
  }, [focusProjectId]);
  useEffect(() => {
    const scope = {};
    lifecycle.current = scope;
    mutation.current = false;
    setPending(false);
    const unsubscribe = scheduler.subscribe(refresh);
    refresh();
    return () => {
      lifecycle.current = undefined;
      unsubscribe();
    };
  }, [scheduler, refresh]);
  const mutate = useCallback(
    async (action: () => void | Promise<void>, success: string) => {
      if (mutation.current) return false;
      const scope = lifecycle.current;
      mutation.current = true;
      setPending(true);
      setMessage("");
      setMessageError(false);
      try {
        await action();
        if (lifecycle.current !== scope) return false;
        setMessage(success);
        refresh();
        return true;
      } catch (cause) {
        if (lifecycle.current === scope) {
          setMessage(formatUserFacingError(cause, "分析设置保存失败，请稍后重试。"));
          setMessageError(true);
        }
        return false;
      } finally {
        if (lifecycle.current === scope) {
          mutation.current = false;
          setPending(false);
        }
      }
    },
    [refresh],
  );
  const savedInterval = snapshot ? String(snapshot.intervalMinutes) : "";
  const currentInterval = interval ?? savedInterval;
  const dirty = interval !== undefined && currentInterval !== savedInterval;
  const minutes = analysisIntervalMinutes(currentInterval, snapshot?.currentTime);
  // 保存后的 owner 投影到达才结清草稿；后续调度事件不能把未保存输入覆盖掉。
  useEffect(() => {
    if (interval !== undefined && interval === savedInterval) setInterval(undefined);
  }, [interval, savedInterval]);
  actions.current = {
    canSave: !pending && minutes !== undefined,
    canDiscard: !pending,
    saveBlockedReason: minutes === undefined ? "请输入可用的正整数分钟间隔。" : undefined,
    save: () =>
      snapshot && minutes !== undefined
        ? mutate(() => scheduler.configure(snapshot.enabled, minutes), "全局间隔已保存。")
        : false,
    discard: () => {
      setInterval(undefined);
      setMessage("");
      setMessageError(false);
    },
  };
  const canSave = !pending && minutes !== undefined;
  useEffect(() => {
    onDraftActionsChange?.(
      dirty || pending
        ? {
            canSave,
            canDiscard: !pending,
            save: () => actions.current?.save() ?? false,
            discard: () => actions.current?.discard(),
          }
        : null,
    );
  }, [dirty, pending, canSave, onDraftActionsChange]);
  useEffect(() => () => onDraftActionsChange?.(null), [onDraftActionsChange]);
  if (!snapshot)
    return <QueryFeedback loading={query.loading} error={query.error} onRetry={refresh} />;
  return (
    <div className="space-y-4">
      {(query.error || pending || message) && (
        <div className="sticky top-0 z-10 space-y-1 border-b border-border bg-background py-2">
          {query.error && (
            <UpdateFeedback error={query.error} pending={false} message="" onRetry={refresh} />
          )}
          {(pending || message) && (
            <p
              role={messageError ? "alert" : "status"}
              aria-live="polite"
              className={`text-ui-sm ${messageError ? "text-destructive" : "text-foreground-subtle"}`}
            >
              {pending ? (zh ? "正在提交…" : "Saving…") : message}
            </p>
          )}
        </div>
      )}
      <AnalysisSettings
        snapshot={snapshot}
        scheduler={scheduler}
        onOpenModelSettings={onOpenModelSettings}
        projectSearch={projectSearch}
        setProjectSearch={setProjectSearch}
        focusProjectId={focusProjectId}
        currentProjectId={currentProjectId}
        interval={currentInterval}
        setInterval={setInterval}
        pending={pending}
        mutate={mutate}
      />
    </div>
  );
}
