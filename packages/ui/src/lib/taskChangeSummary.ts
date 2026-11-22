import { getPathLeaf } from "@/lib/path.js";
function trimTrailingSeparators(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

export function toWorkspaceRelativePath(workspacePath: string, filePath: string): string {
  const normalizedWorkspacePath = trimTrailingSeparators(workspacePath.replace(/\\/g, "/"));
  const normalizedFilePath = filePath.replace(/\\/g, "/");

  if (normalizedFilePath === normalizedWorkspacePath) {
    return getPathLeaf(filePath);
  }

  const exactPrefix = `${normalizedWorkspacePath}/`;
  if (normalizedFilePath.startsWith(exactPrefix)) {
    return normalizedFilePath.slice(exactPrefix.length) || getPathLeaf(filePath);
  }

  // Windows 路径在不同来源下大小写可能不一致，这里做一次只用于比较的降级匹配。
  const caseInsensitivePrefix = exactPrefix.toLowerCase();
  if (normalizedFilePath.toLowerCase().startsWith(caseInsensitivePrefix)) {
    return normalizedFilePath.slice(exactPrefix.length) || getPathLeaf(filePath);
  }

  return normalizedFilePath;
}

