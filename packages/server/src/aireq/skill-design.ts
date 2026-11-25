import { digestValue } from "./content-digest.js";
import { businessRule } from "./errors.js";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { currentIdentity } from "./identity.js";
import { production } from "./production-store.js";
import { publishSkillFiles, skillMetadata } from "./published-skills.js";
import type {
  AIReqSkillDesignDraft,
  AIReqSkillDesignDraftFields,
  AIReqSkillDesignPreview,
  AIReqSkillDesignSession,
} from "@zcode/services/aireq";
import { readPrototypeWorkflowDefaultModel, type NativeRuntimeModel } from "./agent-models.js";
import { PROTOTYPE_WORKSPACE_IDENTITY } from "./fixture-builders.js";
const promptTemplate =
  "请根据以下说明与我一起设计可复用技能。请推荐技能标识，不要要求我先填写名称。信息不足时先澄清，不要把表单直接拼成技能文件。\n\n要解决什么任务：{{goal}}\n\n什么时候使用：{{when}}\n\n需要哪些输入：{{inputs}}\n\n期望结果与成功标准：{{outputs}}\n\n边界与不适用场景：{{boundaries}}\n\n流程、规则或参考资料：{{references}}\n\n真实例子或失败情况：{{example}}\n\n已发送的补充讨论：{{notes}}\n\n临时技能目录：{{directory}}\n主文件路径：{{directory}}/SKILL.md\n\n请先核对上述内容，必要时与我讨论，再推荐合适的技能标识，准备 SKILL.md 和必要的参考资料、脚本内容，并按此目录组织预览路径。回复推荐标识、文件清单及对应预览路径，供我预览、继续讨论修改。\n\n请明确区分建议、待确认内容与已完成的保存。只有逐一预览当前版本全部文件、选择项目或共享技能目录并确认后，才可请求保存；不覆盖同名技能。保存结果以返回的收据路径和版本为准，不把请求接纳当作完成。讨论与设置往返时保留尚未发送的内容和附件，不宣称未执行的分析、检查或工具操作已完成。\n";
const generatedSample =
  "---\nname: review-api-changes\ndescription: 用户请求评审 API 变更、接口 PR 或检查向后兼容性时使用。\n---\n\n" +
  '```mermaid\nflowchart LR\n  A["核对评审材料"] --> B{"材料齐全？"}\n  B -->|否| C["向用户索取缺失材料"]\n  B -->|是| D["检查接口兼容性"] --> E["区分已确认问题与待核实项"]\n```\n\n' +
  "# 接口变更评审\n\n## 工作方式\n先读取项目接口规范、当前 diff、接口定义及相关测试，再核对受影响调用方。不要假定没有提供的客户端行为；缺少关键材料时先向用户索取。\n\n1. 确认变更涉及接口契约；纯排版修改说明不适用。\n2. 按 references/checklist.md 检查请求、响应和错误处理的兼容性。\n3. 对每项问题列出文件位置、影响、证据与兼容过渡建议。\n4. 将已确认问题和待核实项分开；不修改代码，不宣称未运行的测试通过。\n\n## 输出\n按严重程度报告问题；没有足够证据时明确说明缺口，不编造调用方或测试结果。\n";
const checklistSample =
  '```mermaid\nflowchart LR\n  A["核对契约变更"] --> B["检查调用方证据"] --> C{"已执行旧客户端测试？"}\n  C -->|是| D["记录测试结果"]\n  C -->|否| E["标为未验证"]\n```\n\n' +
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
import { readPrototypeSkillPaths, savePrototypeDesignedSkill } from "./skills.js";
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
function privateRecords<T>(name: string) {
  const memory = new Map<string, T>();
  const key = (id: string) => "skill-design:" + name + ":" + id;
  return {
    get(id: string) {
      return production ? production.get<T>(key(id)) : memory.get(id);
    },
    set(id: string, value: T) {
      if (production) production.set(key(id), value);
      else memory.set(id, value);
    },
  };
}
const modelBindings = privateRecords<NativeRuntimeModel>("models");
export function prototypeSkillDesignBinding(sessionId: string): NativeRuntimeModel {
  assertSkillSession(sessionId);
  let binding = modelBindings.get(sessionId);
  if (!binding) {
    const model = readPrototypeWorkflowDefaultModel();
    binding = {
      providerId: model.providerId,
      modelId: model.modelId ?? model.name,
      reasoning: "default",
    };
    modelBindings.set(sessionId, binding);
  }
  return structuredClone(binding);
}
const drafts = privateRecords<AIReqSkillDesignDraft>("drafts");
const supplements = createPrototypeEvent<string>();
export const onPrototypeSkillDesignSupplement = supplements.event;
const scopes = privateRecords<{ projectId: string; employeeId: string; clientId: string }>(
  "scopes",
);
export function prototypeSkillDesignWorkspaceIdentity(projectId: string): string {
  return `${PROTOTYPE_WORKSPACE_IDENTITY}:${projectId}:skill-design`;
}

export function prototypeSkillDesignSession(projectId: string): AIReqSkillDesignSession {
  const identity = currentIdentity();
  if (!identity) throw businessRule("连接身份已失效，请重新进入工作区。");
  if (projectId && projectId !== "personal" && !readPrototypeDevelopmentRoot(projectId))
    throw businessRule("项目不存在。");
  const id = `prototype-skill-design:${PROTOTYPE_BACKEND.id}:${createHash("sha256")
    .update(JSON.stringify([identity.employeeId, identity.clientId, projectId]))
    .digest("hex")}`;
  scopes.set(id, { projectId, employeeId: identity.employeeId, clientId: identity.clientId });
  prototypeSkillDesignBinding(id);
  return {
    sessionId: id,
    workspaceIdentity: prototypeSkillDesignWorkspaceIdentity(projectId),
    temporaryDirectory: prototypeSkillDesignDirectory(id),
  };
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
export function savePrototypeSkillDesignDraft(
  sessionId: string,
  value: AIReqSkillDesignDraftFields,
): void {
  assertSkillSession(sessionId);
  drafts.set(sessionId, { ...value, notes: drafts.get(sessionId)?.notes ?? [] });
}
const previews = privateRecords<AIReqSkillDesignPreview>("previews");
function prototypeSkillDesignDirectory(sessionId: string): string {
  assertSkillSession(sessionId);
  const prefix = `prototype-skill-design:${PROTOTYPE_BACKEND.id}:`;
  const projectKey = sessionId.startsWith(prefix) ? sessionId.slice(prefix.length) : sessionId;
  if (production) return "aireq-preview://" + encodeURIComponent(projectKey);
  return `/tmp/omp-aireq/skill-design/${encodeURIComponent(projectKey)}`;
}
export function preparePrototypeSkillDesignPrompt(
  sessionId: string,
  fields: AIReqSkillDesignDraftFields,
): string {
  const directory = prototypeSkillDesignDirectory(sessionId);
  const values: Record<string, string> = {
    ...fields,
    notes: (drafts.get(sessionId) ?? emptyDraft).notes.join("\n\n"),
    directory,
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
export function listPrototypeSkillDesignPaths(sessionId: string): string[] {
  const projectId = assertSkillSession(sessionId);
  const projectRoot =
    projectId === "personal" ? undefined : readPrototypeDevelopmentRoot(projectId);
  return readPrototypeSkillPaths(projectRoot ?? PROTOTYPE_BACKEND.configDirectory);
}
export interface StagedSkillDiscussion {
  reply: string;
  note: string | undefined;
  preview?: AIReqSkillDesignPreview;
}

const candidateSchema = z.strictObject({
  name: z
    .string()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  files: z.array(z.strictObject({ path: z.string().min(1), content: z.string() })).min(1),
});

/** Keep published names valid on both Windows and Linux; reject aliases before creating any file. */
function validateCandidate(candidate: Pick<AIReqSkillDesignPreview, "name" | "files">) {
  const paths = new Set<string>();
  const directories = new Set<string>();
  const windowsDevice = /^(?:aux|con|prn|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
  const partsValid = (s: string) =>
    Boolean(s) &&
    s !== "." &&
    s !== ".." &&
    !/[\\:<>"|?*\p{Cc}]/u.test(s) &&
    !/[. ]$/.test(s) &&
    !windowsDevice.test(s);
  if (!partsValid(candidate.name)) throw businessRule("技能标识不适合作为目录名。");
  for (const file of candidate.files) {
    const parts = file.path.split("/");
    const key = file.path.toLowerCase();
    if (!parts.every(partsValid) || paths.has(key) || directories.has(key))
      throw businessRule("候选文件路径无效或重复。");
    paths.add(key);
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join("/").toLowerCase();
      if (paths.has(parent)) throw businessRule("候选文件和目录同名。");
      directories.add(parent);
    }
  }
  const main = candidate.files.find((file) => file.path === "SKILL.md");
  if (!main) throw businessRule("候选技能缺少 SKILL.md。");
  return skillMetadata(main.content, candidate.name);
}

export function createSkillDesignTurn(sessionId: string, text: string) {
  const projectId = assertSkillSession(sessionId);
  if (!production) throw businessRule("正式技能设计服务未启动。");
  const preview = previews.get(sessionId);
  const draft = drafts.get(sessionId) ?? emptyDraft;
  const cwd = join(
    production.root,
    "private-skills",
    createHash("sha256").update(sessionId).digest("hex"),
  );
  mkdirSync(cwd, { recursive: true });
  let staged: z.infer<typeof candidateSchema> | undefined;
  const tool = {
    name: "propose_skill_files",
    label: "准备技能文件预览",
    approval: "write",
    loadMode: "essential",
    description:
      "提交完整候选技能目录的预览，包含 SKILL.md 和全部配套文件。用户确认后才发布。再次调用会替换本回合候选。",
    parameters: z.toJSONSchema(candidateSchema),
    async execute(_callId: string, input: unknown) {
      const candidate = candidateSchema.parse(input);
      validateCandidate(candidate);
      staged = candidate;
      return {
        content: [{ type: "text", text: "已准备候选预览，将随成功完成的讨论回合提交。" }],
        details: {},
      };
    },
  };
  return {
    cwd,
    prompt: text,
    options: {
      toolNames: [tool.name],
      restrictToolNames: true,
      allowRestrictedCustomTools: true,
      customTools: [tool],
      enableMCP: false,
      enableLsp: false,
      noContextFiles: true,
      disableExtensionDiscovery: true,
      systemPrompt: (base: string[]) => [
        ...base,
        "你负责设计可复用的 OMP Skill。根据用户意图澄清需求或调用 propose_skill_files 准备实际文件，不能自行发布。SKILL.md 需要合法的 YAML name、description。现有说明和预览如下。",
        JSON.stringify({
          projectId,
          draft,
          preview: preview && { name: preview.name, files: preview.files },
        }),
      ],
    },
    finish(reply: string): StagedSkillDiscussion {
      return {
        reply,
        note: text.includes(prototypeSkillDesignDirectory(sessionId)) ? undefined : text,
        ...(staged && { preview: { ...staged, revision: (preview?.revision ?? 0) + 1 } }),
      };
    },
  };
}

export function stagePrototypeSkillDiscussion(
  sessionId: string,
  message: string,
): StagedSkillDiscussion {
  if (production) throw businessRule("正式技能讨论必须由 OMP 会话生成。");
  const directory = prototypeSkillDesignDirectory(sessionId);
  // 完整表单消息已在会话历史中保留，避免再次填入时递归嵌套此前整份提示词。
  const note = message.includes(directory) ? undefined : message;
  const previous = previews.get(sessionId);
  if (note !== undefined && !previous) return { note, reply: discussionTemplate };
  // 原型固定产物自行提供推荐标识，不从用户填写的字段生成名称。
  const name = generatedSample.match(/^name: (.+)$/m)![1]!.trim();
  const preview: AIReqSkillDesignPreview = {
    name,
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
    note,
    preview,
    reply: chatTemplate.replaceAll("{{directory}}", directory).replaceAll("{{name}}", name),
  };
}

export function commitPrototypeSkillDiscussion(
  sessionId: string,
  output: StagedSkillDiscussion,
): void {
  assertSkillSession(sessionId);
  const commit = () => {
    if (output.note !== undefined) {
      // 回合准备后表单仍可保存；完成时只向当前草稿追加备注。
      const draft = drafts.get(sessionId);
      drafts.set(sessionId, {
        ...(draft ?? emptyDraft),
        notes: [...(draft?.notes ?? []), output.note],
      });
    }
    if (output.preview) {
      if (production && output.preview.revision !== (previews.get(sessionId)?.revision ?? 0) + 1)
        throw businessRule("技能预览已变化，请基于最新版继续讨论。");
      previews.set(sessionId, output.preview);
    }
  };
  if (production) production.db.transaction(commit)();
  else commit();
  supplements.fire(sessionId);
}
const saves = privateRecords<{
  digest: string;
  receipt: import("@zcode/services/aireq").AIReqSkillSaveReceipt;
}>("receipts");
export function savePrototypeSkillDesignPreview(
  sessionId: string,
  target: "project" | "user",
  expectedPreviewRevision: number,
  operationId: string,
): import("@zcode/services/aireq").AIReqSkillSaveReceipt {
  // 幂等回读也必须先验证私有会话归属，不能凭操作编号读取他人的收据。
  const projectId = assertSkillSession(sessionId);
  if (!operationId?.trim()) throw businessRule("保存操作编号缺失。");
  const digest = digestValue([target, expectedPreviewRevision]);
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
  const workspacePath =
    target === "user"
      ? PROTOTYPE_BACKEND.userSkillsDirectory
      : projectId === "personal"
        ? undefined
        : readPrototypeDevelopmentRoot(projectId);
  if (!workspacePath) throw businessRule("请选择有效项目，或保存到共享技能目录。");
  const { name } = preview;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64)
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
  if (production) validateCandidate(candidateSchema.parse({ name, files: preview.files }));
  const path = production
    ? publishSkillFiles(
        production,
        workspacePath,
        name,
        preview.files,
        target === "user" ? "user" : "workspace",
        saveKey,
        digest,
      )
    : savePrototypeDesignedSkill(
        workspacePath,
        name,
        "接口变更评审：检查接口契约的向后兼容性",
        preview.files,
        target === "user" ? "user" : "workspace",
        preview.revision,
      );
  const receipt = { path, revision: preview.revision, target };
  const commit = () => {
    previews.set(sessionId, { ...preview, savedReceipt: receipt });
    saves.set(saveKey, { digest, receipt });
  };
  if (production) production.db.transaction(commit)();
  else commit();
  supplements.fire(sessionId);
  return structuredClone(receipt);
}
