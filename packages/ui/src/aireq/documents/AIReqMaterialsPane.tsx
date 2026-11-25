import { useRef, useState } from "react";
import { FileCode2, ListTree } from "lucide-react";
import { usePlatform } from "@/hooks/usePlatform.js";
import { Button } from "@/components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import {
  hasProjectRole,
  MATERIAL_KIND_LABELS,
  requirementMaterialName,
  type AIReqDiscussionAgent,
  type AIReqDocumentValidation,
  type AIReqDocumentVersion,
  type AIReqMaterialReadRequest,
  type AIReqMaterialView,
  type AIReqSelection,
  type AIReqWorkflowView,
} from "../contract.js";
import { getEmployeeId } from "../identity.js";
import { primaryDiscussionAgent } from "../proposalRoutes.js";
import { AIReqMarkdownDocument } from "../proposals/AIReqMarkdownDocument.js";
import { readMaterialSelection } from "../proposals/material-reader.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "../shell/pageLayout.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import { AIReqDocumentConfirmation } from "./AIReqDocumentConfirmation.js";
import { AIReqSrDependencyGraph } from "./AIReqSrDependencyGraph.js";

interface MaterialsPaneProps {
  view: AIReqWorkflowView;
  selection: AIReqSelection;
  releaseId: string;
  active: boolean;
  validateVersion(): Promise<AIReqDocumentValidation>;
  confirmVersion(snapshot: string): Promise<AIReqDocumentValidation | undefined>;
  retryMaterial(request: AIReqMaterialReadRequest): Promise<boolean>;
}

export function AIReqMaterialsPane({
  view,
  selection,
  releaseId,
  active,
  validateVersion,
  confirmVersion,
  retryMaterial,
}: MaterialsPaneProps) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const ai = useAIReq()!;
  const { fullView, toggleFullView } = useAIReqSidePane();
  const [paneBoundary, setPaneBoundary] = useState<HTMLElement | null>(null);
  const [path, setPath] = useState<string>();
  const [historyVersion, setHistoryVersion] = useState<number>();
  const versionToolbar = useRef<HTMLDivElement>(null);
  const group = view.requirements.find(
    (item) =>
      item.id === selection.irId &&
      item.projectId === selection.projectId &&
      item.releaseId === releaseId,
  );
  if (!group) return null;

  const currentRows = view.srs.filter(
    (item) => item.irId === group.id && item.projectId === group.projectId,
  );
  const { historical, materials, rows, selected, material } = readMaterialSelection(
    group,
    view.materials,
    currentRows,
    {
      path,
      version: historyVersion,
      srId: selection.srId,
      preferDesign: selection.discussionPhase === "solution",
    },
  );
  // 路径移除后回到当前默认文档。后续同路径再出现时不跳回旧选择。
  if (path && !selected) setPath(undefined);
  const viewingHistory = historyVersion !== undefined;
  const primaryAgent = primaryDiscussionAgent(group);
  const discussingPrimary =
    ai.mainView === "chat" &&
    ai.selection.projectId === group.projectId &&
    ai.selection.irId === group.id &&
    ai.selection.discussionPhase === primaryAgent;
  const version = viewingHistory ? historical : group.documentVersion;
  const previousVersions = group.documentHistory.filter(
    (snapshot) => snapshot.number !== group.documentVersion?.number,
  );
  const confirmation = version?.confirmation;
  const employee = getEmployeeId();
  const roles = ai.view ?? view;
  const canUseSolution =
    hasProjectRole(roles, group.projectId, employee, "development") ||
    hasProjectRole(roles, group.projectId, employee, "testing");
  const canConfirm = !viewingHistory && version !== undefined && !confirmation && canUseSolution;
  const confirmedLabel = zh ? "已定版" : "Confirmed";
  const unconfirmedLabel = zh ? "未定版" : "Unconfirmed";
  const formatVersion = ({ number, confirmation }: AIReqDocumentVersion) =>
    `V${number} · ${confirmation ? confirmedLabel : unconfirmedLabel}`;
  const versionLabel = version
    ? `${formatVersion(version)}${viewingHistory ? (zh ? " · 历史版本" : " · History") : ""}`
    : viewingHistory
      ? `V${historyVersion}`
      : zh
        ? "暂无文档"
        : "No documents yet";
  const dependency = materials.find(
    (item) => !item.srId && item.path.endsWith("/sr-dependencies.json"),
  );
  const fileName = (item: AIReqMaterialView) =>
    requirementMaterialName(item.path) ?? MATERIAL_KIND_LABELS[item.kind];
  const srName = (srId: string | undefined) => {
    const title = rows.find((row) => row.id === srId)?.title;
    const prefix = `${group.title} · `;
    return title?.startsWith(prefix) ? title.slice(prefix.length) : title;
  };
  const documentGroups = new Map<string | undefined, AIReqMaterialView[]>();
  for (const item of materials) {
    const section = documentGroups.get(item.srId);
    if (section) section.push(item);
    else documentGroups.set(item.srId, [item]);
  }
  const displayedPath = material?.path;
  const fileOwner = srName(material?.srId);
  const heading = material ? [fileOwner, fileName(material)].filter(Boolean).join(" · ") : "";
  const hasOpeningHeading = /^\s{0,3}#[ \t]+\S/u.test(material?.content?.trimStart() ?? "");
  const failureRequest =
    !viewingHistory && material?.error
      ? {
          projectId: group.projectId,
          irId: group.id,
          releaseId,
          path: material.path,
          sha256: material.sha256,
        }
      : undefined;
  const openRepairAgent = (agent: AIReqDiscussionAgent) => {
    if (
      !active ||
      !versionToolbar.current?.isConnected ||
      ai.settingsOpen ||
      ai.selection.projectId !== group.projectId ||
      !group.sessions.some((session) => session.phase === agent)
    )
      return;
    // 完整视图会隐藏会话，即使目标已是当前会话，也要先让主区恢复可交互。
    if (fullView) toggleFullView();
    ai.select({ projectId: group.projectId, irId: group.id, discussionPhase: agent });
  };

  return (
    <section
      ref={setPaneBoundary}
      aria-label={zh ? "需求文档" : "Requirement documents"}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background"
      data-testid="materials-pane"
    >
      {(version || viewingHistory || materials.length > 0) && (
        <div className="shrink-0 border-b border-border/50 pt-4 pb-3">
          <div className={`mx-auto min-w-0 space-y-3 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
            <div ref={versionToolbar} className="flex flex-wrap items-center gap-2">
              {previousVersions.length > 0 && active ? (
                <Select
                  value={viewingHistory ? String(historyVersion) : "latest"}
                  onValueChange={(value) => {
                    setPath(displayedPath);
                    setHistoryVersion(value === "latest" ? undefined : Number(value));
                  }}
                >
                  <SelectTrigger
                    variant="outline"
                    className="h-8 max-w-full min-w-0 text-ui-caption"
                    aria-label={zh ? "选择文档版本" : "Choose document version"}
                    data-testid="document-version-select"
                    data-aireq-version-status=""
                  >
                    <SelectValue>{versionLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    align="start"
                    collisionBoundary={paneBoundary}
                    className="max-w-(--radix-select-content-available-width)"
                  >
                    <SelectItem value="latest">
                      {zh ? "最新版本" : "Latest version"}
                      {group.documentVersion && ` · ${formatVersion(group.documentVersion)}`}
                    </SelectItem>
                    {previousVersions
                      .sort((a, b) => b.number - a.number)
                      .map((snapshot) => (
                        <SelectItem key={snapshot.number} value={String(snapshot.number)}>
                          {formatVersion(snapshot)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <span
                  className="rounded-sm text-ui-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  role="status"
                  tabIndex={-1}
                  data-aireq-version-status=""
                >
                  {versionLabel}
                </span>
              )}
              {active && (
                <AIReqDocumentConfirmation
                  canConfirm={canConfirm}
                  sessions={group.sessions}
                  requirementsPath={group.documentPath}
                  validateVersion={validateVersion}
                  confirmVersion={confirmVersion}
                  openRepairAgent={openRepairAgent}
                  focusVersion={() =>
                    versionToolbar.current
                      ?.querySelector<HTMLElement>("[data-aireq-version-status]")
                      ?.focus({ preventScroll: true })
                  }
                />
              )}
              {materials.length > 1 && active && (
                <Select value={displayedPath} onValueChange={setPath}>
                  <SelectTrigger
                    variant="outline"
                    className="h-8 max-w-full gap-2 text-ui-caption"
                    data-testid="material-menu"
                    aria-label={zh ? "文档目录" : "Document directory"}
                  >
                    <ListTree className="size-3.5 shrink-0" aria-hidden="true" />
                    <SelectValue>{zh ? "文档目录" : "Document directory"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    align="start"
                    collisionBoundary={paneBoundary}
                    className="w-72 max-w-(--radix-select-content-available-width)"
                  >
                    {[...documentGroups].map(([srId, files]) => (
                      <SelectGroup key={srId ?? "ir"}>
                        <SelectLabel className="max-w-full whitespace-normal wrap-anywhere font-medium text-foreground">
                          {srId ? (srName(srId) ?? srId) : zh ? "共享需求文档" : "Shared documents"}
                        </SelectLabel>
                        {files.map((item) => (
                          <SelectItem key={item.path} value={item.path}>
                            {fileName(item)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {active && displayedPath && (
                <MaterialFilePath
                  key={displayedPath}
                  path={displayedPath}
                  boundary={paneBoundary}
                />
              )}
            </div>
            {confirmation && (
              <p
                role="status"
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-ui-sm text-foreground-subtle"
              >
                <span>
                  {zh ? "确认人" : "Confirmed by"} {confirmation.employeeId}
                </span>
                <time dateTime={confirmation.confirmedAt} title={zh ? "北京时间" : "Beijing time"}>
                  {new Date(confirmation.confirmedAt).toLocaleString(locale, {
                    timeZone: "Asia/Shanghai",
                  })}
                </time>
              </p>
            )}
          </div>
        </div>
      )}
      <div
        key={`${historyVersion ?? "latest"}:${displayedPath ?? ""}`}
        className="min-h-0 flex-1 overflow-auto py-4 [scrollbar-gutter:stable]"
        style={{ scrollbarWidth: "thin" }}
        data-testid="material"
        data-material-path={displayedPath}
        data-material-valid={material?.valid}
      >
        <div className={`mx-auto min-w-0 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
          {material?.error ? (
            <MaterialReadError
              key={material.sha256}
              error={material.error}
              retry={failureRequest ? () => retryMaterial(failureRequest) : undefined}
            />
          ) : !material ? (
            <div className="space-y-2">
              <p role="status" className="text-ui-base text-foreground-subtle">
                {viewingHistory && !historical
                  ? zh
                    ? "此历史版本暂不可用。"
                    : "This historical version is unavailable."
                  : version
                    ? zh
                      ? "此版本没有文件。"
                      : "This version has no files."
                    : zh
                      ? "暂无文档"
                      : "No documents yet"}
              </p>
              {!version && !viewingHistory && primaryAgent && (
                <>
                  <p className="text-ui-caption text-foreground-subtle">
                    {primaryAgent === "solution"
                      ? zh
                        ? "在方案讨论中编写设计和测试方案。"
                        : "Use the solution discussion to write the design and test plan."
                      : zh
                        ? "在需求讨论中整理需求，保存的需求文档会显示在这里。"
                        : "Use the requirements discussion to draft a document. Saved documents appear here."}
                  </p>
                  {!discussingPrimary && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        ai.select({
                          projectId: group.projectId,
                          irId: group.id,
                          discussionPhase: primaryAgent,
                        })
                      }
                    >
                      {primaryAgent === "requirements"
                        ? zh
                          ? "讨论需求"
                          : "Discuss requirements"
                        : zh
                          ? "讨论方案"
                          : "Discuss solution"}
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : !material.content?.trim() ? (
            <p role="status" className="text-ui-sm text-foreground-subtle">
              {zh ? "文档没有正文。" : "This document is empty."}
            </p>
          ) : material === dependency ? (
            <AIReqSrDependencyGraph material={material} rows={rows} />
          ) : (
            <article className="w-full min-w-0" data-testid="material-document">
              {!hasOpeningHeading && <h2 className="mb-3 text-ui-lg font-semibold">{heading}</h2>}
              <AIReqMarkdownDocument className="h-auto min-w-0 wrap-anywhere">
                {material.content}
              </AIReqMarkdownDocument>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

function MaterialFilePath({ path, boundary }: { path: string; boundary: HTMLElement | null }) {
  const { locale } = useZCodeIntl();
  const { writeClipboardText } = usePlatform();
  const zh = locale === "zh-CN";
  const label = zh ? "文件路径" : "File path";
  const [copyResult, setCopyResult] = useState<"copied" | "failed">();
  const copyPath = async () => {
    try {
      await writeClipboardText(path);
      setCopyResult("copied");
    } catch {
      setCopyResult("failed");
    }
  };
  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) setCopyResult(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="ml-auto"
          aria-label={label}
          title={label}
        >
          <FileCode2 className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionBoundary={boundary}
        aria-label={label}
        className="w-80 max-w-(--radix-popover-content-available-width) gap-2"
      >
        <p className="text-ui-base font-medium">{label}</p>
        <code
          className="wrap-anywhere text-ui-caption select-text"
          data-testid="material-full-path"
        >
          {path}
        </code>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span role="status" className="text-ui-sm text-foreground-subtle">
            {copyResult === "copied"
              ? zh
                ? "已复制"
                : "Copied"
              : copyResult === "failed"
                ? zh
                  ? "复制失败，可手动选中复制。"
                  : "Copy failed. Select the path to copy it manually."
                : null}
          </span>
          <Button type="button" variant="outline" onClick={() => void copyPath()}>
            {zh ? "复制路径" : "Copy path"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MaterialReadError({ error, retry }: { error: string; retry?: () => Promise<boolean> }) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [pending, setPending] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  return (
    <div className="space-y-3">
      <p role="alert" className="text-ui-base text-destructive">
        {error}
      </p>
      {retry && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          data-testid="material-retry"
          onClick={async () => {
            setPending(true);
            setRetryFailed(!(await retry()));
            setPending(false);
          }}
        >
          {zh ? "重新读取文档" : "Retry reading document"}
        </Button>
      )}
      {retryFailed && (
        <p role="status" className="text-ui-sm text-foreground-subtle">
          {zh ? "仍无法读取此文件。" : "This file is still unavailable."}
        </p>
      )}
    </div>
  );
}
