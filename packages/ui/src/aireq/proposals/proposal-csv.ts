export interface ProposalCsvPreview {
  texts: string[];
  skipped: number;
  duplicateRows: number[];
}

/** 单列 CSV 只在未引用的行尾分行，不能把单元格换行拆成多个 IR。 */
export function parseProposalCsv(input: string, existing: readonly string[]): ProposalCsvPreview {
  const text = input.replace(/^\uFEFF/, "");
  const rows: { value: string; line: number }[] = [];
  let value = "", columns = 1, quoted = false, closed = false, started = false;
  let line = 1, column = 1, rowLine = 1;
  const fail = (message: string): never => { throw new Error(`第 ${line} 行，第 ${column} 列：${message}`); };
  const endRow = () => {
    if (columns !== 1) fail("只允许“原始需求”一列；含逗号的正文必须用双引号包围。");
    rows.push({ value, line: rowLine });
    value = ""; columns = 1; closed = false; started = false;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { value += '"'; index++; column++; }
        else { quoted = false; closed = true; }
      } else value += char;
    } else if (char === '"') {
      if (started || closed) fail("双引号必须位于单元格开头，正文中的引号需写成两个双引号。");
      quoted = true; started = true;
    } else if (char === ",") {
      columns++; started = false; closed = false;
    } else if (char === "\n" || char === "\r") {
      endRow();
      if (char === "\r" && text[index + 1] === "\n") index++;
      line++; column = 0; rowLine = line;
    } else {
      if (closed) fail("结束引号后只能出现行尾。");
      value += char; started = true;
    }
    if (quoted && char === "\n") { line++; column = 0; }
    column++;
  }
  if (quoted) fail("引用单元格缺少结束双引号。");
  if (started || closed || value || columns !== 1) endRow();
  if (rows[0]?.value !== "原始需求") throw new Error("第 1 行：表头必须为“原始需求”，且只能有一列。");
  const seen = new Set(existing);
  const result: ProposalCsvPreview = { texts: [], skipped: 0, duplicateRows: [] };
  for (const row of rows.slice(1)) {
    if (!row.value.trim()) { result.skipped++; continue; }
    if (seen.has(row.value)) result.duplicateRows.push(row.line);
    seen.add(row.value);
    result.texts.push(row.value);
  }
  return result;
}

export function downloadProposalCsv(texts: readonly string[], filename: string): void {
  const csv = "\uFEFF原始需求\r\n" + texts.map((text) => `"${text.replaceAll('"', '""')}"`).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
