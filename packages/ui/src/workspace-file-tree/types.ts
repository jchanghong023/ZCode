import type { Dispatch, SetStateAction } from "react";
import type { WorkspaceFileEntry } from "@zcode/shared";
import type { CodeViewerSource } from "@/lib/codeViewer.js";
import type { WorkspaceFileGitStatus, WorkspaceFileTreeRow } from "@/workspace-file-tree/model.js";

export interface WorkspaceFileTreeProps {
  data: WorkspaceFileTreeData;
  searchIndex: WorkspaceFileSearchIndex;
  workspacePath: string;
  workspaceName?: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
  revealPath?: string;
  temporaryExternalDirectory?: boolean;
  activePreviewPath?: string | null;
  onClose?: () => void;
  onOpenPreview?: (source: CodeViewerSource) => void;
}

export interface WorkspaceFileTreeData {
  rows: WorkspaceFileTreeRow[];
  loadedDirectoryPaths: Set<string>;
  loadingDirectoryPaths: Set<string>;
  errorByDirectory: Map<string, Error>;
  gitStatusByPath: Map<string, WorkspaceFileGitStatus>;
  gitStatusAvailable: boolean;
  ignoredPathSet: Set<string>;
  refreshingLoadedDirectories: boolean;
  setExpandedPaths: Dispatch<SetStateAction<Set<string>>>;
  loadDirectory: (path: string, depth: number) => Promise<unknown>;
  refreshLoadedDirectories: () => void | Promise<unknown>;
}

export interface WorkspaceFileSearchIndex {
  entries: WorkspaceFileEntry[];
  loading: boolean;
  loaded: boolean;
  error: Error | null;
  refresh: () => void;
}

export interface WorkspaceFileTreeStickyFolderItem {
  row: WorkspaceFileTreeRow;
  index: number;
}

export interface WorkspaceFileTreeContextMenuLabels {
  addToChat: string;
  copyAbsolutePath: string;
  copyRelativePath: string;
  open: string;
}

export interface WorkspaceFileTreeEditorState {
  workspaceRemoteSessionId?: string;
}

export type WorkspaceFileGitStatusLabels = Record<WorkspaceFileGitStatus, string>;
