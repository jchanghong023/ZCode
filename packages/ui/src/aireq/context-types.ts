import type {
  AIReqAction,
  AIReqMainView,
  AIReqNativeSessionRef,
  AIReqWorkflowResult,
  AIReqSelection,
  AIReqWorkflowView,
} from "./contract.js";

export interface AIReqContextValue {
  view?: AIReqWorkflowView;
  selection: AIReqSelection;
  session?: AIReqNativeSessionRef;
  mainView: AIReqMainView;
  settingsOpen: boolean;
  openSettings(): void;
  closeSettings(): void;
  setMainView(value: AIReqMainView): void;
  pending: boolean;
  selectionReady: boolean;
  error?: string;
  linkError?: string;
  clearLinkError(): void;
  switchProject(projectId: string): void;
  openProject(projectId: string, releaseId?: string): void;
  select(value: AIReqSelection): void;
  refresh(throwOnError?: boolean): Promise<void>;
  refreshProjects(throwOnError?: boolean): Promise<void>;
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
