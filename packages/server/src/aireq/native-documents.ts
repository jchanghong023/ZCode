import type { AIReqDiscussionAgent, AIReqMaterialView } from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import { requirementMaterialsFor } from "./document-versions.js";
import { systemRequirement } from "./fixture-builders.js";
import {
  appendMaterialDiscussion,
  materialStatements,
  prototypeMaterial,
  reviseGeneratedMarkdown,
  solutionMaterials,
} from "./materials.js";
import { prototypeProposalDependencies } from "./proposal-flow.js";
import type { NativeDocumentOutput, RequirementGroup, WorkflowState } from "./workflow-state.js";

/** 内存原型只根据明确的编辑意图或提供的正文生成文档。 */
export function stageNativeDocuments(
  state: WorkflowState,
  requirement: RequirementGroup,
  agent: AIReqDiscussionAgent,
  text: string,
): NativeDocumentOutput | undefined {
  const current = requirementMaterialsFor(state, requirement);
  const deletePath = /^(?:请)?删除(?:文件|文档)?\s*[`“"]?([^\s`”"。]+)[`”"。]?$/u.exec(text)?.[1];
  if (deletePath) {
    const file = current.find((item) => item.path === deletePath);
    if (!file || (file.kind === "ir") !== (agent === "requirements"))
      throw businessRule("请指定当前 Agent 可修改的文档路径。");
    return { agent, materials: [], removedPaths: [deletePath] };
  }

  const structured = /^ {0,3}(?:#{1,6}[ \t]|```|~~~)/m.test(text);
  const dependencyInput = agent === "solution" && text.startsWith("{");
  const edit =
    /^(?:(?:请|帮我|麻烦|需要你|把|将|用|针对|根据|基于|重新|继续|再|可以请你)[^！？?\n]*?)?(?:生成|整理|补充|补齐|调整|撰写|修复|更新|完善|新增|修改|改为|改成|追加|写入|重写|起草|编写|拆分|拆成|删除|移除)/u;
  if (!structured && !dependencyInput && !edit.test(text)) return;

  const { projectId, id: irId } = requirement;
  if (agent === "requirements") {
    const prior = current.find((item) => item.path === requirement.documentPath);
    const content = reviseGeneratedMarkdown(
      prior?.content ?? `# ${requirement.title}\n\n## 目标与范围\n\n${requirement.originalText}`,
      text,
      "补充业务规则",
    );
    return {
      agent,
      materials: [
        prototypeMaterial({ projectId, irId, path: requirement.documentPath, kind: "ir", content }),
      ],
    };
  }

  const existingRows = state.srs.filter((row) => row.projectId === projectId && row.irId === irId);
  const rows = existingRows.length
    ? existingRows
    : ["业务操作与结果展示", "异常处理与恢复"].map((title, index) =>
        systemRequirement(
          projectId,
          irId,
          `sr-${irId}-${index + 1}`,
          `${requirement.title} · ${title}`,
        ),
      );
  const materials: AIReqMaterialView[] = [];
  // 已删除的方案文件和依赖清单都可以通过显式补齐意图重建。
  const recreate = /(?:生成|补齐|重写|起草|新增|编写)/u.test(text);
  if (!dependencyInput) {
    const statements = structured ? [] : materialStatements(text);
    const candidates = solutionMaterials(projectId, irId, rows);
    for (const file of candidates) {
      const prior = current.find((item) => item.path === file.path);
      if (!prior && existingRows.length && !recreate) continue;
      const testPlan = file.kind === "test-plan";
      const details = testPlan
        ? statements.filter((line) => /测试|验证|验收|回归/u.test(line))
        : statements;
      const material = prior ?? file;
      materials.push(
        prototypeMaterial({
          ...material,
          content: appendMaterialDiscussion(
            material.content,
            structured ? text : details.join("\n"),
            testPlan ? "已提出的测试场景" : "补充实施说明",
          ),
        }),
      );
    }
  }
  if (
    dependencyInput ||
    ((!existingRows.length || recreate) &&
      !current.some((file) => file.path.endsWith("/sr-dependencies.json")))
  )
    materials.push(
      prototypeProposalDependencies(requirement, rows, dependencyInput ? text : undefined),
    );
  return { agent, materials, srs: rows };
}
