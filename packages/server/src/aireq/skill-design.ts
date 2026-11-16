import { createHash } from "node:crypto";
import { currentIdentity } from "./identity.js";
import type {
  AIReqSkillDesignDraft,
  AIReqSkillDesignPreview,
  AIReqAgentModelBinding,
} from "@zcode/services/aireq";
import { readPrototypeAgentModelBinding } from "./agent-models.js";
const promptTemplate =
  "请根据以下说明与我一起设计可复用技能。请由模型推荐技能标识，不要要求我先填写名称。信息不足时先澄清，不要把表单直接拼成技能文件。\n\n要解决什么任务：{{goal}}\n\n什么时候使用：{{when}}\n\n需要哪些输入：{{inputs}}\n\n期望结果与成功标准：{{outputs}}\n\n边界与不适用场景：{{boundaries}}\n\n流程、规则或参考资料：{{references}}\n\n真实例子或失败情况：{{example}}\n\n已发送的补充讨论：{{notes}}\n\n临时技能目录：{{directory}}\n主文件路径：{{directory}}/SKILL.md\n\n请先分析上述内容，必要时与我讨论，再推荐合适的技能标识，将 SKILL.md 和必要的参考资料、脚本写入此临时目录。回复推荐标识及实际文件清单和路径，供我预览、继续讨论修改。\n\n当前是 AIReq 共享模拟环境，所有合法工号均可设计技能并配置共享模型与追加提示词；配置归属仅为来源标识，不是权限角色。设计入口位于主导航。生成阶段仅模拟上述临时目录和文件，不执行真实模型、工具或文件写入。只有我预览全部文件、选择目标并明确确认后，才能模拟保存整份技能到有效项目 .omp/skills/<推荐标识>/ 或共享模拟 profile 的 skills/<推荐标识>/；profile 目标无需绑定项目。目标展示模拟归属，不冒充访问者个人后端，不覆盖同名技能，不恢复技能目录管理。切换模型及往返设置保留原生会话、未发送正文和附件；丢弃离开只放弃本版确认保存，不删除预览或冒充已保存。\n";
const generatedSample =
  "---\nname: review-api-changes\ndescription: 用户请求评审 API 变更、接口 PR 或检查向后兼容性时使用。\n---\n\n# 接口变更评审\n\n## 工作方式\n先读取项目接口规范、当前 diff、接口定义及相关测试，再核对受影响调用方。不要假定没有提供的客户端行为；缺少关键材料时先向用户索取。\n\n1. 确认变更涉及接口契约；纯排版修改说明不适用。\n2. 按 references/checklist.md 检查请求、响应和错误处理的兼容性。\n3. 对每项问题列出文件位置、影响、证据与兼容过渡建议。\n4. 将已确认问题和待核实项分开；不修改代码，不宣称未运行的测试通过。\n\n## 输出\n按严重程度报告问题；没有足够证据时明确说明缺口，不编造调用方或测试结果。\n";
const checklistSample =
  "# 接口兼容性检查清单\n\n- 删除或收紧响应字段时，是否有受影响调用方的证据？\n- 请求字段、默认值、错误码及分页语义是否改变？\n- 相关测试是否覆盖旧客户端行为？没有执行时明确标为未验证。\n- 缺少输入时先列缺口；不要编造兼容结论。\n";
import { PROTOTYPE_BACKEND } from "./backend.js";
import { readPrototypeDevelopmentRoot } from "./project-settings.js";
import { savePrototypeDesignedSkill } from "./skills.js";
const chatTemplate =
  "建议技能标识：`{{name}}`。临时文件位于：\n\n- `{{directory}}/SKILL.md`\n- `{{directory}}/references/checklist.md`\n\n请在“临时文件预览”中逐个核对。需要调整时，继续补充要求并发送；确认内容后，选择项目或共享技能目录保存。\n";
const discussionTemplate =
  "我们先明确技能要解决的任务、使用场景、输入及期望结果。\n\n你可以直接补充这些信息，也可以在左侧填写后点击“填入聊天输入框”，核对内容并发送。\n";
import { createPrototypeEvent } from "./events.js";

const emptyDraft: AIReqSkillDesignDraft = {
  goal: "",
  when: "",
  inputs: "",
  outputs: "",
  boundaries: "",
  references: "",
  example: "",
  notes: [],
};
export const PROTOTYPE_SKILL_DESIGN_SAMPLE: AIReqSkillDesignDraft = {
  goal: "评审接口变更，识别向后兼容性问题",
  when: "用户请求评审 API 变更、接口 PR，或检查向后兼容性时使用。",
  inputs: "当前 Git diff、接口定义、受影响调用方及相关测试。",
  outputs: "按严重程度列出问题，包含文件和行号、影响、依据与修改建议；区分已确认问题和待核实项。",
  boundaries: "只分析，不修改代码。纯文档排版不触发；缺少接口变更时说明不适用。",
  references:
    "先阅读项目现有接口规范，核对请求、响应、错误码及相关测试，不假定未提供的客户端行为。",
  example:
    "输入：删除响应中的必填字段。期望：指出受影响调用方，并提出兼容过渡建议；没有证据时列为待核实。",
  notes: [],
};
const modelBindings = new Map<string, AIReqAgentModelBinding>();
export function prototypeSkillDesignBinding(sessionId: string): AIReqAgentModelBinding {
  assertSkillSession(sessionId);
  let binding = modelBindings.get(sessionId);
  if (!binding) {
    binding = readPrototypeAgentModelBinding("skill-design");
    modelBindings.set(sessionId, binding);
  }
  return structuredClone(binding);
}
const drafts = new Map<string, AIReqSkillDesignDraft>();
const supplements = createPrototypeEvent<string>();
export const onPrototypeSkillDesignSupplement = supplements.event;
const scopes = new Map<string, { projectId: string; employeeId: string; clientId: string }>();
export function prototypeSkillDesignSession(projectId: string): string {
  const identity = currentIdentity();
  if (!identity) throw new Error("INVALID_IDENTITY");
  if (projectId && projectId !== "personal" && !readPrototypeDevelopmentRoot(projectId))
    throw new Error("项目不存在。");
  const id = `prototype-skill-design:${PROTOTYPE_BACKEND.id}:${createHash("sha256")
    .update(JSON.stringify([identity.employeeId, identity.clientId, projectId]))
    .digest("hex")}`;
  scopes.set(id, { projectId, employeeId: identity.employeeId, clientId: identity.clientId });
  prototypeSkillDesignBinding(id);
  return id;
}
export function assertSkillSession(sessionId: string): string {
  const scope = scopes.get(sessionId);
  const identity = currentIdentity();
  if (
    !scope ||
    !identity ||
    scope.employeeId !== identity.employeeId ||
    scope.clientId !== identity.clientId
  )
    throw new Error("技能设计会话不属于当前工号和客户端。");
  return scope.projectId;
}
export function readPrototypeSkillDesign(sessionId: string): AIReqSkillDesignDraft {
  return structuredClone(drafts.get(sessionId) ?? emptyDraft);
}
function validateDraft(value: AIReqSkillDesignDraft): void {
  if (
    !value ||
    ["goal", "when", "inputs", "outputs", "boundaries", "references", "example"].some(
      (key) => typeof value[key as keyof AIReqSkillDesignDraft] !== "string",
    ) ||
    !Array.isArray(value.notes) ||
    value.notes.some((note) => typeof note !== "string")
  )
    throw new Error("技能设计说明参数无效。");
}
export function savePrototypeSkillDesignDraft(
  sessionId: string,
  value: AIReqSkillDesignDraft,
): void {
  assertSkillSession(sessionId);
  validateDraft(value);
  drafts.set(sessionId, structuredClone(value));
}
const previews = new Map<string, AIReqSkillDesignPreview>();
export function prototypeSkillDesignDirectory(sessionId: string): string {
  const prefix = `prototype-skill-design:${PROTOTYPE_BACKEND.id}:`;
  const projectKey = sessionId.startsWith(prefix) ? sessionId.slice(prefix.length) : sessionId;
  return `/tmp/omp-aireq/skill-design/${PROTOTYPE_BACKEND.id}/${encodeURIComponent(projectKey)}`;
}
export function preparePrototypeSkillDesignPrompt(
  sessionId: string,
  draft: AIReqSkillDesignDraft,
): string {
  validateDraft(draft);
  const values: Record<string, string> = {
    ...draft,
    notes: draft.notes.join("\n\n"),
    directory: prototypeSkillDesignDirectory(sessionId),
  };
  return promptTemplate.replace(
    /\{\{(\w+)\}\}/g,
    (_match, key: string) => values[key] || "（未填写）",
  );
}
export function readPrototypeSkillDesignPreview(
  sessionId: string,
): AIReqSkillDesignPreview | undefined {
  const preview = previews.get(sessionId);
  return preview ? structuredClone(preview) : undefined;
}
export function prototypeSkillDesignReply(sessionId: string, message: string): string {
  const draft = readPrototypeSkillDesign(sessionId);
  const directory = prototypeSkillDesignDirectory(sessionId);
  // 完整表单消息已在会话历史中保留，避免再次填入时递归嵌套此前整份提示词。
  if (!message.includes(directory)) draft.notes.push(message);
  savePrototypeSkillDesignDraft(sessionId, draft);
  const previous = previews.get(sessionId);
  if (!message.includes(directory) && !previous) {
    supplements.fire(sessionId);
    return discussionTemplate;
  }
  // 原型固定产物自行提供推荐标识，不从用户填写的字段生成名称。
  const name = generatedSample.match(/^name: (.+)$/m)![1]!.trim();
  previews.set(sessionId, {
    name,
    directory,
    revision: (previous?.revision ?? 0) + 1,
    files: [
      {
        path: "SKILL.md",
        content: generatedSample.replace("name: review-api-changes", `name: ${name}`),
      },
      { path: "references/checklist.md", content: checklistSample },
    ],
  });
  supplements.fire(sessionId);
  return chatTemplate.replaceAll("{{directory}}", directory).replaceAll("{{name}}", name);
}
const saves = new Map<
  string,
  { digest: string; receipt: import("@zcode/services/aireq").AIReqSkillSaveReceipt }
>();
export function savePrototypeSkillDesignPreview(
  sessionId: string,
  workspacePath: string,
  name: string,
  target: "project" | "user",
  expectedPreviewRevision: number,
  operationId: string,
): import("@zcode/services/aireq").AIReqSkillSaveReceipt {
  if (!operationId?.trim()) throw new Error("保存操作编号缺失。");
  const digest = JSON.stringify([sessionId, workspacePath, name, target, expectedPreviewRevision]);
  const prior = saves.get(operationId);
  if (prior) {
    if (prior.digest !== digest) throw new Error("操作编号已用于另一保存请求。");
    return structuredClone(prior.receipt);
  }
  const preview = previews.get(sessionId);
  if (!preview) throw new Error("请先发送设计需求，并预览生成的临时文件。");
  if (preview.revision !== expectedPreviewRevision)
    throw new Error("临时文件版本已变化，请重新预览并确认。");
  const prefix = `prototype-skill-design:${PROTOTYPE_BACKEND.id}:`;
  if (!sessionId.startsWith(prefix)) throw new Error("技能设计会话归属不正确。");
  const projectId = assertSkillSession(sessionId);
  if (!["project", "user"].includes(target)) throw new Error("保存目标无效。");
  if (
    target === "project" &&
    (!workspacePath || readPrototypeDevelopmentRoot(projectId) !== workspacePath)
  )
    throw new Error("请选择有效项目，或保存到共享模拟配置技能目录。");
  if (name !== preview.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64)
    throw new Error("请通过对话调整模型推荐的技能标识。");
  if (
    !preview.files.some((file) => file.path === "SKILL.md") ||
    preview.files.some(
      (file) =>
        !file.path ||
        file.path.startsWith("/") ||
        file.path.includes("\\") ||
        file.path.split("/").includes(".."),
    )
  )
    throw new Error("临时文件路径无效。");
  const path = savePrototypeDesignedSkill(
    target === "user" ? PROTOTYPE_BACKEND.userSkillsDirectory : workspacePath,
    name,
    "接口变更评审：检查接口契约的向后兼容性",
    preview.files.find((file) => file.path === "SKILL.md")!.content,
    preview.files,
    target === "user" ? "user" : "workspace",
  );
  const receipt = { operationId, path, revision: preview.revision, target, name };
  preview.savedReceipt = receipt;
  saves.set(operationId, { digest, receipt });
  supplements.fire(sessionId);
  return structuredClone(receipt);
}
