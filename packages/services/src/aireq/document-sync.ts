import type { AIReqDocumentConfirmation, AIReqFileVersion } from "./types.js";

export const AIREQ_SYNC_SCRIPT_ROOT = "/aireq-sync";
export const AIREQ_CONFIRMED_DOCUMENTS_PATH = "/api/aireq/confirmed-documents";

export interface AIReqDocumentSyncTarget {
  projectId: string;
  releaseId: string;
  irId: string;
}

export interface AIReqConfirmedDocumentBundle extends AIReqDocumentSyncTarget {
  repositoryUrl: string;
  version: number;
  confirmation: AIReqDocumentConfirmation;
  srIds: string[];
  files: (AIReqFileVersion & { content: string })[];
}
