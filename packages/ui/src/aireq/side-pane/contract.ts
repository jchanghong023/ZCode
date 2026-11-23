import type { AIReqWorkflowTarget } from "../contract.js";

export interface AIReqSidePaneRequest {
  selection: AIReqWorkflowTarget;
  releaseId: string;
  title: string;
}
export interface AIReqSidePaneTab extends AIReqSidePaneRequest {
  id: string;
  openSequence: number;
}
export interface AIReqSidePaneController {
  tabs: AIReqSidePaneTab[];
  activeTab?: AIReqSidePaneTab;
  isOpen: boolean;
  fullView: boolean;
  recentClosed: AIReqSidePaneTab[];
  open(target: AIReqSidePaneRequest): void;
  activate(id: string): void;
  close(id: string, options?: { others?: boolean }): void;
  closeAll(): void;
  restore(id: string): void;
  reorder(from: string, to: string): void;
  expand(): void;
  collapse(): void;
  toggleFullView(): void;
}
