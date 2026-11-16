import { usePlatform } from "@/hooks/usePlatform.js";
import { useCallback } from "react";
import { logger } from "@/logger.js";

interface FileContextActionTarget {
  path: string;
  relativePath?: string;
  deleted?: boolean;
  kind?: "file" | "directory";
}

/**
 * 浏览器不能启动本机文件管理器或关联应用；这里只保留路径复制这类真实可用的动作。
 * 需要定位/打开本机文件的入口由调用方删除，不再提供点了没反应的菜单项。
 */
export function useFileContextActions() {
  const { writeClipboardText } = usePlatform();
  const copyPathText = useCallback(
    async (path: string) => {
      if (typeof navigator === "undefined") {
        logger.warn("[FileContextActions] 复制文件路径失败", {
          path,
          error: "clipboard-unavailable",
        });
        return;
      }
      try {
        await writeClipboardText(path);
        logger.info("[FileContextActions] 文件路径已复制", { path });
      } catch (error) {
        logger.warn("[FileContextActions] 复制文件路径失败", {
          path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [writeClipboardText],
  );
  const copyPath = useCallback(
    (target: FileContextActionTarget) => copyPathText(target.path),
    [copyPathText],
  );
  const copyAbsolutePath = copyPath;
  const copyRelativePath = useCallback(
    (target: FileContextActionTarget) => copyPathText(target.relativePath ?? target.path),
    [copyPathText],
  );
  return { copyAbsolutePath, copyPath, copyRelativePath };
}
