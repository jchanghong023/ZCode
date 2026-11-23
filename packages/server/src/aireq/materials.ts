import { contentVersion } from "./content-digest.js";
import { prototypeChangeRoot, prototypeIrRoot, prototypeSpecPath } from "./proposal-storage.js";
import type { AIReqDocumentFormats, AIReqMaterialView } from "@zcode/services/aireq";

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

/** 普通说明入文档时汇合到业务小节；会话和材料快照保留原始输入。 */
export function materialStatements(note: string): string[] {
  return note
    .trim()
    .replace(/^(?:修复\s*IR|修复方案设计|方案设计|方案)\s*[：:]\s*/iu, "")
    .split(/(?<=[。！？])\s*|\r?\n+/u)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^请(?:整理|生成|更新|修改|补齐|修复|起草)(?:业务需求|需求文档|规格|方案|测试|材料|验收|任务|上述)/u.test(
          line,
        ),
    );
}

export function appendMaterialDiscussion(
  content: string | undefined,
  note: string,
  heading: string,
): string {
  const body = note.trim();
  if (!body) return content ?? "";
  if (/^ {0,3}#{1,6}(?:[ \t]+|$)/m.test(body))
    return content ? (content.endsWith("\n\n" + body) ? content : content + "\n\n" + body) : body;
  const marker = "\n\n## " + heading + "\n\n";
  const at = content?.indexOf(marker) ?? -1;
  const start = at < 0 ? (content ?? "").trimEnd() : content!.slice(0, at);
  const rest = at < 0 ? "" : content!.slice(at + marker.length);
  const nextHeading = rest.search(/\n\n#{1,6} /u);
  const previous = (nextHeading < 0 ? rest : rest.slice(0, nextHeading)).trim();
  const tail = nextHeading < 0 ? "" : rest.slice(nextHeading);
  const statements = new Set([
    ...previous.split(/\n+/u).filter(Boolean),
    ...materialStatements(body),
  ]);
  if (!statements.size) return content ?? "";
  return (start + marker + [...statements].join("\n\n") + tail).trimStart();
}

export function prototypeMaterial(
  input: Omit<AIReqMaterialView, "sha256" | "size" | "valid">,
): AIReqMaterialView {
  // 样例和 Agent 共用写入逻辑，让图示随正文一起进入版本快照与摘要。
  const content =
    input.path.endsWith(".md") && input.content
      ? withPrototypeDiagram(input.content, input.kind)
      : input.content;
  return {
    ...input,
    ...(content === undefined ? {} : { content }),
    ...contentVersion(content ?? ""),
    valid: true,
  };
}

const prototypeFlows: Record<AIReqMaterialView["kind"], string> = {
  ir: "A[说明业务场景] --> B[明确预期结果] --> C[核对验收条件]",
  sr: "A[读取业务需求] --> B[明确变更范围] --> C[描述可观察结果]",
  solution: "A[核对现有接口] --> B[设计处理路径] --> C[检查异常边界]",
  plan: "A[核对前置条件] --> B[实施变更] --> C[记录验证结果]",
  "test-plan": "A[准备测试场景] --> B[执行操作] --> C[比对预期结果]",
};

function hasMermaidDiagram(content: string): boolean {
  let fence: string | undefined;
  let mermaid = false;
  let hasBody = false;
  for (const line of content.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1]!.startsWith(fence) && !marker[2]!.trim()) {
        if (mermaid && hasBody) return true;
        fence = undefined;
      } else if (line.trim()) {
        hasBody = true;
      }
    } else if (marker && (marker[1]![0] === "~" || !marker[2]!.includes("`"))) {
      fence = marker[1]!;
      mermaid = marker[2]!.trim() === "mermaid";
      hasBody = false;
    }
  }
  return false;
}

function withPrototypeDiagram(content: string, kind: AIReqMaterialView["kind"]): string {
  if (hasMermaidDiagram(content)) return content;
  const diagram = "```mermaid\nflowchart TD\n  " + prototypeFlows[kind] + "\n```";
  const title = /^(?:[ \t]*\r?\n)* {0,3}#[ \t]+[^\r\n]+/.exec(content)?.[0];
  if (!title) return diagram + "\n\n" + content;
  const body = content.slice(title.length).replace(/^(?:[ \t]*\r?\n)+/, "");
  return [title, diagram, body].filter(Boolean).join("\n\n");
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
  if (noteDiagramEnd || hasMermaidDiagram(note)) return note;
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
        content: `# ${row.title}\n\n## 业务依据\n业务依据：[IR ${irId} 的目标与范围](../../../docs/requirements/${irId}/requirements.md)。\n\n## 变更内容\n${row.title}。\n\n## 范围\n本 SR 独立开发；跨 SR 范围以 IR 与依赖 JSON 为准。`,
      }),
      prototypeMaterial({
        ...context,
        kind: "sr",
        path: prototypeSpecPath(row.id),
        content: `# ${row.title}\n\n## ADDED Requirements\n\n### Requirement: ${row.title}\n业务行为与可观察结果必须满足 [当前 IR 需求](../../../../../docs/requirements/${irId}/requirements.md)。`,
      }),
      prototypeMaterial({
        ...context,
        kind: "solution",
        path: `${root}/design.md`,
        content: `# ${row.title} · 技术方案\n\n## 设计背景\n以当前业务需求、当前 SR 提案及规格为输入。\n\n## 设计决策\n先核对现有接口、状态和异常边界。依赖仅见 [sr-dependencies.json](../../../docs/requirements/${irId}/sr-dependencies.json)。\n\n## 待核实事项\n尚未完成代码与接口核验，实施前需确认。`,
      }),
      prototypeMaterial({
        ...context,
        kind: "plan",
        path: `${root}/tasks.md`,
        content: `# ${row.title} · 开发任务\n\n- [ ] 核对 [IR ${irId}](../../../docs/requirements/${irId}/requirements.md) 中归属本 SR 的业务条件。\n- [ ] 实现规格中的操作、状态和异常处理。\n- [ ] 执行测试方案并记录结果。`,
      }),
      prototypeMaterial({
        ...context,
        kind: "test-plan",
        path: `${root}/test-plan.md`,
        content: `# ${row.title} · 测试方案\n\n## 业务依据\n从 [IR ${irId}](../../../docs/requirements/${irId}/requirements.md) 提取归属本 SR 的业务验收条件和预期结果。\n\n## 待补充的验证项\n请补充各场景的输入、操作和预期结果。涉及前置 SR 时，结合 [SR 依赖](../../../docs/requirements/${irId}/sr-dependencies.json) 记录跨 SR 场景、代码版本和实际证据。`,
      }),
    ];
  });
}
