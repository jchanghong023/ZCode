import type { ProposalTask } from "./proposals/proposalTasks.js";
import type { RequirementReturnView } from "./navigationState.js";
import type { AIReqMainView as WorkspaceMainView } from "./contract.js";
import type {
  AIReqAction,
  AIReqMaterialReadRequest,
  AIReqNativeSessionRef,
  AIReqSelection,
  AIReqWorkflowResult,
  AIReqWorkflowView,
} from "./contract.js";

export type ProposalDraft = { id: string; sourceIrId?: string };
export type RequirementView = "proposals" | "formal";

export interface AIReqContextValue {
  view?: AIReqWorkflowView;
  selection: AIReqSelection;
  session?: AIReqNativeSessionRef;
  mainView: WorkspaceMainView;
  requirementView: RequirementView;
  requirementReturnView: RequirementReturnView;
  proposalTask: ProposalTask;
  openProposalTask(task: ProposalTask, agent?: import("./contract.js").AIReqReviewAgentId): void;
  settingsOpen: boolean;
  openSettings(): void;
  closeSettings(): void;
  setMainView(value: WorkspaceMainView, options?: { fromSidebar?: boolean }): void;
  openFromProjectOverview(
    mainView: "proposals" | "formal" | "chat" | "todos" | "requirementAnalysis",
    target?: AIReqSelection,
    releaseId?: string,
  ): void;
  canReturnToProjectOverview: boolean;
  returnToProjectOverview(): void;
  startProposalDraft(sourceIrId?: string): void;
  startProposalImport(): void;
  proposalDraft: ProposalDraft | null;
  proposalImportOpen: boolean;
  closeProposalDraft(): void;
  pending: boolean;
  selectionReady: boolean;
  error?: string;
  linkError?: string;
  clearLinkError(): void;
  releaseId: string;
  setReleaseId(id: string, options?: { inProposalDialog?: boolean }): void;
  switchProject(projectId: string): void;
  openProject(
    projectId: string,
    mainView?: "projectOverview" | "proposals" | "formal",
    releaseId?: string,
  ): void;
  select(value: AIReqSelection, releaseId?: string, task?: ProposalTask): void;
  openAnalysis(value: AIReqSelection, releaseId?: string): void;
  objectLink(): string | undefined;
  refresh(): Promise<void>;
  retryMaterial(request: AIReqMaterialReadRequest): Promise<boolean>;
  retrySession(
    target: AIReqSelection,
    sessionId: string,
    isCurrentPane: () => boolean,
  ): Promise<void>;
  command(value: AIReqAction): Promise<AIReqWorkflowResult | undefined>;
  setDraftNavigationGuard(guard: ((navigate: () => void) => void) | null, ownerId?: string): void;
  setNavigationGuard(guard: ((navigate: () => void) => void) | null): void;
  navigate(action: () => void): void;
  report(error: unknown): void;
}
