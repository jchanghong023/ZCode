export const AIREQ_DOCUMENT_PATHS = {
  "requirements.md": "docs/requirements/<ir-id>/requirements.md",
  "proposal.md": "openspec/changes/<sr-id>/proposal.md",
  "design.md": "openspec/changes/<sr-id>/design.md",
  "tasks.md": "openspec/changes/<sr-id>/tasks.md",
  "test-plan.md": "openspec/changes/<sr-id>/test-plan.md",
  "spec.md": "openspec/changes/<sr-id>/specs/<sr-id>/spec.md",
} as const;

export type AIReqDocumentName = keyof typeof AIREQ_DOCUMENT_PATHS;
export type AIReqDocumentFormats = Record<AIReqDocumentName, string[]>;
type AIReqMarkdownSectionIssue = { heading: string; kind: "missing" | "empty" };

type Heading = { level: number; title: string };

/** Yield headings and nonempty body, excluding fence delimiters. */
function* markdownBlocks(content: string): Generator<Heading | null> {
  let fence: string | undefined;
  const lines = content.replace(/^\uFEFF/, "").split(/\r\n?|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        marker &&
        marker[1]![0] === fence[0] &&
        marker[1]!.length >= fence.length &&
        !marker[2]!.trim()
      ) {
        fence = undefined;
      } else if (line.trim()) {
        yield null;
      }
      continue;
    }
    if (marker && (marker[1]![0] === "~" || !marker[2]!.includes("`"))) {
      fence = marker[1];
      continue;
    }
    const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)/.exec(line);
    if (atx) {
      yield {
        level: atx[1]!.length,
        title: (atx[2] ?? "").replace(/(?:^|[ \t]+)#+[ \t]*$/, "").trim(),
      };
      continue;
    }
    if (!line.trim()) continue;
    const setext =
      /^ {0,3}[^ \t#>]/.test(line) && !/^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]/.test(line)
        ? /^ {0,3}(=+|-+)[ \t]*$/.exec(lines[i + 1] ?? "")
        : null;
    if (setext) {
      yield { level: setext[1]![0] === "=" ? 1 : 2, title: line.trim() };
      i++;
    } else {
      yield null;
    }
  }
}

/** Check the whole heading and distinguish a missing section from one with no body. */
export function checkMarkdownSections(
  content: string,
  required: readonly string[],
): AIReqMarkdownSectionIssue[] {
  if (!required.length) return [];
  const headings = new Map<string, AIReqMarkdownSectionIssue["kind"] | "present">();
  for (const title of required) headings.set(title, "missing");
  const active: Heading[] = [];
  for (const block of markdownBlocks(content)) {
    if (block) {
      while (active.length && active[active.length - 1]!.level >= block.level) active.pop();
      active.push(block);
      if (headings.get(block.title) === "missing") headings.set(block.title, "empty");
    } else {
      for (const { title } of active) if (headings.has(title)) headings.set(title, "present");
    }
  }
  return [...headings].flatMap(([heading, kind]) =>
    kind === "present" ? [] : [{ heading, kind }],
  );
}
