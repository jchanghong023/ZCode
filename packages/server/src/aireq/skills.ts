import { businessRule } from "./errors.js";
import type { SkillSummary } from "@zcode/shared";
import { PROTOTYPE_BACKEND } from "./backend.js";
import { production } from "./production-store.js";
import { readPublishedSkills } from "./published-skills.js";
const detail =
  '```mermaid\nflowchart LR\n  A["核对技能用途与范围"] --> B["确认输入和项目依赖"] --> C["查阅执行步骤"]\n```\n\n' +
  "# 技能详情\n\n用于核对技能的用途、使用条件和执行步骤。使用前，请核对技能内容、所需输入及适用范围，并确认目标项目包含所需依赖。不要把技能说明当作已经执行的结果。\n";

const PROTOTYPE_SKILLS: SkillSummary[] = [
  {
    id: "skill:writing-plans",
    name: "writing-plans",
    description: "开发计划编写：组织实施步骤、修改范围和验证安排。",
    body: detail,
    path: `${PROTOTYPE_BACKEND.userSkillsDirectory}/writing-plans/SKILL.md`,
    scope: "user",
    enabled: true,
  },
  {
    id: "skill:subagent-driven-development",
    name: "subagent-driven-development",
    description: "子代理驱动开发：组织实施任务及独立审查。",
    body: detail,
    path: `${PROTOTYPE_BACKEND.userSkillsDirectory}/subagent-driven-development/SKILL.md`,
    scope: "user",
    enabled: true,
  },
  {
    id: "skill:verification-before-completion",
    name: "verification-before-completion",
    description: "完成前验证：核对实际执行结果、证据和未验证事项。",
    body: detail,
    path: `${PROTOTYPE_BACKEND.userSkillsDirectory}/verification-before-completion/SKILL.md`,
    scope: "user",
    enabled: true,
  },
];

interface SkillFileNode {
  kind: "file" | "directory";
  name: string;
  content?: string;
  children?: Map<string, SkillFileNode>;
  mtimeMs: number;
}
type DesignedSkill = { workspacePath: string; skill: SkillSummary };
// 目录、文件和目录清单同属一个快照；校验或构建失败时不发布任何部分结果。
let storage = {
  nodes: new Map<string, SkillFileNode>(),
  skills: [] as DesignedSkill[],
};
function pathKey(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
/** 只读合并已有虚拟目录；内容仍只由本 owner 的保存快照提供。 */
export function readPrototypeSkillNode(
  path: string,
  existing?: SkillFileNode | null,
): SkillFileNode | undefined {
  const saved = storage.nodes.get(pathKey(path));
  if (!saved) return existing ?? undefined;
  if (!existing || saved.kind !== "directory" || existing.kind !== "directory") return saved;
  const children = new Map(existing.children);
  for (const [name, child] of saved.children ?? []) {
    const previous = children.get(name);
    children.set(name, previous ? readPrototypeSkillNode(`${path}/${name}`, previous)! : child);
  }
  return { ...saved, children };
}

export function readBuiltinPrototypeSkills(): SkillSummary[] {
  if (production) return readPublishedSkills(production);
  return structuredClone(PROTOTYPE_SKILLS);
}

function projectPrototypeSkills<T>(
  workspacePath: string | undefined,
  project: (skill: SkillSummary) => T,
): T[] {
  if (production) return readPublishedSkills(production, workspacePath).map(project);
  const result = PROTOTYPE_SKILLS.map(project);
  const workspaceKey = workspacePath ? pathKey(workspacePath) : undefined;
  for (const entry of storage.skills) {
    if (
      entry.skill.scope === "user" ||
      (workspaceKey !== undefined && pathKey(entry.workspacePath) === workspaceKey)
    ) {
      result.push(project(entry.skill));
    }
  }
  return result;
}

export function readPrototypeSkills(workspacePath?: string): SkillSummary[] {
  return projectPrototypeSkills(workspacePath, (skill) => structuredClone(skill));
}

export function readPrototypeSkillPaths(workspacePath: string): string[] {
  return projectPrototypeSkills(workspacePath, (skill) => skill.path);
}
export function savePrototypeDesignedSkill(
  workspacePath: string,
  name: string,
  description: string,
  files: { path: string; content: string }[],
  scope: "workspace" | "user",
  revision: number,
): string {
  const mainFile = files.find((file) => file.path === "SKILL.md");
  if (!mainFile) throw businessRule("技能主文件缺失，请重新生成并预览。");
  const directory =
    scope === "user"
      ? `${PROTOTYPE_BACKEND.userSkillsDirectory}/${name}`
      : `${workspacePath}/.omp/skills/${name}`;
  const path = `${directory}/SKILL.md`;
  if (
    storage.nodes.has(pathKey(directory)) ||
    readPrototypeSkills(workspacePath).some((skill) => pathKey(skill.path) === pathKey(path))
  )
    throw businessRule("目标目录已有同名技能，请修改保存标识。");
  const skill: SkillSummary = {
    id: `skill:${directory}`,
    name,
    description,
    body: mainFile.content,
    path,
    scope,
    enabled: true,
    metadata: { version: String(revision) },
  };
  const nodes = new Map(storage.nodes);
  const now = Date.now();
  const ensureDirectory = (absolutePath: string): SkillFileNode => {
    const key = pathKey(absolutePath);
    const existing = nodes.get(key);
    if (existing?.kind === "file") throw businessRule("保存路径与已有文件冲突。");
    const node: SkillFileNode = {
      kind: "directory",
      name: absolutePath.slice(absolutePath.lastIndexOf("/") + 1),
      children: new Map(existing?.children),
      mtimeMs: now,
    };
    nodes.set(key, node);
    const slash = absolutePath.lastIndexOf("/");
    if (slash > 0) ensureDirectory(absolutePath.slice(0, slash)).children!.set(node.name, node);
    return node;
  };
  ensureDirectory(directory);
  for (const file of files) {
    const absolutePath = `${directory}/${file.path}`;
    const parent = ensureDirectory(absolutePath.slice(0, absolutePath.lastIndexOf("/")));
    const node: SkillFileNode = {
      kind: "file",
      name: file.path.slice(file.path.lastIndexOf("/") + 1),
      content: file.content,
      mtimeMs: now,
    };
    parent.children!.set(node.name, node);
    nodes.set(pathKey(absolutePath), node);
  }
  storage = { nodes, skills: [...storage.skills, { workspacePath, skill }] };
  return path;
}
