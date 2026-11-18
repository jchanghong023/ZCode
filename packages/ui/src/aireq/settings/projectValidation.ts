export type ProjectFieldErrors = { name?: string; repository?: string; branch?: string };

export function validateRepository(
  name: string,
  remote: string,
  branch: string,
): ProjectFieldErrors {
  const errors: ProjectFieldErrors = {};
  if (!name.trim()) errors.name = "请输入项目名称。";
  const url = remote.trim();
  let valid = /^[^\s/@:]+@[^\s/:]+:[^\s]+$/.test(url);
  if (!valid && /^(?:https?|ssh|git):\/\/[^\s]+$/.test(url)) {
    try {
      valid = Boolean(new URL(url).hostname);
    } catch {
      valid = false;
    }
  }
  if (!valid)
    errors.repository =
      "请输入含主机的 HTTP(S)、SSH、git URL 或 user@host:path 远程仓库地址；不支持本地路径。";
  const value = branch.trim();
  if (
    !value ||
    /[\s~^:?*[\\]/.test(value) ||
    value.includes("..") ||
    value.includes("@{") ||
    value.startsWith("-") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.endsWith(".lock") ||
    value.includes("//") ||
    value === "@" ||
    value.split("/").some((part) => part.startsWith("."))
  )
    errors.branch = "请输入有效的默认分支名称。";
  return errors;
}
