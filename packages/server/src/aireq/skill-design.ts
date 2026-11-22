import { digestValue } from "./content-digest.js";
import { businessRule } from "./errors.js";
import { createHash } from "node:crypto";
import { currentIdentity } from "./identity.js";
import type {
  AIReqSkillDesignDraft,
  AIReqSkillDesignPreview,
  AIReqAgentModelBinding,
} from "@zcode/services/aireq";
import { readPrototypeWorkflowDefaultModel } from "./agent-models.js";
const promptTemplate =
  "请根据以下说明与我一起设计可复用技能。请推荐技能标识，不要要求我先填写名称。信息不足时先澄清，不要把表单直接拼成技能文件。\n\n要解决什么任务：{{goal}}\n\n什么时候使用：{{when}}\n\n需要哪些输入：{{inputs}}\n\n期望结果与成功标准：{{outputs}}\n\n边界与不适用场景：{{boundaries}}\n\n流程、规则或参考资料：{{references}}\n\n真实例子或失败情况：{{example}}\n\n已发送的补充讨论：{{notes}}\n\n临时技能目录：{{directory}}\n主文件路径：{{directory}}/SKILL.md\n\n请先核对上述内容，必要时与我讨论，再推荐合适的技能标识，准备 SKILL.md 和必要的参考资料、脚本内容，并按此目录组织预览路径。回复推荐标识、文件清单及对应预览路径，供我预览、继续讨论修改。\n\n请明确区分建议、待确认内容与已完成的保存。只有逐一预览当前版本全部文件、选择项目或共享技能目录并确认后，才可请求保存；不覆盖同名技能。保存结果以返回的收据路径和版本为准，不把请求接纳当作完成。讨论与设置往返时保留尚未发送的内容和附件，不宣称未执行的分析、检查或工具操作已完成。\n";
const generatedSample =
  "---\nname: review-api-changes\ndescription: 用户请求评审 API 变更、接口 PR 或检查向后兼容性时使用。\n---\n\n# 接口变更评审\n\n## 工作方式\n先读取项目接口规范、当前 diff、接口定义及相关测试，再核对受影响调用方。不要假定没有提供的客户端行为；缺少关键材料时先向用户索取。\n\n1. 确认变更涉及接口契约；纯排版修改说明不适用。\n2. 按 references/checklist.md 检查请求、响应和错误处理的兼容性。\n3. 对每项问题列出文件位置、影响、证据与兼容过渡建议。\n4. 将已确认问题和待核实项分开；不修改代码，不宣称未运行的测试通过。\n\n## 输出\n按严重程度报告问题；没有足够证据时明确说明缺口，不编造调用方或测试结果。\n";
const checklistSample =
  "# 接口兼容性检查清单\n\n- 删除或收紧响应字段时，是否有受影响调用方的证据？\n- 请求字段、默认值、错误码及分页语义是否改变？\n- 相关测试是否覆盖旧客户端行为？没有执行时明确标为未验证。\n- 缺少输入时先列缺口；不要编造兼容结论。\n";
// 配套流程说明仍是服务端内部模拟产物；仅含静态文字和几何形状，不嵌脚本、外链或用户输入。
const reviewFlowSample = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="180" viewBox="0 0 760 180" role="img" aria-labelledby="title description">
  <title id="title">接口变更评审流程</title>
  <desc id="description">读取项目材料，核对接口兼容性，再整理问题、依据和待核实项。</desc>
  <rect width="760" height="180" rx="16" fill="#f8fafc"/>
  <g fill="#e2e8f0" stroke="#475569" stroke-width="2">
    <rect x="24" y="50" width="200" height="80" rx="12"/>
    <rect x="280" y="50" width="200" height="80" rx="12"/>
    <rect x="536" y="50" width="200" height="80" rx="12"/>
  </g>
  <g fill="#475569">
    <path d="M236 86h20v-8l14 12-14 12v-8h-20z"/>
    <path d="M492 86h20v-8l14 12-14 12v-8h-20z"/>
  </g>
  <g fill="#0f172a" font-family="sans-serif" font-size="18" text-anchor="middle">
    <text x="124" y="96">读取项目与接口材料</text>
    <text x="380" y="96">核对兼容性与调用方</text>
    <text x="636" y="96">整理问题与证据</text>
  </g>
</svg>
`;
import { PROTOTYPE_BACKEND } from "./backend.js";
import { readPrototypeDevelopmentRoot } from "./project-settings.js";
import { savePrototypeDesignedSkill } from "./skills.js";
const chatTemplate =
  "已接纳本次技能说明。当前候选技能标识：`{{name}}`，待确认文件：\n\n- `{{directory}}/SKILL.md`\n- `{{directory}}/references/checklist.md`\n- `{{directory}}/references/review-flow.svg`\n\n请在“临时文件预览”中逐个核对；这些候选内容不代表已完成针对本次要求的分析或检查。需要调整时可继续补充要求；确认当前内容后，选择项目或共享技能目录保存，以保存收据确认结果。\n";
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
type SkillModelBinding = Pick<AIReqAgentModelBinding, "providerId" | "modelId" | "reasoning">;
const modelBindings = new Map<string, SkillModelBinding>();
export function prototypeSkillDesignBinding(sessionId: string): SkillModelBinding {
  assertSkillSession(sessionId);
  let binding = modelBindings.get(sessionId);
  if (!binding) {
    const model = readPrototypeWorkflowDefaultModel();
    binding = { providerId: model.providerId, modelId: model.name, reasoning: "default" };
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
  if (!identity) throw businessRule("连接身份已失效，请重新进入工作区。");
  if (projectId && projectId !== "personal" && !readPrototypeDevelopmentRoot(projectId))
    throw businessRule("项目不存在。");
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
    throw businessRule("当前会话不可访问，请重新打开技能设计。");
  return scope.projectId;
}
export function readPrototypeSkillDesign(sessionId: string): AIReqSkillDesignDraft {
  assertSkillSession(sessionId);
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
    throw businessRule("技能设计说明参数无效。");
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
  assertSkillSession(sessionId);
  const prefix = `prototype-skill-design:${PROTOTYPE_BACKEND.id}:`;
  const projectKey = sessionId.startsWith(prefix) ? sessionId.slice(prefix.length) : sessionId;
  return `/tmp/omp-aireq/skill-design/${encodeURIComponent(projectKey)}`;
}
export function preparePrototypeSkillDesignPrompt(
  sessionId: string,
  draft: AIReqSkillDesignDraft,
): string {
  assertSkillSession(sessionId);
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
  assertSkillSession(sessionId);
  const preview = previews.get(sessionId);
  return preview ? structuredClone(preview) : undefined;
}
export interface StagedSkillDiscussion {
  reply: string;
  draft: AIReqSkillDesignDraft;
  preview?: AIReqSkillDesignPreview;
}

export function stagePrototypeSkillDiscussion(
  sessionId: string,
  message: string,
): StagedSkillDiscussion {
  const draft = readPrototypeSkillDesign(sessionId);
  const directory = prototypeSkillDesignDirectory(sessionId);
  // 完整表单消息已在会话历史中保留，避免再次填入时递归嵌套此前整份提示词。
  const isFormSubmission = message.includes(directory);
  if (!isFormSubmission) draft.notes.push(message);
  const previous = previews.get(sessionId);
  if (!isFormSubmission && !previous) return { draft, reply: discussionTemplate };
  // 原型固定产物自行提供推荐标识，不从用户填写的字段生成名称。
  const name = generatedSample.match(/^name: (.+)$/m)![1]!.trim();
  const preview: AIReqSkillDesignPreview = {
    name,
    directory,
    revision: (previous?.revision ?? 0) + 1,
    files: [
      {
        path: "SKILL.md",
        content: `${generatedSample.replace("name: review-api-changes", `name: ${name}`)}\n## 流程说明\n\n![接口变更评审流程](references/review-flow.svg)\n`,
      },
      { path: "references/checklist.md", content: checklistSample },
      { path: "references/review-flow.svg", content: reviewFlowSample },
    ],
  };
  return {
    draft,
    preview,
    reply: chatTemplate.replaceAll("{{directory}}", directory).replaceAll("{{name}}", name),
  };
}

export function commitPrototypeSkillDiscussion(
  sessionId: string,
  output: StagedSkillDiscussion,
): void {
  savePrototypeSkillDesignDraft(sessionId, output.draft);
  if (output.preview) previews.set(sessionId, output.preview);
  supplements.fire(sessionId);
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
  // 幂等回读也必须先验证私有会话归属，不能凭操作编号读取他人的收据。
  const projectId = assertSkillSession(sessionId);
  if (!operationId?.trim()) throw businessRule("保存操作编号缺失。");
  const digest = digestValue([sessionId, workspacePath, name, target, expectedPreviewRevision]);
  const saveKey = `${sessionId}:${operationId}`;
  const prior = saves.get(saveKey);
  if (prior) {
    if (prior.digest !== digest) throw businessRule("操作编号已用于另一保存请求。");
    return structuredClone(prior.receipt);
  }
  const preview = previews.get(sessionId);
  if (!preview) throw businessRule("请先发送设计需求，并预览生成的临时文件。");
  if (preview.revision !== expectedPreviewRevision)
    throw businessRule("临时文件版本已变化，请重新预览并确认。");
  if (!["project", "user"].includes(target)) throw businessRule("保存目标无效。");
  if (
    target === "project" &&
    (!workspacePath || readPrototypeDevelopmentRoot(projectId) !== workspacePath)
  )
    throw businessRule("请选择有效项目，或保存到共享技能目录。");
  if (name !== preview.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64)
    throw businessRule("请通过对话调整候选技能标识。");
  const paths = new Set<string>();
  if (
    !preview.files.some((file) => file.path === "SKILL.md") ||
    preview.files.some((file) => {
      const segments = file.path.split("/");
      if (
        !file.path ||
        file.path.includes("\\") ||
        file.path.includes(":") ||
        segments.some((segment) => !segment || segment === "." || segment === "..") ||
        paths.has(file.path)
      )
        return true;
      paths.add(file.path);
      return false;
    }) ||
    preview.files.some((file) =>
      file.path
        .split("/")
        .slice(0, -1)
        .some((_segment, index, segments) => paths.has(segments.slice(0, index + 1).join("/"))),
    )
  )
    throw businessRule("临时文件路径无效，请重新生成并预览。");
  const path = savePrototypeDesignedSkill(
    target === "user" ? PROTOTYPE_BACKEND.userSkillsDirectory : workspacePath,
    name,
    "接口变更评审：检查接口契约的向后兼容性",
    preview.files,
    target === "user" ? "user" : "workspace",
    preview.revision,
  );
  const receipt = { operationId, path, revision: preview.revision, target, name };
  preview.savedReceipt = receipt;
  saves.set(saveKey, { digest, receipt });
  supplements.fire(sessionId);
  return structuredClone(receipt);
}
