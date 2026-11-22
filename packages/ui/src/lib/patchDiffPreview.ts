const MAX_PLAIN_TEXT_FALLBACK_RENDER_LINES = 800;
// 这里不能直接拼接展示文案，否则 lib 层会把英文硬编码带进 UI，破坏国际化。
// 改成内部 marker token，真正展示文案在组件层走 intl 渲染。
const FALLBACK_TRUNCATED_MARKER_PREFIX = "\\ __ZCODE_DIFF_TRUNCATED__:";
const FALLBACK_TRUNCATED_MARKER_REGEX = /^\\ __ZCODE_DIFF_TRUNCATED__:(\d+)$/;

function buildTruncatedMarkerLine(omittedLineCount: number): string {
  return `${FALLBACK_TRUNCATED_MARKER_PREFIX}${omittedLineCount}`;
}

export function countPatchFileDiffs(patch: string): number {
  const lines = patch.split(/\r?\n/);
  const gitDiffHeaderCount = lines.filter((line) => line.startsWith("diff --git ")).length;
  if (gitDiffHeaderCount > 0) {
    return gitDiffHeaderCount;
  }

  const parseHunkRange = (line: string): { oldLines: number; newLines: number } | null => {
    const match = line.match(/^@@\s-\d+(?:,(\d+))?\s\+\d+(?:,(\d+))?\s@@/);
    if (!match) {
      return null;
    }
    return {
      oldLines: Number(match[1] ?? "1"),
      newLines: Number(match[2] ?? "1"),
    };
  };

  const isFileHeaderPair = (index: number): boolean => {
    return (
      (lines[index]?.startsWith("--- ") ?? false) && (lines[index + 1]?.startsWith("+++ ") ?? false)
    );
  };

  const consumeHunkBody = (start: number, oldLines: number, newLines: number): number | null => {
    let cursor = start;
    let remainingOld = oldLines;
    let remainingNew = newLines;

    while (remainingOld > 0 || remainingNew > 0) {
      const line = lines[cursor];
      if (line === undefined) {
        return null;
      }

      // 没有 `diff --git` 前缀的多文件 patch 里，
      // 下一个文件头是 `--- a/x` 紧跟 `+++ b/x`。这两行恰好以 `-` / `+` 开头，
      // 把它们当成当前 hunk 的删除/新增行消费掉的话——当模型把 hunk 头的行数
      // 写得比正文多（LLM 常见的 off-by-one）时，多出的配额正好"吃掉"下一文件头，
      // 后续 `@@` 又被当成同一文件的下一个 hunk，导致多文件 patch 被误计为单文件。
      // 这里在消费正文时先探测完整的 `---`/`+++` 文件头对：一旦遇到就提前结束当前 hunk，
      // 把控制权交还外层循环去识别新文件，而不是把文件头并进正文。
      if (isFileHeaderPair(cursor)) {
        return cursor;
      }

      if (line.startsWith("\\ ")) {
        cursor += 1;
        continue;
      }

      if (line.startsWith(" ")) {
        remainingOld -= 1;
        remainingNew -= 1;
      } else if (line.startsWith("-")) {
        remainingOld -= 1;
      } else if (line.startsWith("+")) {
        remainingNew -= 1;
      } else {
        return null;
      }

      if (remainingOld < 0 || remainingNew < 0) {
        return null;
      }
      cursor += 1;
    }

    while (lines[cursor]?.startsWith("\\ ")) {
      cursor += 1;
    }
    return cursor;
  };

  let diffCount = 0;
  let cursor = 0;

  while (cursor < lines.length) {
    const oldHeader = lines[cursor];
    const newHeader = lines[cursor + 1];
    if (!oldHeader?.startsWith("--- ") || !newHeader?.startsWith("+++ ")) {
      cursor += 1;
      continue;
    }

    let hunkCursor = cursor + 2;
    let hasHunk = false;
    let sawHunkHeader = false;

    while (hunkCursor < lines.length) {
      const hunkRange = parseHunkRange(lines[hunkCursor] ?? "");
      if (!hunkRange) {
        break;
      }
      sawHunkHeader = true;

      const nextCursor = consumeHunkBody(hunkCursor + 1, hunkRange.oldLines, hunkRange.newLines);
      if (nextCursor === null) {
        break;
      }

      hasHunk = true;
      hunkCursor = nextCursor;
    }

    if (!hasHunk && !sawHunkHeader) {
      cursor += 1;
      continue;
    }

    // hunk 正文允许出现以 `---` / `+++` 开头的真实文本行，
    // 不能仅按 `---/+++` 生数；但当出现 hunk 头后正文被截断时，也应保守按“有一个文件 diff”计数。
    // 这里按 hunk 头声明的行数消费正文，只把成功解析出 hunk 的 `---/+++` 对识别成文件头，
    // 并在截断场景下保守计数，避免把多文件 patch 误判成单文件。
    diffCount += 1;
    cursor = hasHunk ? hunkCursor : cursor + 2;
  }

  return diffCount;
}

export function parseTruncatedMarkerOmittedLineCount(line: string): number | null {
  const markerMatch = FALLBACK_TRUNCATED_MARKER_REGEX.exec(line);
  if (!markerMatch) {
    return null;
  }

  const omittedLineCount = Number.parseInt(markerMatch[1] ?? "", 10);
  if (!Number.isFinite(omittedLineCount) || omittedLineCount <= 0) {
    return null;
  }

  return omittedLineCount;
}

export function getPatchPreviewLineContent(line: string): string {
  if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) {
    return line.slice(1);
  }

  return line;
}

function isPatchHunkHeaderLine(line: string): boolean {
  return line === "@@" || line.startsWith("@@ ");
}

function limitPlainTextPreviewLines(lines: readonly string[]): string[] {
  if (lines.length <= MAX_PLAIN_TEXT_FALLBACK_RENDER_LINES) {
    return [...lines];
  }

  const keepCount = MAX_PLAIN_TEXT_FALLBACK_RENDER_LINES - 1;
  const headCount = Math.ceil(keepCount / 2);
  const tailCount = keepCount - headCount;
  const omittedCount = lines.length - keepCount;

  return [
    ...lines.slice(0, headCount),
    buildTruncatedMarkerLine(omittedCount),
    ...lines.slice(lines.length - tailCount),
  ];
}

function collectPatchMetadataPreviewLines(lines: readonly string[]): string[] {
  return lines.filter((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return false;
    }

    return (
      !line.startsWith("diff --git ") &&
      !line.startsWith("index ") &&
      !line.startsWith("--- ") &&
      !line.startsWith("+++ ")
    );
  });
}

function collectPlainTextPreviewLines(lines: readonly string[]): string[] {
  const previewLines: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (!inHunk) {
      if (isPatchHunkHeaderLine(line)) {
        inHunk = true;
      }
      continue;
    }

    // 之前直接按 `+++ / --- / @@` 前缀过滤，
    // 会把正文里真实存在的 `++ ` / `-- ` 行误删。
    // 这里改成只跳过 hunk 头本身；一旦进入 hunk，后续内容全部原样保留。
    if (isPatchHunkHeaderLine(line)) {
      continue;
    }

    previewLines.push(line);
  }

  if (inHunk || previewLines.length > 0) {
    return previewLines;
  }

  // rename-only / mode-only 这类 Git patch 没有 @@ hunk，
  // 但仍然有用户需要看的变更信息。之前会继续交给 PatchDiff，
  // 打包后部分文件展开会变成空白；这里保留元信息走轻量 fallback。
  return collectPatchMetadataPreviewLines(lines);
}

function normalizePlainTextPreviewLines(lines: readonly string[]): string[] {
  const normalizedLines = limitPlainTextPreviewLines(lines);

  // fallback 的目标是保住可读性和交互性，不需要继续暴露 `---/+++ / @@` 这些协议头。
  while (normalizedLines.length > 0 && normalizedLines.at(-1) === "") {
    normalizedLines.pop();
  }

  return normalizedLines.length > 0 ? normalizedLines : [""];
}

export function getPlainTextPatchPreviewLines(patch: string): string[] {
  return normalizePlainTextPreviewLines(getPlainTextPatchContentLines(patch));
}

export function getPlainTextPatchContentLines(patch: string): string[] {
  return collectPlainTextPreviewLines(patch.split(/\r?\n/));
}

