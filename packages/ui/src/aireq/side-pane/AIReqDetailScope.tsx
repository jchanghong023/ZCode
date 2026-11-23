import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useAIReqDataSource } from "../data-source.js";
import type {
  AIReqDocumentValidation,
  AIReqMaterialReadRequest,
  AIReqWorkflowTarget,
  AIReqWorkflowView,
} from "../contract.js";

interface DocumentDetail {
  view: AIReqWorkflowView;
  validateVersion(): Promise<AIReqDocumentValidation>;
  confirmVersion(snapshot: string): Promise<AIReqDocumentValidation | undefined>;
  retryMaterial(request: AIReqMaterialReadRequest): Promise<boolean>;
}

interface ReadProjection {
  view?: AIReqWorkflowView;
  error?: string;
}

interface AIReqDetailScopeProps {
  target: AIReqWorkflowTarget;
  releaseId: string;
  active: boolean;
  children(detail: DocumentDetail): ReactNode;
}

/** 侧栏只读取标签对应的需求。确认始终把意图发送给同一个工作流 owner。 */
export function AIReqDetailScope({
  target: { projectId, irId },
  releaseId,
  active,
  children,
}: AIReqDetailScopeProps) {
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [read, setRead] = useState<ReadProjection>({});
  const currentRead = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++currentRead.current;
    try {
      const view = await source.readWorkflow({ projectId, irId });
      if (request !== currentRead.current) return;
      const group = view.requirements.find(
        (item) => item.projectId === projectId && item.id === irId && item.releaseId === releaseId,
      );
      setRead(
        group
          ? { view }
          : { error: zh ? "这条需求已不可用。" : "This requirement is no longer available." },
      );
    } catch (cause) {
      if (request !== currentRead.current) return;
      const error = formatUserFacingError(
        cause,
        zh ? "文档读取失败，请重试。" : "Could not load documents. Try again.",
      );
      setRead((previous) => ({ ...previous, error }));
    }
  }, [irId, projectId, releaseId, source, zh]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const unsubscribe = source.subscribeWorkflow(() => void refresh());
    return () => {
      currentRead.current += 1;
      unsubscribe();
    };
  }, [active, refresh, source]);

  const { view } = read;
  const validateVersion = () => {
    if (!projectId || !irId) throw new Error(zh ? "请选择当前需求。" : "Select a requirement.");
    return source.validateDocumentVersion({ projectId, irId });
  };
  const confirmVersion = async (snapshot: string) => {
    if (!projectId || !irId || !view)
      throw new Error(zh ? "请重新读取当前需求。" : "Reload the requirement.");
    const target = { projectId, irId };
    const result = await source.command(
      { type: "confirmDocumentVersion", ...target, snapshot },
      target,
      view.revision,
    );
    if (result.receipt.status === "failed") {
      if (result.documentValidation) return result.documentValidation;
      throw new Error(result.receipt.error);
    }
    await refresh();
  };

  const retryMaterial = async (request: AIReqMaterialReadRequest) => {
    if (request.projectId !== projectId || request.irId !== irId || request.releaseId !== releaseId)
      return false;
    try {
      return await source.retryMaterial(request);
    } catch {
      return false;
    } finally {
      await refresh();
    }
  };

  const { error } = read;
  return (
    <>
      {error && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-ui-sm text-destructive"
        >
          <span className="min-w-0 flex-1 wrap-anywhere">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            {zh ? "重新读取" : "Reload"}
          </Button>
        </div>
      )}
      {view ? (
        children({ view, validateVersion, confirmVersion, retryMaterial })
      ) : !error ? (
        <p role="status" className="p-6 text-ui-sm text-foreground-subtle">
          {zh ? "正在读取文档…" : "Loading documents…"}
        </p>
      ) : null}
    </>
  );
}
