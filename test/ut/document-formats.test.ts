import { describe, expect, it } from "vitest";
import { checkMarkdownSections } from "../../packages/services/src/aireq/index.js";

const rules = ["目标与范围", "验收标准", "风险"];

describe("business document section rules", () => {
  it("matches the entire heading and accepts sections in any order", () => {
    const document =
      "\uFEFF# 导出\r\n\r\n## 风险 ##\r\n旧表格中的引号。\r\n\r\n" +
      "目标与范围\r\n--------\r\n导出同一版本原文。\r\n\r\n## 验收标准\r\n重复解析后的内容一致。";
    expect(checkMarkdownSections(document, rules)).toEqual([]);
    expect(
      checkMarkdownSections(document.replace("## 验收标准", "## 验收标准示例"), rules),
    ).toEqual([{ heading: "验收标准", kind: "missing" }]);
  });

  it("ignores headings inside code blocks and reports a heading-only section as empty", () => {
    const document = [
      "# 导出",
      "````markdown",
      "## 目标与范围",
      "```",
      "## 风险",
      "````",
      "",
      "~~~ example",
      "## 风险",
      "~~~",
      "",
      "    ## 目标与范围",
      "",
      "## 验收标准",
      "",
      "### 成功场景",
      "",
      "## 附录",
      "与验收章节无关。",
    ].join("\n");
    expect(checkMarkdownSections(document, rules)).toEqual([
      { heading: "目标与范围", kind: "missing" },
      { heading: "验收标准", kind: "empty" },
      { heading: "风险", kind: "missing" },
    ]);
  });

  it("accepts a correction with actual body and does not impose headings on an empty rule list", () => {
    const document =
      "## 验收标准\n\n## 附录\n待确认。\n\n## 验收标准\n\n### 场景\n导出后重新解析。";
    expect(checkMarkdownSections(document, ["验收标准"])).toEqual([]);
    expect(checkMarkdownSections("短文档，无章节。", [])).toEqual([]);
  });
});
