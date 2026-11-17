import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { TID_WORKFLOW_ARTIFACT_PANE } from "@zcode/shared";
import type { WorkflowRunArtifactSummary } from "@zcode/shared/zcode-protocol-v4";
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, FolderOpenIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  ArtifactKindIcon,
  artifactDisplayTitle,
  artifactKindMessageId,
  artifactOpenAsFileName,
  canRevealArtifactInWorkspace,
  isArtifactPresetKind,
  isTextArtifactContentType,
} from "@/app-shell/workflow-artifacts/artifactPresentation.js";
import { ArtifactOpenAsFileButton } from "@/file-menu/index.js";
import { WorkflowArtifactBody } from "@/app-shell/workflow-artifacts/WorkflowArtifactBody.js";
import { ArtifactMetadataCard } from "@/app-shell/workflow-artifacts/WorkflowArtifactCards.js";
import type { ArtifactItem } from "@/app-shell/workflow-artifacts/presets/index.js";
import {
  artifactViewsFromSummaries,
  type WorkflowRunArtifactView,
} from "@/hooks/useWorkflowRunArtifacts.js";
import { joinFilePath } from "@/lib/path.js";
import type { WorkflowArtifactSidePaneTab } from "@/lib/workspaceSidePane.js";
import type { Theme } from "@/useTheme.js";
import type { PaneWorkspaceScope } from "@/v4/paneLayoutStore.js";
import type { SessionLease } from "@/v4/sessionDataLayer.js";
import { useConversationProjection } from "@/v4/useConversationProjection.js";
import { useV4Conversation, V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";

/** 稳定引用的空摘要列表，避免无产物的投影重复转换。 */
const EMPTY_SUMMARIES: readonly WorkflowRunArtifactSummary[] = [];

const WorkflowArtifactContent = memo(function WorkflowArtifactContent({
  tab,
  onRevealFileInTree,
}: {
  tab: WorkflowArtifactSidePaneTab;
  onRevealFileInTree?: (path: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const { layer } = useV4Conversation();
  const [lease, setLease] = useState<SessionLease | null>(null);

  // 订阅**父会话**的投影（照 PlanDetail / WorkflowRun 详情页）：产物的新鲜元数据是父会话
  // 投影的一部分，不是这个面板的本地缓存。
  useEffect(() => {
    const nextLease = layer.acquire(tab.parentSessionId);
    setLease(nextLease);
    return () => nextLease.release();
  }, [layer, tab.parentSessionId]);
  const state = useConversationProjection(lease);
  const run = useMemo(
    () => state.snapshot?.workflowRuns?.runs.find((candidate) => candidate.runId === tab.runId),
    [state.snapshot?.workflowRuns, tab.runId],
  );
  const artifacts = useMemo(
    () => artifactViewsFromSummaries(run?.artifacts ?? EMPTY_SUMMARIES),
    [run?.artifacts],
  );

  const artifact = useMemo(
    () => artifacts.find((candidate) => candidate.id === tab.artifactId),
    [artifacts, tab.artifactId],
  );
  const sourcePath = artifact?.sourcePath;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid={TID_WORKFLOW_ARTIFACT_PANE}
      data-workflow-artifact-id={tab.artifactId}
      data-workflow-run-id={tab.runId}
    >
      {artifact === undefined ? (
        <div className="flex h-full items-center justify-center p-6 text-center">
          <p
            className="text-ui-base text-foreground-subtle"
            data-testid="workflow-artifact-placeholder"
          >
            {intl.formatMessage({
              id: "chat.toolCall.workflow.run.artifacts.missing",
            })}
          </p>
        </div>
      ) : (
        <ArtifactMetadataCard
          artifact={artifact}
          bytes={artifact.bytes}
          testId="workflow-artifact-metadata"
          {...(sourcePath &&
          onRevealFileInTree &&
          canRevealArtifactInWorkspace({
            sourcePath,
            ...(tab.workspaceIdentity ? { workspaceIdentity: tab.workspaceIdentity } : {}),
            ...(tab.remoteSessionId ? { remoteSessionId: tab.remoteSessionId } : {}),
          })
            ? {
                action: {
                  label: intl.formatMessage({ id: "chat.toolCall.workflow.run.artifacts.reveal" }),
                  onActivate: () => onRevealFileInTree(joinFilePath(tab.workspacePath, sourcePath)),
                },
              }
            : {})}
        />
      )}
    </div>
  );
});

export function WorkflowArtifactView({
  artifact,
  tab,
  theme,
  onRevealFileInTree,
  bytesState,
  items,
  selectedVersion,
  onSelectVersion,
}: {
  artifact: WorkflowRunArtifactView;
  tab: WorkflowArtifactSidePaneTab;
  theme: Theme;
  onRevealFileInTree?: (path: string) => void;
  bytesState: {
    bytes: Uint8Array<ArrayBuffer> | null;
    bytesVersion: number | null;
    loading: boolean;
    error: string | null;
  };
  items: readonly ArtifactItem[];
  selectedVersion?: number;
  onSelectVersion?: (version: number) => void;
}) {
  const { intl } = useZCodeIntl();
  const preset = isArtifactPresetKind(artifact.kind);

  const availableVersions = useMemo(() => {
    if (artifact.versions !== undefined && artifact.versions.length > 0) {
      return artifact.versions.map((entry) => entry.version);
    }
    // 只展示调用方实际提供的版本，不按最新版本号编造历史。
    return [artifact.version];
  }, [artifact.version, artifact.versions]);

  const version =
    selectedVersion !== undefined && availableVersions.includes(selectedVersion)
      ? selectedVersion
      : artifact.version;
  const versionIndex = availableVersions.indexOf(version);

  // 「在工作区显示」与 html 的「在浏览器中打开」共用这一条路径：工作区相对的 `sourcePath`
  // 拼上 workspacePath 才是本机上真实存在的位置。远程 workspace 与无出处的产物都得不到它。
  const sourcePath = artifact.sourcePath;
  const localSourcePath =
    sourcePath !== undefined &&
    canRevealArtifactInWorkspace({
      sourcePath,
      ...(tab.workspaceIdentity === undefined ? {} : { workspaceIdentity: tab.workspaceIdentity }),
      ...(tab.remoteSessionId === undefined ? {} : { remoteSessionId: tab.remoteSessionId }),
    })
      ? joinFilePath(tab.workspacePath, sourcePath)
      : undefined;

  // 浏览器只有「保存副本」动作；「在工作区显示」始终独立成按钮，不依赖本机打开能力。
  const reveal =
    localSourcePath !== undefined && onRevealFileInTree !== undefined
      ? () => onRevealFileInTree(localSourcePath)
      : undefined;

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copyable =
    !preset &&
    bytesState.bytesVersion === version &&
    bytesState.bytes !== null &&
    isTextArtifactContentType(artifact.contentType);
  const handleCopy = useCallback(() => {
    if (bytesState.bytesVersion !== version || bytesState.bytes === null) return;
    void navigator.clipboard
      ?.writeText(new TextDecoder().decode(bytesState.bytes))
      .then(() => setCopied(true))
      .catch(() => undefined);
  }, [bytesState.bytes, bytesState.bytesVersion, version]);

  const title = artifactDisplayTitle(artifact);
  const kindLabel = intl.formatMessage({ id: artifactKindMessageId(artifact.kind) });

  return (
    <>
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* 与产物药丸同一枚方形瓦片：tab 头就是那枚药丸长大了。 */}
          <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-surface-hover text-foreground-subtle">
            <ArtifactKindIcon className="size-3.5" kind={artifact.kind} />
          </span>
          <h2
            className="min-w-0 flex-1 truncate text-ui-base font-medium text-foreground"
            data-testid="workflow-artifact-title"
            title={title}
          >
            {title}
          </h2>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-ui-sm text-foreground-subtle">{kindLabel}</span>
          {onSelectVersion ? (
            <ArtifactVersionStepper
              availableVersions={availableVersions}
              onSelect={onSelectVersion}
              version={version}
              versionIndex={versionIndex}
            />
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            {!preset ? (
              <ArtifactOpenAsFileButton
                artifactId={artifact.id}
                // 只交**属于这一版**的字节：换版本那一帧 bytes 还是旧版的。
                bytes={bytesState.bytesVersion === version ? bytesState.bytes : null}
                fileName={artifactOpenAsFileName(artifact, version)}
                runId={tab.runId}
                version={version}
              />
            ) : null}
            {reveal !== undefined ? (
              <Button
                data-testid="workflow-artifact-reveal"
                onClick={reveal}
                size="sm"
                type="button"
                variant="ghost"
              >
                <FolderOpenIcon aria-hidden="true" className="size-3.5" />
                {intl.formatMessage({ id: "chat.toolCall.workflow.run.artifacts.reveal" })}
              </Button>
            ) : null}
            {copyable ? (
              <Button
                data-testid="workflow-artifact-copy"
                onClick={handleCopy}
                size="sm"
                type="button"
                variant="ghost"
              >
                <CopyIcon aria-hidden="true" className="size-3.5" />
                {intl.formatMessage({
                  id: copied
                    ? "chat.toolCall.workflow.run.artifacts.copied"
                    : "chat.toolCall.workflow.run.artifacts.copy",
                })}
              </Button>
            ) : null}
          </div>
        </div>
        {/* 作者写的说明（用户语言）；缺席即整行不渲染。 */}
        {artifact.description === undefined ? null : (
          <p className="mt-1.5 text-ui-sm text-foreground-subtle">{artifact.description}</p>
        )}
      </header>

      <div className="min-h-0 flex-1">
        <WorkflowArtifactBody
          artifact={artifact}
          bytes={bytesState.bytesVersion === version ? bytesState.bytes : null}
          error={bytesState.error}
          items={items}
          loading={bytesState.loading}
          metadataLoading={false}
          theme={theme}
          version={version}
          {...(reveal === undefined ? {} : { onReveal: reveal })}
        />
      </div>
    </>
  );
}

/**
 * 版本步进器 `‹ v2 / 3 ›`。只有一版时整块缺席——一个永远两端禁用的步进器只是噪声。
 *
 * 按**已知版本的数组**翻而不是按数字加减：journal 读不到时数组里只有最新版一个数，
 * 那时步进器自然消失，而不是给出一批取不到字节的版本号。
 */
function ArtifactVersionStepper({
  availableVersions,
  version,
  versionIndex,
  onSelect,
}: {
  availableVersions: readonly number[];
  version: number;
  versionIndex: number;
  onSelect: (version: number) => void;
}) {
  const { intl } = useZCodeIntl();
  if (availableVersions.length <= 1) {
    return (
      <span
        className="font-mono text-ui-xs text-foreground-subtlest"
        data-testid="workflow-artifact-version"
      >
        {intl.formatMessage(
          { id: "chat.toolCall.workflow.run.artifacts.version" },
          { version: String(version) },
        )}
      </span>
    );
  }
  const previous = availableVersions[versionIndex - 1];
  const next = availableVersions[versionIndex + 1];
  return (
    <div className="flex items-center gap-0.5" data-testid="workflow-artifact-version-stepper">
      <Button
        aria-label={intl.formatMessage({
          id: "chat.toolCall.workflow.run.artifacts.previousVersion",
        })}
        data-testid="workflow-artifact-version-previous"
        disabled={previous === undefined}
        onClick={() => (previous === undefined ? undefined : onSelect(previous))}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
      </Button>
      <span
        className="font-mono text-ui-xs text-foreground-subtle"
        data-testid="workflow-artifact-version"
      >
        {intl.formatMessage(
          { id: "chat.toolCall.workflow.run.artifacts.versionOf" },
          { total: String(availableVersions.length), version: String(version) },
        )}
      </span>
      <Button
        aria-label={intl.formatMessage({ id: "chat.toolCall.workflow.run.artifacts.nextVersion" })}
        data-testid="workflow-artifact-version-next"
        disabled={next === undefined}
        onClick={() => (next === undefined ? undefined : onSelect(next))}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronRightIcon aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * 一个 dwf 产物的全尺寸查看 tab。
 *
 * ⚠ 术语：这里的 artifact 是脚本经 `artifact.*` 交付给用户的产出，不是引擎内部那个
 * 「脚本顶层返回值」的同名词。
 *
 */
export const WorkflowArtifactSidePane = memo(function WorkflowArtifactSidePane({
  tab,
  onRevealFileInTree,
}: {
  tab: WorkflowArtifactSidePaneTab;
  /** 「在工作区显示」：复用既有的文件树 reveal（与 Git 面板同一条路径）。 */
  onRevealFileInTree?: (path: string) => void;
}) {
  const scope = useMemo<PaneWorkspaceScope>(
    () => ({
      workspacePath: tab.workspacePath,
      ...(tab.workspaceIdentity ? { workspaceIdentity: tab.workspaceIdentity } : {}),
      ...(tab.remoteSessionId ? { remoteSessionId: tab.remoteSessionId } : {}),
    }),
    [tab.remoteSessionId, tab.workspaceIdentity, tab.workspacePath],
  );

  return (
    <V4PaneConversationProvider scope={scope}>
      <WorkflowArtifactContent
        tab={tab}
        {...(onRevealFileInTree === undefined ? {} : { onRevealFileInTree })}
      />
    </V4PaneConversationProvider>
  );
});
