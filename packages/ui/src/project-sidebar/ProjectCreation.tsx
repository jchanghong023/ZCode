import { captureV4ComposerDraftHandoff } from "@/v4/composer/composerDraftWorkspaceTransfer.js";
import { useComposerClientNamespace } from "@/hooks/useServices.js";
import { useOptionalTabStore } from "@/store/TabStoreProvider.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { useEffect, useRef, useState } from "react";
import type {
  IProjectService,
  VirtualProject,
  ProjectSidebarProps,
} from "@/project-sidebar/contract.js";
import { ProjectEditor } from "@/project-sidebar/ProjectEditor.js";

export function ProjectCreation({
  workspacePath,
  workspaceIdentity,
  onCreateTask,
  projects,
  service,
  onClose,
  onSaved,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  onCreateTask: ProjectSidebarProps["onCreateTask"];
  projects: VirtualProject[];
  service: IProjectService;
  onClose(): void;
  onSaved(): Promise<void>;
}) {
  const composerClientNamespace = useComposerClientNamespace();
  const activeTabId = useOptionalTabStore((state) => state.activeTabId);
  const originTabId = useRef(activeTabId);
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const currentScope = useRef({ workspaceKey, activeTabId });
  currentScope.current = { workspaceKey, activeTabId };
  const [originDraft] = useState(() => {
    const { activeTaskId, draftFocusVersion, draftProjectId } = useZCodeSessionStore
      .getState()
      .getWorkspaceState(workspacePath, workspaceIdentity);
    return { workspaceKey, activeTaskId, draftFocusVersion, draftProjectId };
  });
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const saved = async (project: VirtualProject) => {
    if (!active.current) return;
    await onSaved();
    const draft = useZCodeSessionStore
      .getState()
      .getWorkspaceState(workspacePath, workspaceIdentity);
    // 创建原来只刷新列表，草稿仍绑定旧项目；复用项目选择入口，并拒绝保存期间已失效的草稿。
    if (
      active.current &&
      currentScope.current.activeTabId === originTabId.current &&
      currentScope.current.workspaceKey === originDraft.workspaceKey &&
      !originDraft.activeTaskId &&
      !draft.activeTaskId &&
      draft.draftFocusVersion === originDraft.draftFocusVersion &&
      draft.draftProjectId === originDraft.draftProjectId
    ) {
      onCreateTask({
        projectId: project.id,
        taskGroupId: draft.draftTaskGroupId ?? null,
        initialComposerDraft: captureV4ComposerDraftHandoff(
          workspacePath,
          workspaceIdentity,
          composerClientNamespace,
        ),
      });
    }
  };
  return (
    <ProjectEditor
      project={null}
      projects={projects}
      service={service}
      onClose={onClose}
      onSaved={saved}
    />
  );
}
