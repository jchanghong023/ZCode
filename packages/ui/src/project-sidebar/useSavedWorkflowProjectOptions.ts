import { useMemo } from "react";
import type { AutomationWorkspaceOption } from "@/settings/automationWorkspaceOptions.js";
import { useOptionalProjectDirectory } from "@/project-sidebar/ProjectDirectoryProvider.js";
export function useSavedWorkflowProjectOptions(): AutomationWorkspaceOption[] {
  const directory = useOptionalProjectDirectory();
  return useMemo(
    () =>
      (directory?.projects ?? []).flatMap((project) => {
        const root = project.roots.find((root) => root.isPrimary)?.rootPath;
        if (!root || project.deleted) return [];
        return [
          {
            projectId: project.id,
            hostId: project.hostId,
            workspacePath: root,
            label: project.name,
          },
        ];
      }),
    [directory?.projects],
  );
}
