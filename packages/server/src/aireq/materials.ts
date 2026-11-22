import { contentVersion } from "./content-digest.js";
import { prototypeChangeRoot, prototypeIrRoot, prototypeSpecPath } from "./proposal-storage.js";
import type {
  AIReqDocumentFormats,
  AIReqDocumentName,
  AIReqMaterialCheck,
  AIReqMaterialView,
  AIReqRequirementGroup,
} from "@zcode/services/aireq";
import {
  checkMarkdownSections,
  completeProposalPaths,
  readSrDependencies,
} from "@zcode/services/aireq";

export function emptyDocumentFormats(): AIReqDocumentFormats {
  return {
    "requirements.md": [],
    "proposal.md": [],
    "design.md": [],
    "tasks.md": [],
    "test-plan.md": [],
    "spec.md": [],
  };
}

const materialKinds: Record<AIReqDocumentName, AIReqMaterialView["kind"]> = {
  "requirements.md": "ir",
  "proposal.md": "sr",
  "design.md": "solution",
  "tasks.md": "plan",
  "test-plan.md": "test-plan",
  "spec.md": "sr",
};

/** Inspect only the current stage's paths; solution review refers to the checked IR snapshot. */
export function checkProposalMaterials(
  group: AIReqRequirementGroup,
  materials: AIReqMaterialView[],
  stage: "requirements" | "solution",
  formats: AIReqDocumentFormats,
  readIssue?: (material: AIReqMaterialView) => string | undefined,
): AIReqMaterialCheck {
  const paths =
    stage === "requirements"
      ? [`${prototypeIrRoot(group.id)}/requirements.md`]
      : completeProposalPaths(group).slice(1);
  const issues: AIReqMaterialCheck["issues"] = [];
  for (const path of paths) {
    const material = materials.find((item) => item.path === path);
    if (!material) {
      issues.push({ path, reason: "缺少必需文件。" });
      continue;
    }
    const reason = readIssue?.(material) ?? material.error;
    if (reason) {
      material.valid = false;
      issues.push({ path, reason });
      continue;
    }
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (name === "sr-dependencies.json") {
      if (material.kind !== "solution" || !material.content?.trim()) {
        material.valid = false;
        issues.push({ path, reason: "依赖文件类型不符、为空或不可读取。" });
        continue;
      }
      // Preserve a readable dependency topology when only estimates are incomplete.
      material.valid = true;
      const dependencyIssue = readSrDependencies(group, material).issue;
      if (dependencyIssue) issues.push({ path, reason: dependencyIssue });
      continue;
    }
    const filename = name as AIReqDocumentName;
    if (material.kind !== materialKinds[filename]) {
      material.valid = false;
      issues.push({ path, reason: "文件类型与材料清单不符。" });
      continue;
    }
    if (!material.content?.trim()) {
      material.valid = false;
      issues.push({ path, reason: "正文为空或不可读取。" });
      continue;
    }
    const sections = checkMarkdownSections(material.content, formats[filename]);
    material.valid = sections.length === 0;
    for (const { heading, kind } of sections) {
      issues.push({
        path,
        reason: kind === "missing" ? `缺少章节“${heading}”。` : `章节“${heading}”缺少正文。`,
      });
    }
  }
  return { issues };
}

/** A plain clarification adds a headed note; explicit Markdown keeps its own headings. */
export function appendMaterialDiscussion(
  content: string | undefined,
  note: string,
  heading: string,
): string {
  const body = note.trim();
  const discussion = /^ {0,3}#{1,6}(?:[ \t]+|$)/m.test(body) ? body : `## ${heading}\n\n${body}`;
  if (!content) return discussion;
  const addition = `\n\n${discussion}`;
  return content.endsWith(addition) ? content : content + addition;
}

export function prototypeMaterial(
  input: Omit<AIReqMaterialView, "sha256" | "size" | "valid">,
): AIReqMaterialView {
  // 摘要与字节数只取实际正文，不能为材料注入与业务无关的说明。
  const content = input.content ?? "";
  return {
    ...input,
    ...(input.content === undefined ? {} : { content }),
    ...contentVersion(content),
    valid: true,
  };
}

function leadingMermaidEnd(content: string): number {
  const opener = /^(?:[ \t]*\r?\n)* {0,3}(`{3,}|~{3,})[ \t]*mermaid[ \t]*\r?\n/.exec(content);
  if (!opener?.[1]) return 0;
  const fence = opener[1];
  const closer = new RegExp(
    `^ {0,3}${fence}${fence[0]}*[ \\t]*(?:\\r?\\n|$)(?:[ \\t]*\\r?\\n)*`,
    "gm",
  );
  closer.lastIndex = opener[0].length;
  return closer.test(content) ? closer.lastIndex : 0;
}

export function reviseGeneratedMarkdown(
  content: string | undefined,
  note: string,
  heading: string,
): string {
  const noteDiagramEnd = leadingMermaidEnd(note);
  if (!/^ {0,3}#(?:[ \t]+|\r?\n|$)/.test(note.slice(noteDiagramEnd))) {
    return appendMaterialDiscussion(content, note, heading);
  }
  if (noteDiagramEnd) return note;
  const priorDiagramEnd = content ? leadingMermaidEnd(content) : 0;
  if (!content || !priorDiagramEnd) return note;
  const diagram = content.slice(0, priorDiagramEnd);
  return diagram + (diagram.endsWith("\n") ? "" : "\n") + note;
}

export function requirementMaterials(
  projectId: string,
  irId: string,
  title: string,
  rows: { id: string; title: string }[],
  originalText = title,
): AIReqMaterialView[] {
  const shared = { projectId, irId };
  return [
    prototypeMaterial({
      ...shared,
      kind: "ir",
      path: `${prototypeIrRoot(irId)}/requirements.md`,
      content: `# ${title}\n\n## 目标与范围\n${originalText}\n\n## 业务验收标准\n- AC-1：业务正常操作具有明确、可观察的成功结果。\n- AC-2：失败和重复请求不丢失输入，明确说明恢复路径。\n\n## 范围外\n不由本平台执行开发、修改代码或运行测试。`,
    }),
    ...solutionMaterials(projectId, irId, rows),
  ];
}

export function solutionMaterials(
  projectId: string,
  irId: string,
  rows: { id: string; title: string }[],
): AIReqMaterialView[] {
  return rows.flatMap((row) => {
    const root = prototypeChangeRoot(row.id);
    const context = { projectId, irId, srId: row.id };
    return [
      prototypeMaterial({
        ...context,
        kind: "sr",
        path: `${root}/proposal.md`,
        content: `# ${row.title}\n\n## Why\n业务依据：[IR ${irId} 的目标与范围](../../../docs/requirements/${irId}/requirements.md)。\n\n## What Changes\n${row.title}。\n\n## Scope\n本 SR 独立开发；跨 SR 范围以 IR 与依赖 JSON 为准。`,
      }),
      prototypeMaterial({
        ...context,
        kind: "sr",
        path: prototypeSpecPath(irId, row.id),
        content: `# ${row.title}\n\n## ADDED Requirements\n\n### Requirement: ${row.title}\n业务行为与可观察结果必须满足 [已确认的 IR 需求](../../../../../docs/requirements/${irId}/requirements.md)。`,
      }),
      prototypeMaterial({
        ...context,
        kind: "solution",
        path: `${root}/design.md`,
        content: `# ${row.title} · 技术方案\n\n## Context\n以已确认的业务需求、当前 SR 提案及规格为输入。\n\n## Decisions\n先核对现有接口、状态和异常边界。依赖仅见 [sr-dependencies.json](../../../docs/requirements/${irId}/sr-dependencies.json)。\n\n## Risks\n尚未完成代码与接口核验，实施前需确认。`,
      }),
      prototypeMaterial({
        ...context,
        kind: "plan",
        path: `${root}/tasks.md`,
        content: `# ${row.title} · 开发任务\n\n- [ ] 核对 [IR ${irId}](../../../docs/requirements/${irId}/requirements.md) 中归属本 SR 的业务条件。\n- [ ] 实现规格中的操作、状态和异常处理。\n- [ ] 执行测试方案并提交代码审查。`,
      }),
      prototypeMaterial({
        ...context,
        kind: "test-plan",
        path: `${root}/test-plan.md`,
        content: `# ${row.title} · 测试方案\n\n## 业务依据\n从 [IR ${irId}](../../../docs/requirements/${irId}/requirements.md) 提取归属本 SR 的业务验收条件和预期结果。\n\n## 验证\n逐项比对正常结果、异常与恢复。涉及前置 SR 时，结合 [SR 依赖](../../../docs/requirements/${irId}/sr-dependencies.json) 记录跨 SR 场景、代码版本和实际证据。`,
      }),
    ];
  });
}
