import { businessRule } from "./errors.js";
import type { SkillSummary } from "@zcode/shared";
import { PROTOTYPE_BACKEND } from "./backend.js";
const detail =
  "# 技能详情\n\n演示技能，尚未连接实际存储。\n\n用于预览技能的用途、使用条件和执行步骤。实际使用前，请核对技能内容、所需输入及适用范围，并确认技能已安装到目标项目。\n";

export const PROTOTYPE_SKILLS: SkillSummary[] = [
  {
    id: "prototype-writing-plans",
    name: "writing-plans",
    description: "开发计划编写：组织实施步骤、修改范围和验证安排。",
    body: detail,
    path: `${PROTOTYPE_BACKEND.userSkillsDirectory}/writing-plans/SKILL.md`,
    scope: "user",
    enabled: true,
  },
  {
    id: "prototype-subagent-development",
    name: "subagent-driven-development",
    description: "子代理驱动开发：组织实施任务及独立审查。",
    body: detail,
    path: `${PROTOTYPE_BACKEND.userSkillsDirectory}/subagent-driven-development/SKILL.md`,
    scope: "user",
    enabled: true,
  },
  {
    id: "prototype-verification",
    name: "verification-before-completion",
    description: "完成前验证：核对实际执行结果、证据和未验证事项。",
    body: detail,
    path: `${PROTOTYPE_BACKEND.userSkillsDirectory}/verification-before-completion/SKILL.md`,
    scope: "user",
    enabled: true,
  },
];

const designedFiles = new Map<string, { path: string; content: string }[]>();
const designedSkills = new Map<string, SkillSummary[]>();
export function readPrototypeSkills(workspacePath?: string): SkillSummary[] {
  return structuredClone([
    ...PROTOTYPE_SKILLS,
    ...(designedSkills.get(PROTOTYPE_BACKEND.userSkillsDirectory) ?? []),
    ...(workspacePath && workspacePath !== PROTOTYPE_BACKEND.userSkillsDirectory
      ? (designedSkills.get(workspacePath) ?? [])
      : []),
  ]);
}
export function savePrototypeDesignedSkill(
  workspacePath: string,
  name: string,
  description: string,
  body: string,
  files: { path: string; content: string }[] = [],
  scope: "workspace" | "user" = "workspace",
): string {
  const directory =
    scope === "user"
      ? `${PROTOTYPE_BACKEND.userSkillsDirectory}/${name}`
      : `${workspacePath}/.omp/skills/${name}`;
  const path = `${directory}/SKILL.md`;
  if (readPrototypeSkills(workspacePath).some((skill) => skill.path === path))
    throw businessRule("目标目录已有同名技能，请修改保存标识。");
  const skill: SkillSummary = {
    id: `prototype-designed:${workspacePath}:${name}`,
    name,
    description,
    body,
    path,
    scope,
    enabled: true,
  };
  designedFiles.set(
    path,
    files.map((file) => ({
      path: `${directory}/${file.path}`,
      content: file.path === "SKILL.md" ? body : file.content,
    })),
  );
  designedSkills.set(workspacePath, [...(designedSkills.get(workspacePath) ?? []), skill]);
  return path;
}
