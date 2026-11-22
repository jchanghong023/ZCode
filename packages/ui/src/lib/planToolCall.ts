import { getPathLeaf, isAbsoluteFilePath, joinFilePath } from "@/lib/path.js";

export interface PlanToolCallSource {
  input?: unknown;
  inputText?: string;
  output?: unknown;
  raw?: unknown;
}

export interface PlanToolCallContent {
  markdown?: string;
  planFilePath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(
  value: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

function resolvePlanFilePath(path: string | undefined, workspacePath: string) {
  if (!path) return undefined;
  return isAbsoluteFilePath(path) ? path : joinFilePath(workspacePath, path);
}

function extractPlanMarkdown(source: unknown, workspacePath: string): PlanToolCallContent {
  if (typeof source === "string" && source.trim().length > 0) {
    return { markdown: source.trim() };
  }
  if (!isRecord(source)) return {};

  const markdown = readStringField(source, ["plan", "text", "content"]);
  const planFilePath = resolvePlanFilePath(
    readStringField(source, ["planFilePath"]),
    workspacePath,
  );
  return markdown ? { markdown, planFilePath } : {};
}

export function extractPlanToolCallContent(
  toolCall: PlanToolCallSource,
  workspacePath: string,
): PlanToolCallContent {
  const inputContent = extractPlanMarkdown(toolCall.input, workspacePath);
  if (inputContent.markdown) return inputContent;

  if (toolCall.inputText?.trim()) {
    try {
      const content = extractPlanMarkdown(JSON.parse(toolCall.inputText), workspacePath);
      if (content.markdown) return content;
    } catch {
      // 流式 inputText 可能暂时不是完整 JSON；继续走 legacy raw fallback。
    }
  }

  const outputContent = extractPlanMarkdown(toolCall.output, workspacePath);
  if (outputContent.markdown) return outputContent;

  if (!isRecord(toolCall.raw)) return {};
  for (const candidate of [toolCall.raw.rawInput, toolCall.raw.rawOutput]) {
    const content = extractPlanMarkdown(candidate, workspacePath);
    if (content.markdown) return content;
  }

  const rawContent = Array.isArray(toolCall.raw.content) ? toolCall.raw.content : [];
  for (const entry of rawContent) {
    if (!isRecord(entry)) continue;
    const nested = isRecord(entry.content) ? entry.content : entry;
    const content = extractPlanMarkdown(nested, workspacePath);
    if (content.markdown) return content;
  }
  return {};
}

export function getPlanFileLabel(planFilePath?: string): string | undefined {
  return planFilePath ? getPathLeaf(planFilePath) : undefined;
}
