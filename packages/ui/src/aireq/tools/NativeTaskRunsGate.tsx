import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, FileText, RefreshCw } from "lucide-react";
import type {
  NativeTaskRunsSnapshot,
  NativeTaskOutputContent,
  NativeTaskActor,
} from "../contract.js";
import { Button } from "@/components/ui/button.js";
import { MessageResponse } from "@/components/ai-elements/message.js";
import { CodeBlock } from "@/components/ai-elements/code-block.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { useAIReqDataSource } from "../data-source.js";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import { AIReqSessionPane } from "../conversation/AIReqSessionPane.js";

export function NativeTaskRunsGate({
  sessionId,
  workspacePath,
  workspaceIdentity,
}: {
  sessionId?: string;
  workspacePath: string;
  workspaceIdentity?: string;
}) {
  const source = useAIReqDataSource();
  const theme = useZCodeStore((state) => state.theme);
  const scope = useMemo(
    () => ({ workspacePath, workspaceIdentity }),
    [workspacePath, workspaceIdentity],
  );
  const [snapshot, setSnapshot] = useState<NativeTaskRunsSnapshot>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState<{
    runId: string;
    actor?: NativeTaskActor;
    outputId?: string;
  }>();
  const [output, setOutput] = useState<NativeTaskOutputContent>();
  useEffect(() => {
    setSnapshot(undefined);
    setSelection(undefined);
    setOutput(undefined);
  }, [source, scope, sessionId]);
  useEffect(() => {
    let active = true;
    setError("");
    if (!sessionId) return;
    if (!source.nativeTasks) {
      setError("服务未提供原生任务读取能力。");
      return;
    }
    setLoading(true);
    void source.nativeTasks
      .listRuns({ ...scope, sessionId })
      .then(
        (value) => {
          if (active) setSnapshot(value);
        },
        (cause) => {
          if (active) setError(String(cause instanceof Error ? cause.message : cause));
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [source, scope, sessionId, refresh]);
  useEffect(() => {
    let active = true;
    setOutput(undefined);
    if (!sessionId || !selection?.outputId || !source.nativeTasks) return;
    void source.nativeTasks
      .readOutput({ ...scope, sessionId, runId: selection.runId, outputId: selection.outputId })
      .then(
        (value) => {
          if (active) setOutput(value);
        },
        (cause) => {
          if (active) setError(cause instanceof Error ? cause.message : String(cause));
        },
      );
    return () => {
      active = false;
    };
  }, [source, scope, sessionId, selection, refresh]);
  // 修复原因：刷新后运行、actor 或输出可能已经消失，不能继续展示旧快照或永久停在“读取中”。
  const selectedRun = snapshot?.runs.find((run) => run.runId === selection?.runId);
  const selectedActor = selection?.actor
    ? selectedRun?.actors.find((actor) => actor.sessionId === selection.actor?.sessionId)
    : undefined;
  const selectedOutput = selectedRun?.outputs.find((item) => item.id === selection?.outputId);
  const unavailable = Boolean(
    selection && snapshot && (!selectedRun || (!selectedActor && !selectedOutput)),
  );
  return (
    <section className="min-h-0 min-w-0 space-y-4" aria-label="原生任务运行">
      <div className="mb-5 mt-8 flex items-center justify-between gap-3">
        <h2 className="text-ui-base font-medium text-foreground-subtle">原生任务运行</h2>
        {sessionId && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="刷新"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
      {!sessionId && (
        <p role="status" className="text-ui-sm text-foreground-subtle">
          当前会话未提供原生任务运行读取能力。
        </p>
      )}
      {loading && (
        <p role="status" className="text-ui-sm">
          正在读取运行…
        </p>
      )}
      {error && (
        <p role="alert" className="text-ui-sm text-destructive">
          {error}
        </p>
      )}
      {selection ? (
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setSelection(undefined);
              setError("");
            }}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            返回运行列表
          </Button>
          <h3 className="break-words text-ui-base font-medium">
            {selectedActor?.title ?? selectedOutput?.title}
          </h3>
          {unavailable ? (
            <p role="status" className="text-ui-base text-foreground-subtle">
              此运行中的会话或输出已不可用。
            </p>
          ) : selectedActor ? (
            <div className="relative h-[65vh] min-h-80 overflow-hidden rounded-xl border border-card-border">
              <V4PaneConversationProvider scope={scope} sessionId={selectedActor.sessionId}>
                <AIReqSessionPane
                  paneId={`native-task:${selectedActor.sessionId}`}
                  sessionId={selectedActor.sessionId}
                  rootSessionId={sessionId}
                  workspacePath={workspacePath}
                  workspaceIdentity={workspaceIdentity}
                  embedded
                  readOnly
                  focused
                />
              </V4PaneConversationProvider>
            </div>
          ) : output ? (
            <div className="max-h-[65vh] min-w-0 overflow-auto rounded-xl border border-card-border p-4">
              {output.format === "markdown" ? (
                <MessageResponse
                  theme={theme}
                  workspacePath={workspacePath}
                  showExportActions={false}
                >
                  {output.content}
                </MessageResponse>
              ) : (
                <CodeBlock
                  showExportActions={false}
                  appTheme={theme}
                  code={output.content}
                  language={output.format === "json" ? "json" : "text"}
                />
              )}
            </div>
          ) : (
            !error && (
              <p role="status" className="text-ui-sm">
                正在读取输出…
              </p>
            )
          )}
        </>
      ) : (
        <>
          {snapshot?.runs.length === 0 && (
            <p className="text-ui-sm text-foreground-subtle">
              当前会话尚未观测到 task / workpool 调用。
            </p>
          )}
          {snapshot?.runs.map((run) => (
            <article
              key={run.runId}
              className="min-w-0 space-y-3 rounded-xl border border-card-border p-4"
            >
              <div className="flex flex-wrap justify-between gap-2 text-ui-base">
                <h3>{run.title}</h3>
                <span className="text-ui-sm text-foreground-subtle">{run.status}</span>
              </div>
              <p className="break-all font-mono text-ui-xs text-foreground-subtle">
                {run.toolCallId}
              </p>
              <NativeTaskRunGraph
                actors={run.actors}
                onOpen={(actor) => setSelection({ runId: run.runId, actor })}
              />
              <div className="flex flex-wrap gap-2">
                {run.outputs.map((item) => (
                  <Button
                    key={item.id}
                    variant="outline"
                    onClick={() => {
                      setError("");
                      setSelection({ runId: run.runId, outputId: item.id });
                    }}
                  >
                    <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.title}</span>
                  </Button>
                ))}
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}

/** 只画服务端观测到的父子关系；循环或孤立 actor 仍可阅读，不伪造业务阶段。 */
function NativeTaskRunGraph({
  actors,
  onOpen,
}: {
  actors: NativeTaskActor[];
  onOpen: (actor: NativeTaskActor) => void;
}) {
  const reached = new Set<string>();
  const renderActor = (actor: NativeTaskActor, ancestors: ReadonlySet<string>): ReactNode => {
    reached.add(actor.sessionId);
    const next = new Set([...ancestors, actor.sessionId]);
    return (
      <li key={actor.sessionId} className="space-y-2 border-l border-border pl-4 pt-2">
        <Button
          variant="outline"
          className="h-auto w-full flex-wrap justify-between py-2"
          onClick={() => onOpen(actor)}
        >
          <span className="break-words">{actor.title}</span>
          <span>{actor.status}</span>
          <span className="w-full break-all text-left font-mono text-ui-xs">{actor.sessionId}</span>
        </Button>
        <ul>
          {actors
            .filter(
              (child) => child.parentSessionId === actor.sessionId && !next.has(child.sessionId),
            )
            .map((child) => renderActor(child, next))}
        </ul>
      </li>
    );
  };
  const roots = actors.filter(
    (actor) => !actors.some((parent) => parent.sessionId === actor.parentSessionId),
  );
  const nodes = roots.map((actor) => renderActor(actor, new Set()));
  for (const actor of actors)
    if (!reached.has(actor.sessionId)) nodes.push(renderActor(actor, new Set()));
  return <ul aria-label="父子会话关系">{nodes}</ul>;
}
