import { describe, expect, it } from "vitest";
import { parseIdeaCsv, IdeaCsvError } from "../../packages/ui/src/aireq/ideas/idea-csv.js";

describe("idea pool CSV import", () => {
  it("preserves quoted commas, escaped quotes, multiline text and surrounding body whitespace", () => {
    const input = '\uFEFF原始需求\r\n"  导出,并提示""成功""  "\r\n"第一行\r\n第二行"';
    expect(parseIdeaCsv(input, [])).toEqual({
      texts: ['  导出,并提示"成功"  ', "第一行\r\n第二行"],
      skipped: 0,
      duplicateRows: [],
    });
  });

  it("skips blank rows and reports duplicate physical lines without dropping entries", () => {
    const existing = [" 已有需求 "];
    const input = '\n原始需求\n\n 已有需求 \n"新增\n需求"\n"新增\n需求"\n   \n';
    expect(parseIdeaCsv(input, existing)).toEqual({
      texts: [" 已有需求 ", "新增\n需求", "新增\n需求"],
      skipped: 3,
      duplicateRows: [4, 7],
    });
    expect(existing).toEqual([" 已有需求 "]);
  });

  it("accepts a header-only file as an empty preview", () => {
    expect(parseIdeaCsv("原始需求\n", [])).toEqual({
      texts: [],
      skipped: 0,
      duplicateRows: [],
    });
  });

  it.each(["", "需求\n内容", "原始需求,其他列\n内容,其他"])(
    "rejects a missing or invalid single-column header: %j",
    (input) => {
      expect(() => parseIdeaCsv(input, [])).toThrow(IdeaCsvError);
    },
  );

  it.each([
    ["原始需求\n未引用,逗号", "只允许“原始需求”一列"],
    ['原始需求\n"未闭合', "缺少结束双引号"],
    ['原始需求\n"已闭合"尾随内容', "结束引号后只能出现行尾"],
    ['原始需求\n正文"引号', "双引号必须位于单元格开头"],
  ])("rejects malformed body instead of returning a partial import: %j", (input, reason) => {
    expect(() => parseIdeaCsv(input, [])).toThrow(IdeaCsvError);
    expect(() => parseIdeaCsv(input, [])).toThrow(reason);
  });

  it("reports physical error location after a valid multiline row", () => {
    expect(() => parseIdeaCsv('原始需求\n"第一行\n第二行"\n"正常"x', [])).toThrow(
      "第 4 行，第 5 列：结束引号后只能出现行尾。",
    );
  });
});
