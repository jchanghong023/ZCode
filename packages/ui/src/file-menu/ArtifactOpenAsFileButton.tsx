import { useRef, useState } from "react";
import type { IPlatformService } from "@zcode/shared";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.js";
import { toast } from "@/components/ui/toast.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { fileSaveSuccessMessageId, MAX_FILE_COPY_BYTES } from "@/file-menu/fileCopy.js";
import { logger } from "@/logger.js";

/**
 * 产物 tab 头部的「保存副本」按钮。
 *
 * 浏览器没有本机应用打开能力，也不再物化宿主副本；这里只把调用方已核对版本的原字节
 * 交给浏览器下载。「在工作区显示」由调用方单独渲染，不依赖本按钮的宿主能力。
 */
interface ArtifactOpenAsFileButtonProps {
  runId: string;
  artifactId: string;
  version: number;
  /** 副本的文件名（含扩展名）。 */
  fileName: string;
  /** **这一版**的字节；还没读到（或读到的属于别的版本）时传 null，按钮禁用。 */
  bytes: Uint8Array | null;
}

export function ArtifactOpenAsFileButton(props: ArtifactOpenAsFileButtonProps) {
  const platform = useOptionalPlatform();
  if (!platform?.saveFile) return null;
  return <ArtifactSaveButton {...props} platform={platform} />;
}

function ArtifactSaveButton({
  bytes,
  fileName,
  platform,
  menu = false,
}: ArtifactOpenAsFileButtonProps & { platform: IPlatformService; menu?: boolean }) {
  const { intl } = useZCodeIntl();
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!bytes || !platform.saveFile || pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      if (bytes.byteLength > MAX_FILE_COPY_BYTES) throw new Error("file_too_large");
      // 复制的是调用方已核对版本的原字节，不回读工作区最新版。
      const result = await platform.saveFile({
        data: Uint8Array.from(bytes).buffer,
        suggestedName: fileName,
      });
      if (!result.success && !result.canceled) throw new Error(result.error || "save_failed");
      const messageId = fileSaveSuccessMessageId(result);
      if (messageId) toast(intl.formatMessage({ id: messageId }));
    } catch (error) {
      logger.warn("[workflow-artifacts] 保存产物副本失败", { error: String(error) });
      toast(
        intl.formatMessage({
          id:
            error instanceof Error && error.message === "file_too_large"
              ? "fileActions.saveAsTooLarge"
              : "fileActions.saveAsFailed",
        }),
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const content = (
    <>
      <DownloadIcon className="size-4" />
      {intl.formatMessage({ id: "fileActions.saveAs" })}
    </>
  );
  return menu ? (
    <DropdownMenuItem disabled={bytes === null || saving} onSelect={() => void save()}>
      {content}
    </DropdownMenuItem>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      disabled={bytes === null || saving}
      onClick={() => void save()}
      data-testid="workflow-artifact-save-as"
    >
      {content}
    </Button>
  );
}
