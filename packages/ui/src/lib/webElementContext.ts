const WEB_ELEMENT_CONTEXT_BLOCK_TITLE = "# Web page elements:";
const MAX_MARKDOWN_FIELD_LENGTH = 8_000;

interface WebElementStyleSummary {
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  display?: string;
}

export interface WebElementContextComposerAttachment {
  id: string;
  workspacePath: string;
  workspaceIdentity?: string;
  pageUrl: string;
  pageTitle: string;
  tagName: string;
  role?: string;
  accessibleName?: string;
  selector?: string;
  xpath?: string;
  text?: string;
  nearbyText?: string;
  htmlExcerpt?: string;
  attributes?: Record<string, string>;
  rect?: { x: number; y: number; width: number; height: number };
  style?: WebElementStyleSummary;
  capturedAt: number;
  /** 历史消息中的内联引用显示为正文 token，其余显示为引用标签。 */
  inline?: boolean;
  /** 提示词中的 `## Element N` 保留原编号。 */
  ordinal: number;
}

interface ParsedWebElementContextPrompt {
  visibleContent: string;
  webElementContexts: WebElementContextComposerAttachment[];
}

export function getWebElementContextWorkspaceKey(
  workspacePath: string,
  workspaceIdentity?: string,
) {
  return workspaceIdentity?.trim() || workspacePath;
}

function truncateMarkdownValue(value: string | undefined) {
  if (!value) {
    return "";
  }

  const normalized = value.trim();
  return normalized.length > MAX_MARKDOWN_FIELD_LENGTH
    ? `${normalized.slice(0, MAX_MARKDOWN_FIELD_LENGTH)}\n\n[truncated]`
    : normalized;
}

function appendOptionalLine(lines: string[], label: string, value: string | undefined) {
  const normalized = truncateMarkdownValue(value);
  if (normalized) {
    lines.push(`${label}: ${normalized}`);
  }
}

function formatAttributes(attributes: Record<string, string> | undefined) {
  if (!attributes || Object.keys(attributes).length === 0) {
    return "";
  }

  return Object.entries(attributes)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
}

function formatFont(style: WebElementStyleSummary | undefined) {
  if (!style?.fontSize && !style?.fontFamily) {
    return "";
  }
  return [style.fontSize, style.fontFamily].filter(Boolean).join(" ");
}

function buildWebElementContextMarkdown(payload: WebElementContextComposerAttachment) {
  const lines = [
    `## Element ${payload.ordinal}`,
    // 正文里的元素 token 是 [@名称](zcode-element://id)，靠这一行对到这个元素
    ...(payload.inline ? [`Reference: zcode-element://${payload.id}`] : []),
    `URL: ${payload.pageUrl}`,
    `Title: ${payload.pageTitle || "(untitled)"}`,
    `Tag: ${payload.tagName.toLowerCase()}`,
  ];

  appendOptionalLine(lines, "Role", payload.role);
  appendOptionalLine(lines, "Accessible name", payload.accessibleName);
  appendOptionalLine(lines, "Selector", payload.selector);
  appendOptionalLine(lines, "XPath", payload.xpath);
  appendOptionalLine(lines, "Attributes", formatAttributes(payload.attributes));
  appendOptionalLine(lines, "Color", payload.style?.color);
  appendOptionalLine(lines, "Background", payload.style?.backgroundColor);
  appendOptionalLine(lines, "Font", formatFont(payload.style));
  appendOptionalLine(lines, "Font weight", payload.style?.fontWeight);
  appendOptionalLine(lines, "Display", payload.style?.display);

  if (payload.rect) {
    lines.push(
      `Rect: x=${Math.round(payload.rect.x)}, y=${Math.round(payload.rect.y)}, width=${Math.round(payload.rect.width)}, height=${Math.round(payload.rect.height)}`,
    );
  }

  const text = truncateMarkdownValue(payload.text);
  if (text) {
    lines.push("", "Text:", "```", text, "```");
  }

  const nearbyText = truncateMarkdownValue(payload.nearbyText);
  if (nearbyText) {
    lines.push("", "Nearby context:", "```", nearbyText, "```");
  }

  const htmlExcerpt = truncateMarkdownValue(payload.htmlExcerpt);
  if (htmlExcerpt) {
    lines.push("", "HTML excerpt:", "```html", htmlExcerpt, "```");
  }

  return lines.join("\n");
}

export function buildPromptWithWebElementContexts(
  text: string,
  contexts: readonly WebElementContextComposerAttachment[],
) {
  const content = text.trimEnd();
  if (contexts.length === 0) {
    return content.trim();
  }

  const contextBlock = `${WEB_ELEMENT_CONTEXT_BLOCK_TITLE}\n\n${contexts
    .map((context) => buildWebElementContextMarkdown(context))
    .join("\n\n")}`;

  return `${content}${content ? "\n\n" : ""}${contextBlock}`.trim();
}

function readField(rawItem: string, label: string) {
  const match = new RegExp(`^${label}:\\s*(.*)$`, "m").exec(rawItem);
  return match?.[1]?.trim() ?? "";
}

function readFencedSection(rawItem: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `${escapedLabel}:\\s*\\n\`\`\`(?:html)?\\n([\\s\\S]*?)\\n\`\`\``,
    "m",
  ).exec(rawItem);
  return match?.[1]?.trim() ?? "";
}

function parseFontSummary(font: string): Pick<WebElementStyleSummary, "fontFamily" | "fontSize"> {
  const match = /^([0-9.]+(?:px|rem|em|pt|%))\s+(.+)$/iu.exec(font);
  if (!match) {
    return {
      fontFamily: font,
    };
  }
  const fontSize = match[1];
  const fontFamily = match[2];
  if (!fontSize || !fontFamily) {
    return {
      fontFamily: font,
    };
  }

  return {
    fontSize,
    fontFamily,
  };
}

function readStyleSummary(rawItem: string): WebElementStyleSummary | undefined {
  const color = readField(rawItem, "Color");
  const backgroundColor = readField(rawItem, "Background");
  const font = readField(rawItem, "Font");
  const fontWeight = readField(rawItem, "Font weight");
  const display = readField(rawItem, "Display");
  const style: WebElementStyleSummary = {
    ...(color ? { color } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(font ? parseFontSummary(font) : {}),
    ...(fontWeight ? { fontWeight } : {}),
    ...(display ? { display } : {}),
  };

  return Object.keys(style).length > 0 ? style : undefined;
}

function parseElementItem(
  rawItem: string,
  index: number,
  workspacePath: string,
  workspaceIdentity?: string,
): WebElementContextComposerAttachment | null {
  const pageUrl = readField(rawItem, "URL");
  const pageTitle = readField(rawItem, "Title");
  const tagName = readField(rawItem, "Tag");

  if (!pageUrl || !tagName) {
    return null;
  }
  const ordinal = Number(/^## Element\s+(\d+)/u.exec(rawItem)?.[1] ?? index + 1);
  // 设计稿元素 token 的引用块带 Reference 行：正文里已经是 token，按原 id 还原成 inline 引用
  const referenceId = /^zcode-element:\/\/(\S+)$/u.exec(readField(rawItem, "Reference"))?.[1];

  return {
    id: referenceId ?? `parsed-web-element-${index + 1}-${tagName}`,
    ...(referenceId ? { inline: true } : {}),
    ordinal,
    workspacePath,
    ...(workspaceIdentity ? { workspaceIdentity } : {}),
    pageUrl,
    pageTitle: pageTitle === "(untitled)" ? "" : pageTitle,
    tagName,
    role: readField(rawItem, "Role") || undefined,
    accessibleName: readField(rawItem, "Accessible name") || undefined,
    selector: readField(rawItem, "Selector") || undefined,
    xpath: readField(rawItem, "XPath") || undefined,
    text: readFencedSection(rawItem, "Text") || undefined,
    nearbyText: readFencedSection(rawItem, "Nearby context") || undefined,
    htmlExcerpt: readFencedSection(rawItem, "HTML excerpt") || undefined,
    style: readStyleSummary(rawItem),
    capturedAt: 0,
  };
}

export function parsePromptWebElementContexts(
  content: string,
  options: {
    workspacePath: string;
    workspaceIdentity?: string;
  },
): ParsedWebElementContextPrompt {
  const blockMatch = /(?:^|\n\n)# Web page elements:\s*\n\n([\s\S]*?)\s*$/.exec(content);
  if (!blockMatch || blockMatch.index < 0) {
    return {
      visibleContent: content,
      webElementContexts: [],
    };
  }

  const rawBlock = blockMatch[1];
  if (rawBlock === undefined) {
    return {
      visibleContent: content,
      webElementContexts: [],
    };
  }

  const rawItems = rawBlock
    .split(/\n(?=## Element(?:\s+\d+)?\n)/)
    .map((item) => item.trim())
    .filter(Boolean);
  const webElementContexts = rawItems
    .map((item, index) =>
      parseElementItem(item, index, options.workspacePath, options.workspaceIdentity),
    )
    .filter((item): item is WebElementContextComposerAttachment => item !== null);

  if (webElementContexts.length === 0) {
    return {
      visibleContent: content,
      webElementContexts: [],
    };
  }

  return {
    visibleContent: content.slice(0, blockMatch.index).trimEnd(),
    webElementContexts,
  };
}
