import { logger } from "@/logger.js";

/**
 * 浏览器没有系统目录选择框，也不暴露本机绝对路径；打开工作区唯一入口是服务端目录浏览器。
 * 选中目录后的项目接纳由调用方在目录浏览器回调里完成。
 */
export function openFolderFromWorkspaceEntry({
  openDirectoryBrowser,
}: {
  openDirectoryBrowser?: () => void;
}): void {
  if (!openDirectoryBrowser) {
    logger.warn("[openWorkspaceFolderEntry] directory browser unavailable");
    return;
  }
  logger.info("[openWorkspaceFolderEntry] opening service directory browser...");
  openDirectoryBrowser();
}
