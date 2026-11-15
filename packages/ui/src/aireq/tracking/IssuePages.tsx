import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  type AIReqIssueScope,
  type AIReqIssueSnapshot,
  type AIReqIssueServices,
} from "../contract.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import type { IssuePage } from "./contract.js";
import { CreateIssue } from "./issues/CreateIssue.js";
import { IssueAnalysis } from "./issues/IssueAnalysis.js";
import { IssueProgress } from "./issues/IssueProgress.js";
import { IssuePageHeading, pageLabels } from "./issues/shared.js";

export function AIReqIssuePages({ page }: { page: IssuePage }) {
  const aireq = useAIReq()!;
  const source = useAIReqDataSource();
  const scope = { projectId: aireq.selection.projectId ?? "" };
  // 全局导航由 Shell 统一承载，页面不再叠加占位标题栏挤压原版内容区。
  return (
    <main
      aria-label={pageLabels[page]}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background text-ui-base"
    >
      {!scope.projectId ? (
        <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-4 md:px-6 md:py-6">
          <IssuePageHeading page={page} scope={scope} />
          <p role="status">请先选择项目。</p>
        </div>
      ) : !source.issues ? (
        <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-4 md:px-6 md:py-6">
          <IssuePageHeading page={page} scope={scope} />
          <p role="status">Issue 管理暂不可用，请稍后重试。</p>
        </div>
      ) : (
        <ConnectedIssuePages
          key={`${source.backend?.id ?? source.clientId}:${scope.projectId}`}
          page={page}
          scope={scope}
          service={source.issues}
        />
      )}
    </main>
  );
}

function ConnectedIssuePages({
  page,
  scope,
  service,
}: {
  page: IssuePage;
  scope: AIReqIssueScope;
  service: AIReqIssueServices;
}) {
  const [snapshot, setSnapshot] = useState<AIReqIssueSnapshot>();
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ page: IssuePage; text: string }>();
  const message = feedback?.page === page ? feedback.text : "";
  const setMessage = useCallback((text: string) => setFeedback({ page, text }), [page]);
  // 操作反馈归属发起页面，切页不展示上一页的创建或复制提示。
  useEffect(() => {
    setFeedback(undefined);
  }, [page]);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const active = useRef(true);
  const busy = useRef(false);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    active.current = true;
    const unsubscribe = service.subscribe(refresh);
    return () => {
      active.current = false;
      unsubscribe();
    };
  }, [service, refresh]);
  const { projectId } = scope;
  useEffect(() => {
    let current = true;
    void service.read({ projectId }).then(
      (value) => {
        if (current) {
          setSnapshot(value);
          setError("");
        }
      },
      (cause) => {
        if (current) setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      current = false;
    };
  }, [service, projectId, revision]);
  const mutate = async (action: () => Promise<void>, success: string) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await action();
      if (active.current) {
        setMessage(success);
        refresh();
      }
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  };
  return (
    <>
      {!snapshot ? (
        !error && (
          <p role="status" className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
            正在加载 Issue…
          </p>
        )
      ) : page === "issueCreate" ? (
        <CreateIssue
          scope={scope}
          service={service}
          pending={pending}
          mutationError={error}
          mutate={mutate}
          onMessage={setMessage}
        />
      ) : page === "issueAnalysis" ? (
        <IssueAnalysis
          scope={scope}
          service={service}
          snapshot={snapshot}
          pending={pending}
          mutationError={error}
          mutate={mutate}
          onMessage={setMessage}
        />
      ) : (
        <IssueProgress
          scope={scope}
          service={service}
          snapshot={snapshot}
          pending={pending}
          mutationError={error}
          mutate={mutate}
          onMessage={setMessage}
        />
      )}
      {/* 状态区始终占位，避免刷新错误或操作反馈挤动列表及其滚动区域。 */}
      <div className="mx-auto flex h-10 w-full max-w-5xl shrink-0 items-center gap-3 px-4 md:px-6">
        <p
          role={error ? "alert" : "status"}
          aria-live="polite"
          title={error || (pending ? "正在处理…" : message)}
          className={`min-w-0 flex-1 truncate text-ui-sm ${error ? "text-destructive" : "text-foreground-subtle"}`}
        >
          {error || (pending ? "正在处理…" : message)}
        </p>
        {error && (
          <Button size="sm" variant="outline" onClick={refresh}>
            重新加载
          </Button>
        )}
      </div>
    </>
  );
}
