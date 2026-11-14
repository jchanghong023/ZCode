import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Copy, Download, Ellipsis, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { readBoundedImageBlob } from "@/lib/imagePreviewDownload.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { captureImageComposerTarget } from "@/image-preview-editor/composerTarget.js";
import { copyPreviewImage } from "@/lib/copyPreviewImage.js";
import { toast } from "@/components/ui/toast.js";
import { logger } from "@/logger.js";

/**
 * 图片预览动作。浏览器只有三类真实动作：加入对话、复制、下载。
 * 本机默认应用/文件管理器/编辑器入口属于已裁撤宿主能力，这里不再接线。
 */
export function ImagePreviewActions({
  children,
  zoomControls,
  src,
  alt,
  filename,
  imageRef,
  ready,
  onAdded,
  onAddEdited,
  onBusyChange,
  onDownload,
  downloading,
}: {
  children: ReactNode;
  zoomControls: ReactNode;
  src: string;
  alt: string;
  filename?: string;
  imageRef: RefObject<HTMLImageElement | null>;
  ready: boolean;
  onAdded: () => void;
  onAddEdited?: () => void;
  onBusyChange?: (busy: boolean) => void;
  onDownload: () => Promise<void>;
  downloading: boolean;
}) {
  const { intl } = useZCodeIntl();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = async (action: string, task: () => Promise<void>) => {
    if (pending.current || downloading) return;
    pending.current = true;
    onBusyChange?.(true);
    setBusy(true);
    try {
      await task();
    } catch (error) {
      if (alive.current) {
        logger.warn("[ImagePreview] 图片操作失败", {
          action,
          error: error instanceof Error ? error.message : String(error),
        });
        toast(
          intl.formatMessage({
            id: action === "copy" ? "preview.image.copyFailed" : "preview.image.actionFailed",
          }),
        );
      }
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };
  const download = () =>
    run("download", async () => {
      // 下载动作由调用方负责（浏览器下载端口），这里只转发并统一忙态/错误提示。
      await onDownload();
    });
  const actions = [
    {
      id: "add",
      label: intl.formatMessage({ id: "workspaceFileTree.addToChat" }),
      Icon: MessageSquarePlus,
      disabled: !ready,
      select: () => {
        if (onAddEdited) {
          onAddEdited();
          return;
        }
        // 异步读图前锁定接收方，切换会话或关闭弹层后不把附件加到另一段对话。
        const target = captureImageComposerTarget();
        if (!target) {
          toast(intl.formatMessage({ id: "imageEditor.noComposer" }));
          return;
        }
        void run("add", async () => {
          const blob = await readBoundedImageBlob(src);
          if (!alive.current) return;
          const file = new File([blob], filename || alt || "image.png", { type: blob.type });
          if (!target.append(file)) throw new Error("composer_rejected");
          onAdded();
        });
      },
    },
    {
      id: "copy",
      label: intl.formatMessage({ id: "preview.image.copy" }),
      Icon: Copy,
      disabled: !ready,
      select: () =>
        void run("copy", async () => {
          if (!imageRef.current) return;
          await copyPreviewImage(imageRef.current);
          if (alive.current) toast(intl.formatMessage({ id: "preview.image.copied" }));
        }),
    },
    {
      id: "download",
      label: intl.formatMessage({ id: "markdownImage.download" }),
      Icon: Download,
      disabled: !ready,
      select: () => void download(),
    },
  ];
  const actionItems = (context: boolean) => {
    const Item = context ? ContextMenuItem : DropdownMenuItem;
    return actions.map(({ id, label, Icon, disabled, select }) => (
      <Item
        key={id}
        data-image-preview-action={id}
        disabled={disabled || busy || downloading}
        onSelect={select}
      >
        <Icon aria-hidden="true" />
        {label}
      </Item>
    ));
  };
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>{actionItems(true)}</ContextMenuContent>
      </ContextMenu>
      <div className="absolute right-16 top-4 z-20 flex max-w-[calc(100%-5rem)] items-center gap-1 rounded-xl border border-popover-border bg-popover p-1.5 shadow-sm platform-mac-desktop:top-12 platform-windows-desktop:top-[calc(env(titlebar-area-height,48px)_+_0.5rem)] platform-windows-desktop:right-20 platform-linux-desktop:right-20">
        {zoomControls}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={intl.formatMessage({ id: "markdownImage.download" })}
          disabled={!ready || busy || downloading}
          onClick={() => void download()}
        >
          <Download />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={intl.formatMessage({ id: "preview.image.actions" })}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{actionItems(false)}</DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
