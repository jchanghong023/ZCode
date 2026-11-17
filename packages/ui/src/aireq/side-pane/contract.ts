import type { AIReqSelection } from "../contract.js";

export type AIReqSidePaneKind = "launcher" | "report" | "materials" | "history" | "analysis";
export interface AIReqSidePaneRequest {
  kind: AIReqSidePaneKind;
  selection: AIReqSelection;
  releaseId: string;
  title: string;
  runId?: string;
}
export interface AIReqSidePaneTab extends AIReqSidePaneRequest {
  id: string;
}
export type AIReqSidePaneGuard = ((next: () => void) => void) | null;
export interface AIReqSidePaneController {
  tabs: AIReqSidePaneTab[];
  activeTab?: AIReqSidePaneTab;
  isOpen: boolean;
  fullView: boolean;
  recentClosed: AIReqSidePaneTab[];
  open(target: AIReqSidePaneRequest, options?: { ifAbsent?: boolean }): void;
  updateTab(id: string, selection: AIReqSelection, releaseId?: string): void;
  activate(id: string): void;
  close(id: string, options?: { others?: boolean }): void;
  closeAll(): void;
  newTab(): void;
  restore(id: string): void;
  reorder(from: string, to: string): void;
  toggle(): void;
  collapse(): void;
  toggleFullView(): void;
  registerGuard(id: string, guard: AIReqSidePaneGuard): void;
}
