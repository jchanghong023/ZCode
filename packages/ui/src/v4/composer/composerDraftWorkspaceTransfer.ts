import type { ChatComposerAttachment } from "@/lib/chatAttachments.js";
import { type V4ComposerDraft } from "@/v4/composer/composerDraftStore.js";

export interface ComposerDraftHandoff {
  sourceWorkspaceKey: string;
  draft: Omit<V4ComposerDraft, "updatedAt">;
  attachments: readonly ChatComposerAttachment[];
}

type DraftReader = () => Omit<ComposerDraftHandoff, "sourceWorkspaceKey">;
const draftReaders = new Map<string, DraftReader>();
const incomingAttachments = new Map<
  string,
  { draftFocusVersion: number; attachments: readonly ChatComposerAttachment[] }
>();

/** 读取编辑器当前值，避免把尚未到持久化时点的文字丢在旧工作区。 */
export function registerV4ComposerDraftReader(workspaceKey: string, read: DraftReader): () => void {
  draftReaders.set(workspaceKey, read);
  return () => {
    if (draftReaders.get(workspaceKey) === read) draftReaders.delete(workspaceKey);
  };
}

export function consumeV4ComposerDraftAttachments(
  workspaceKey: string,
  draftFocusVersion: number,
): readonly ChatComposerAttachment[] | null {
  const pending = incomingAttachments.get(workspaceKey);
  incomingAttachments.delete(workspaceKey);
  // 目标草稿若已换代，晚挂载的输入区不能接收旧命令。
  return pending?.draftFocusVersion === draftFocusVersion ? pending.attachments : null;
}

interface ComposerDraftWorkspaceTransferRequest {
  sourceWorkspacePath: string;
  sourceWorkspaceIdentity?: string;
  targetWorkspacePath: string;
  targetWorkspaceIdentity?: string;
}

let pendingRequest: ComposerDraftWorkspaceTransferRequest | null = null;

function getWorkspaceKey(path: string, identity?: string): string {
  return identity?.trim() || path;
}

export function consumeV4ComposerDraftWorkspaceTransferRequest(
  transition: ComposerDraftWorkspaceTransferRequest,
): boolean {
  if (!pendingRequest) {
    return false;
  }
  const matches =
    getWorkspaceKey(pendingRequest.sourceWorkspacePath, pendingRequest.sourceWorkspaceIdentity) ===
      getWorkspaceKey(transition.sourceWorkspacePath, transition.sourceWorkspaceIdentity) &&
    getWorkspaceKey(pendingRequest.targetWorkspacePath, pendingRequest.targetWorkspaceIdentity) ===
      getWorkspaceKey(transition.targetWorkspacePath, transition.targetWorkspaceIdentity);
  if (matches) {
    pendingRequest = null;
  }
  return matches;
}

