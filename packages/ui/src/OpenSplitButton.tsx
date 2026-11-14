import type { ReactElement, ReactNode } from "react";
import { ChevronDownIcon, ExternalLinkIcon, PanelRightIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import type { MessageFileLinkTarget } from "@/components/ai-elements/message.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu.js";
import { FileSaveAsMenuItem } from "@/file-menu/index.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useFileContextActions } from "@/hooks/useFileContextActions.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";
import { getWorkspaceFileRelativePath } from "@/workspace-file-tree/model.js";

// 导出类型供共用时间线以 import type 引用（构建期擦除，不把 open-with 子树带进公开页 bundle）。
export type OpenSplitButtonTarget =
  | {
      type: "website";
      url: string;
      localPath?: string;
      /** 卡片来源元数据；不用于浏览器本机文件操作。 */
      sourcePath?: string;
      workspacePath?: string;
    }
  | {
      type: "file";
      path: string;
      title: string;
      label: string;
      previewSource?: CodeViewerSource;
    };

interface OpenSplitButtonProps {
  target: OpenSplitButtonTarget;
  onOpenBrowserUrl?: (url: string) => void;
  onOpenFileLink?: (target: MessageFileLinkTarget) => void;
  onOpenCodeViewer?: (source: CodeViewerSource) => void;
  hideOpenWithMenu?: boolean;
  openDefaultOnPrimary?: boolean;
  /** 预览专属的显示选项，追加在统一文件动作之后，不复制文件操作。 */
  viewMenuItems?: ReactNode;
  stopPropagation?: boolean;
  /** 整张卡片复用按钮的操作与状态，右键和下拉不会维护两套动作。 */
  renderCard?: (
    button: ReactNode,
    /** 卡片主体整卡点击复用主按钮的预览动作与可用状态。 */
    actions: { handlePreview: () => void; canPreview: boolean },
  ) => ReactElement;
}

/**
 * 文件/网址打开按钮。浏览器没有本机编辑器、关联应用和文件管理器，
 * 因此只保留真实可用的动作：浏览器新标签打开网址、应用内预览、保存副本、复制路径。
 */
export function OpenSplitButton({
  target,
  onOpenBrowserUrl,
  onOpenFileLink,
  onOpenCodeViewer,
  hideOpenWithMenu = false,
  openDefaultOnPrimary = false,
  viewMenuItems,
  stopPropagation = false,
  renderCard,
}: OpenSplitButtonProps) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const fileActions = useFileContextActions();
  const workspacePath =
    target.type === "file" ? target.previewSource?.workspacePath : target.workspacePath;

  const canPreview = openDefaultOnPrimary
    ? target.type === "website"
      ? Boolean(onOpenBrowserUrl)
      : Boolean(onOpenFileLink || onOpenCodeViewer)
    : target.type === "website"
      ? Boolean(onOpenBrowserUrl)
      : Boolean(onOpenFileLink || onOpenCodeViewer);

  const stopEventPropagation = (event: { stopPropagation: () => void }) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
  };

  const handlePreview = () => {
    if (target.type === "website") {
      onOpenBrowserUrl?.(target.url);
      return;
    }
    if (onOpenCodeViewer) {
      onOpenCodeViewer(
        target.previewSource ?? {
          type: "file",
          title: target.title,
          path: target.path,
        },
      );
      return;
    }

    onOpenFileLink?.({
      path: target.path,
      label: target.label,
      pathKind: "file",
      workspacePath: target.previewSource?.workspacePath,
      workspaceIdentity: target.previewSource?.workspaceIdentity,
      workspaceRemoteSessionId: target.previewSource?.workspaceRemoteSessionId,
    });
  };

  const handleOpenExternal = () => {
    platform.openExternal(target.type === "website" ? target.url : target.path);
  };

  const renderFileActions = (variant: "context" | "dropdown") => {
    const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
    const Separator = variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
    return (
      <>
        {target.type === "website" ? (
          <Item onSelect={handleOpenExternal}>
            <ExternalLinkIcon className="size-4" />
            {intl.formatMessage({ id: "chat.previewCards.openExternal" })}
          </Item>
        ) : null}
        {target.type === "website" ? (
          <Item onSelect={() => void fileActions.copyAbsolutePath({ path: target.url })}>
            <CopyIcon className="size-4" />
            {intl.formatMessage({ id: "chat.previewCards.copyLink" })}
          </Item>
        ) : (
          <>
            <FileSaveAsMenuItem
              variant={variant}
              path={target.path}
              workspacePath={workspacePath}
              workspaceIdentity={target.previewSource?.workspaceIdentity}
              workspaceRemoteSessionId={target.previewSource?.workspaceRemoteSessionId}
            />
            {workspacePath ? (
              <Item
                onSelect={() =>
                  void fileActions.copyRelativePath({
                    path: target.path,
                    relativePath: getWorkspaceFileRelativePath(workspacePath, target.path),
                  })
                }
              >
                <CopyIcon className="size-4" />
                {intl.formatMessage({ id: "fileActions.copyRelativePath" })}
              </Item>
            ) : null}
            <Item onSelect={() => void fileActions.copyAbsolutePath({ path: target.path })}>
              <CopyIcon className="size-4" />
              {intl.formatMessage({ id: "fileActions.copyAbsolutePath" })}
            </Item>
          </>
        )}
        <Separator />
      </>
    );
  };

  const button = (
    <DropdownMenu>
      <div
        className="flex h-7 shrink-0 items-center overflow-hidden rounded-lg border border-border bg-input transition-all hover:border-border-hover"
        onClick={stopEventPropagation}
        onPointerDown={stopEventPropagation}
      >
        <Button
          type="button"
          variant="ghost"
          size="default"
          className={`h-7 rounded-none border-0 gap-1 ${hideOpenWithMenu ? "px-2" : "pr-1.5"}`}
          disabled={!canPreview}
          onClick={(event) => {
            stopEventPropagation(event);
            handlePreview();
          }}
        >
          {intl.formatMessage({ id: "common.open" })}
        </Button>
        {!hideOpenWithMenu ? (
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-md"
              className="!w-5 rounded-none border-0 text-foreground-subtlest"
              aria-label={intl.formatMessage({ id: "appHeader.selectOpenApp" })}
              title={intl.formatMessage({ id: "appHeader.selectOpenApp" })}
              onClick={stopEventPropagation}
            >
              <ChevronDownIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        ) : null}
      </div>
      {!hideOpenWithMenu ? (
        <DropdownMenuContent
          align="end"
          side="top"
          className="w-64 max-w-[calc(100vw-1rem)]"
          onClick={stopEventPropagation}
        >
          {renderFileActions("dropdown")}
          {viewMenuItems ? (
            <>
              <DropdownMenuSeparator />
              {viewMenuItems}
            </>
          ) : null}
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
  if (!renderCard) return button;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {renderCard(button, { handlePreview, canPreview })}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64 max-w-[calc(100vw-1rem)]">
        <ContextMenuItem disabled={!canPreview} onSelect={handlePreview}>
          <PanelRightIcon className="size-4" />
          {intl.formatMessage({ id: "chat.previewCards.previewInSidePane" })}
        </ContextMenuItem>
        {renderFileActions("context")}
      </ContextMenuContent>
    </ContextMenu>
  );
}
