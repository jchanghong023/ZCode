import type {
  AIReqAction,
  AIReqMainView,
  AIReqNativeSessionRef,
  AIReqWorkflowResult,
  AIReqWorkflowTarget,
  AIReqWorkflowView,
} from "./contract.js";
import type { ProposalDraft } from "./navigationState.js";

export interface AIReqContextValue {
  view?: AIReqWorkflowView;
  selection: AIReqWorkflowTarget;
  session?: AIReqNativeSessionRef;
  mainView: AIReqMainView;
  settingsOpen: boolean;
  openSettings(): void;
  closeSettings(): void;
  setMainView(value: AIReqMainView, options?: { fromSidebar?: boolean }): void;
  openRequirementsFromOverview(): void;
  canReturnToProjectOverview: boolean;
  returnToProjectOverview(): void;
  startProposalDraft(): void;
  startProposalImport(): void;
  proposalDraft: ProposalDraft | null;
  proposalImportOpen: boolean;
  closeProposalDraft(): void;
  completeProposalDraft(releaseId: string): void;
  pending: boolean;
  selectionReady: boolean;
  error?: string;
  linkError?: string;
  clearLinkError(): void;
  releaseId: string;
  setReleaseId(id: string): void;
  switchProject(projectId: string): void;
  openProject(
    projectId: string,
    mainView?: "projectOverview" | "proposals",
    releaseId?: string,
  ): void;
  select(value: AIReqWorkflowTarget, releaseId?: string): void;
  refresh(): Promise<void>;
  retrySession(
    target: AIReqWorkflowTarget,
    sessionId: string,
    isCurrentPane: () => boolean,
  ): Promise<void>;
  command(value: AIReqAction): Promise<AIReqWorkflowResult | undefined>;
  setDraftNavigationGuard(guard: ((navigate: () => void) => void) | null, ownerId?: string): void;
  setNavigationGuard(guard: ((navigate: () => void) => void) | null): void;
  navigate(action: () => void): void;
  report(error: unknown): void;
}
