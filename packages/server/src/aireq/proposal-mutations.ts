import type { AIReqCommand, AIReqOperationReceipt } from "@zcode/services/aireq";
import type { WorkflowState } from "./workflow-state.js";

/** Mutates only the transaction supplied by the unique workflow owner. */
export function applyProposalMutation(
  state: WorkflowState,
  action: Extract<
    AIReqCommand,
    {
      type: "addProjectRoleMember" | "removeProjectRoleMember" | "saveDocumentFormats";
    }
  >,
  projectId: string,
  operation: AIReqOperationReceipt,
): void {
  switch (action.type) {
    case "addProjectRoleMember":
      state.projectRoleMembers.push({
        projectId,
        employeeId: action.employeeId,
        role: action.role,
      });
      break;
    case "removeProjectRoleMember":
      state.projectRoleMembers = state.projectRoleMembers.filter(
        (entry) =>
          entry.projectId !== projectId ||
          entry.employeeId !== action.employeeId ||
          entry.role !== action.role,
      );
      break;
    case "saveDocumentFormats":
      state.documentFormats = Object.fromEntries(
        Object.entries(action.documentFormats).map(([name, sections]) => [
          name,
          sections.map((section) => section.trim()),
        ]),
      ) as typeof action.documentFormats;
      operation.type = "保存文档格式";
      break;
  }
}
