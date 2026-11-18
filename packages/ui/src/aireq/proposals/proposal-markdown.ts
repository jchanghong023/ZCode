import { firstMarkdownTitle } from "../contract.js";

/** 只为导入表单提供可编辑的短需求建议，不从文档推断 SR、批准或业务事实。 */
export function businessDocumentRequest(filename: string, content: string): string {
  return firstMarkdownTitle(content) ?? filename.replace(/\.(?:md|markdown)$/i, "");
}

/** Markdown 导出保留服务端当前正文，包括 BOM、换行和末尾空白，不拼接其他材料。 */
export function downloadBusinessDocument(content: string, irId: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${irId.replace(/[^a-zA-Z0-9_-]/g, "_")}-requirements.md`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
