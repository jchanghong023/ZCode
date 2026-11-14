import type { SidebarFileTreeTarget, VirtualProject } from "@/project-sidebar/contract.js";

/** 文件读取目标只取用户选中的 root；不能用同路径的当前 tab 猜身份。 */
export function resolveProjectFileTarget(input: {
  project: VirtualProject;
  rootPath: string;
}): SidebarFileTreeTarget {
  const { project, rootPath } = input;
  if (!project.roots.some((root) => root.rootPath === rootPath))
    throw new Error("project.root-not-found");
  return {
    workspacePath: rootPath,
    workspaceName: project.name,
  };
}
