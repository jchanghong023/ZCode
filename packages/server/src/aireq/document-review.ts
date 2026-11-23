import {
  AIREQ_DOCUMENT_PATHS,
  checkMarkdownSections,
  fileVersions,
  type AIReqDiscussionAgent,
  type AIReqDocumentFormats,
  type AIReqDocumentName,
  type AIReqMaterialView,
} from "@zcode/services/aireq";
import { readPrototypeAgentModelBinding, type NativeRuntimeModel } from "./agent-models.js";
import { requirementMaterialsFor } from "./document-versions.js";
import { businessRule } from "./errors.js";
import type { RequirementGroup, WorkflowState } from "./workflow-state.js";

const prompts: Record<AIReqDiscussionAgent, string> = {
  requirements:
    "独立评审当前需求文档。核对业务目标、范围、验收条件及异常场景，按文件和章节给出可执行的意见。只返回报告，不修改文件。",
  solution:
    "独立审查当前方案文档。对照需求核对覆盖范围、技术设计、SR 依赖、开发任务和测试方案，按文件和章节给出可执行的意见。只返回报告，不修改文件。",
};
const titles = { requirements: "需求评审", solution: "方案审查" };

/** A review admitted by workflow, dispatched through its parent native session. */
export interface AIReqNativeReviewWork {
  sessionId: string;
  workspace: { workspacePath: string; workspaceIdentity: string };
  id: string;
  clientId: string;
  title: string;
  version: number;
  prompt: string;
  additionalInstructions: string;
  model: NativeRuntimeModel;
  execute: () => string;
  settle: (status: "completed" | "failed", report: string) => string;
}

export interface DocumentReviewRun {
  id: string;
  projectId: string;
  irId: string;
  sessionId: string;
  version: number;
  agent: AIReqDiscussionAgent;
  title: string;
  prompt: string;
  model: NativeRuntimeModel;
  promptSnapshot: string;
  materials: AIReqMaterialView[];
  documentFormats: AIReqDocumentFormats;
}

export function acceptDocumentReview(
  state: WorkflowState,
  requirement: RequirementGroup,
  agent: AIReqDiscussionAgent,
  employeeId: string,
  at: string,
): DocumentReviewRun {
  const version = requirement.documentVersion?.number;
  if (!version) throw businessRule("请先生成要评审的文档。");
  const id = `document-review-${state.revision}`;
  const materials = requirementMaterialsFor(state, requirement);
  const binding = readPrototypeAgentModelBinding(
    agent === "requirements" ? "requirements-review" : "solution-review",
  );
  requirement.documentReviews.push({
    id,
    agent,
    version,
    requestedBy: employeeId,
    requestedAt: at,
    status: "running",
    stale: false,
    materialDigest: fileVersions(materials),
  });
  return {
    id,
    projectId: requirement.projectId,
    irId: requirement.id,
    sessionId: requirement.sessions.find((session) => session.phase === agent)!.sessionId,
    agent,
    version,
    title: titles[agent],
    prompt: prompts[agent],
    model: binding.runtimeModel,
    promptSnapshot: binding.modelConfig.promptSnapshot,
    materials: structuredClone(materials),
    documentFormats: structuredClone(state.documentFormats),
  };
}

/** 原型子代理只检查接纳时的内存材料，并如实报告本次结构检查。 */
export function simulateDocumentReview(run: DocumentReviewRun): string {
  const input = run.materials.filter((file) => run.agent === "solution" || file.kind === "ir");
  const findings: string[] = [];
  if (!input.length) findings.push("缺少当前 Agent 可评审的文件。");
  if (run.agent === "solution" && !input.some(({ srId }) => srId))
    findings.push("尚无 SR 方案文件，无法核对方案与需求的覆盖关系。");
  if (!input.some(({ kind }) => kind === "ir"))
    findings.push("缺少业务需求文档，需补充业务目标、范围和验收条件。");
  for (const file of input) {
    if (!file.content?.trim()) {
      findings.push(`${file.path} 缺少正文。`);
      continue;
    }
    const filename = file.path.slice(file.path.lastIndexOf("/") + 1);
    if (Object.hasOwn(AIREQ_DOCUMENT_PATHS, filename)) {
      const configured = run.documentFormats[filename as AIReqDocumentName];
      const sections =
        filename === "requirements.md"
          ? [...new Set([...configured, "目标与范围", "业务验收标准"])]
          : configured;
      for (const { heading, kind } of checkMarkdownSections(file.content, sections)) {
        findings.push(
          `${file.path} 的「${heading}」${kind === "missing" ? "章节缺失" : "缺少正文"}。`,
        );
      }
    } else if (filename === "sr-dependencies.json") {
      try {
        if (!Array.isArray(JSON.parse(file.content)?.srs))
          findings.push(`${file.path} 缺少 SR 依赖清单。`);
      } catch {
        findings.push(`${file.path} 的 JSON 无法解析。`);
      }
    }
  }
  return [
    `## ${run.title} · V${run.version}`,
    `已对 ${input.length} 份文件的接纳快照进行模拟结构检查。`,
    findings.length
      ? findings.map((finding) => `- ${finding}`).join("\n")
      : "未发现已检查的结构问题。",
  ].join("\n\n");
}
