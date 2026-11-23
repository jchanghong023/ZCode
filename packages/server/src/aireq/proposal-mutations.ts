import type { AIReqCommand } from "@zcode/services/aireq";
import type { Receipt, RequirementGroup, WorkflowState } from "./workflow-state.js";
import { group } from "./fixture-builders.js";
import { getEmployeeId } from "./identity.js";
import { businessRule } from "./errors.js";
import { readPrototypeProjectReleases, addPrototypeRelease } from "./project-releases.js";
import { prototypeMaterial } from "./materials.js";
import { saveDocumentChanges } from "./document-versions.js";

function createProposal(
  state: WorkflowState,
  projectId: string,
  releaseId: string,
  text: string,
  operation: Receipt,
  suffix = "",
): RequirementGroup {
  const proposal = group(
    projectId,
    `ir-demo-${state.revision}${suffix}`,
    releaseId,
    text,
    getEmployeeId(),
  );
  proposal.createdAt = operation.startedAt;
  proposal.origin = suffix ? "import" : "browser";
  state.requirements.push(proposal);
  return proposal;
}

/** Mutates only the transaction supplied by the unique workflow owner. */
export function applyProposalMutation(
  state: WorkflowState,
  action: Exclude<AIReqCommand, { type: "reviewDocuments" | "confirmDocumentVersion" }>,
  projectId: string,
  irId: string | undefined,
  operation: Receipt,
): string | undefined {
  const at = operation.startedAt;
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
    case "importIdeas": {
      if (!action.originalTexts.length || action.originalTexts.some((text) => !text.trim()))
        throw businessRule("导入正文无效，本批未写入任何想法。");
      // 先校验整批，再由 workflow 同一克隆事务写入；不借用项目或生成提案会话。
      state.ideas.push(
        ...action.originalTexts.map((text, index) => ({
          id: `idea-${state.revision}-${index + 1}`,
          originalText: text.trim(),
          submittedBy: getEmployeeId(),
          createdAt: operation.startedAt,
          revision: 1,
        })),
      );
      operation.type = "批量导入想法";
      break;
    }
    case "createIdea": {
      if (!action.originalText.trim()) throw businessRule("请输入原始需求。");
      state.ideas.push({
        id: `idea-${state.revision}`,
        originalText: action.originalText.trim(),
        submittedBy: getEmployeeId(),
        createdAt: operation.startedAt,
        revision: 1,
      });
      operation.type = "新增想法";
      break;
    }
    case "updateIdea":
    case "transferIdea": {
      const idea = state.ideas.find((item) => item.id === action.ideaId);
      if (!idea) throw businessRule("想法已转入版本或不存在，请刷新想法池。");
      if (idea.revision !== action.ideaRevision)
        throw businessRule("想法内容已变化，请关闭表单并重新打开最新内容。");
      if (action.type === "updateIdea") {
        if (!action.originalText.trim()) throw businessRule("请输入原始需求。");
        idea.originalText = action.originalText.trim();
        idea.revision += 1;
        operation.type = "修改想法";
        break;
      }
      const targets = new Set<string>();
      if (!action.targets.length) throw businessRule("请至少选择一个项目和版本。");
      for (const target of action.targets) {
        if (
          !state.projects.some((item) => item.id === target.projectId) ||
          !readPrototypeProjectReleases(target.projectId).some(
            (item) => item.id === target.releaseId,
          )
        )
          throw businessRule("目标项目或版本不存在，请重新选择。");
        const key = JSON.stringify([target.projectId, target.releaseId]);
        if (targets.has(key)) throw businessRule("不能重复选择同一项目和版本。");
        targets.add(key);
      }
      // 全部目标先验证，再在 workflow 的同一克隆事务内创建和消费；失败不可留下部分提案。
      operation.irIds = action.targets.map((target, index) => {
        const item = createProposal(
          state,
          target.projectId,
          target.releaseId,
          idea.originalText,
          operation,
          `-idea-${index + 1}`,
        );
        item.submittedBy = idea.submittedBy;
        item.createdAt = idea.createdAt;
        item.origin = "browser";
        return item.id;
      });
      state.ideas = state.ideas.filter((item) => item.id !== idea.id);
      operation.type = "想法转入版本";
      break;
    }
    case "saveDocumentFormats":
      state.documentFormats = Object.fromEntries(
        Object.entries(action.documentFormats).map(([name, sections]) => [
          name,
          sections.map((section) => section.trim()),
        ]),
      ) as typeof action.documentFormats;
      operation.type = "保存文档格式";
      break;
    case "createRelease":
      addPrototypeRelease({
        id: `demo-release-${state.revision}`,
        projectId,
        title: action.title.trim(),
        createdAt: at,
      });
      break;
    case "createProposal": {
      const existing = action.clientDraftId
        ? state.requirements.find(
            (item) =>
              item.clientDraftId === action.clientDraftId &&
              item.projectId === projectId &&
              item.releaseId === action.releaseId &&
              item.submittedBy === getEmployeeId(),
          )
        : undefined;
      const item =
        existing ??
        createProposal(state, projectId, action.releaseId, action.originalText.trim(), operation);
      item.clientDraftId = action.clientDraftId;
      irId = item.id;
      operation.irId = irId;
      break;
    }
    case "importProposals":
      // 整批共用一个回执与幂等身份，新 IR 关联不借用导入前的查看目标。
      operation.irIds = [];
      action.proposals.forEach((entry, index) => {
        const item = createProposal(
          state,
          projectId,
          action.releaseId,
          entry.originalText.trim(),
          operation,
          `-${index + 1}`,
        );
        operation.irIds!.push(item.id);
        if (entry.businessDocument !== undefined) {
          saveDocumentChanges(state, item, {
            agent: "requirements",
            materials: [
              prototypeMaterial({
                projectId,
                irId: item.id,
                path: item.documentPath,
                kind: "ir",
                content: entry.businessDocument,
              }),
            ],
          });
        }
      });
      operation.type = "批量导入需求";
      break;
    case "deleteRequirement":
      state.requirements = state.requirements.filter(
        (item) => item.id !== irId || item.projectId !== projectId,
      );
      state.srs = state.srs.filter((item) => item.irId !== irId || item.projectId !== projectId);
      state.materials = state.materials.filter(
        (item) => item.irId !== irId || item.projectId !== projectId,
      );
      break;
  }
  return irId;
}
