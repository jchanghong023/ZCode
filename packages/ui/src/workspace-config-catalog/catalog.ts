import {
  type ConfigCatalogSnapshot,
  type ConfigWorkspaceTarget,
} from "@/workspace-config-catalog/contract.js";

export { readProjectCatalog as readConfigCatalog } from "@zcode/services";

export function projectConfigTargets(
  snapshot: ConfigCatalogSnapshot,
  existing: readonly ConfigWorkspaceTarget[],
): ConfigWorkspaceTarget[] {
  const targets = new Map<string, ConfigWorkspaceTarget>();
  for (const project of snapshot.projects) {
    if (project.deleted) continue;
    for (const root of project.roots) {
      const key = root.rootPath;
      if (targets.has(key)) continue;
      const connection = existing.find(
        (target) => (target.workspaceIdentity?.trim() || target.workspacePath) === key,
      );
      const normalizedPath = root.rootPath.replace(/\\/g, "/").replace(/\/$/, "");
      targets.set(key, {
        workspacePath: root.rootPath,
        hostId: project.hostId,
        label: normalizedPath.split("/").pop() || root.rootPath,
        ...(connection
          ? {
              remoteSessionId: connection.remoteSessionId,
              ...(connection.remoteTarget ? { remoteTarget: connection.remoteTarget } : {}),
              localWorkspacePath: connection.localWorkspacePath,
              availability: connection.availability,
            }
          : {}),
      });
    }
  }
  return [...targets.values()];
}
