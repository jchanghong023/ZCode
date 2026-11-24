export type ProjectFieldErrors = {
  name?: string;
  repository?: string;
  branch?: string;
  workDirectory?: string;
};

export function validateRepository(
  name: string,
  remote: string,
  branch: string,
  workDirectory: string,
): ProjectFieldErrors {
  const errors: ProjectFieldErrors = {};
  const project = name.trim();
  if (
    !project ||
    project === "." ||
    project === ".." ||
    project.includes("/") ||
    project.includes("\\") ||
    /\p{Cc}/u.test(project)
  )
    errors.name = "请输入可用作目录名的项目名称。";
  const directory = workDirectory.trim();
  const absolutePath = directory.startsWith("/") || /^[A-Za-z]:[\\/]/.test(directory);
  if (!absolutePath || /^(?:[A-Za-z]:)?[\\/]+$/u.test(directory) || /\p{Cc}/u.test(directory))
    errors.workDirectory = "请输入项目工作目录的绝对路径。";
  const url = remote.trim();
  let valid = /^[^\s/@:]+@[^\s/:]+:[^\s]+$/.test(url);
  if (!valid && /^(?:https?|ssh|git):\/\/[^\s]+$/.test(url)) {
    try {
      const address = new URL(url);
      valid = Boolean(address.hostname) && !address.password;
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
