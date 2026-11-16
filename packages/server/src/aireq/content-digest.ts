import { createHash } from "node:crypto";
import type { AIReqFileVersion, AIReqRequirementSnapshot } from "@zcode/services/aireq";

/** 只校验已持有的内容字节，不宣称读取或核验了外部文件、代码或仓库。 */
export function contentVersion(content: string): Pick<AIReqFileVersion, "sha256" | "size"> {
  const bytes = new TextEncoder().encode(content);
  return { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength };
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, nested]) => [key, canonicalValue(nested)]),
  );
}

/** 对象键按字典序排列、数组保留顺序；摘要不公开请求正文。 */
export function digestValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)))
    .digest("hex");
}

export function createRequirementSnapshot(
  snapshot: Omit<AIReqRequirementSnapshot, "digest">,
): AIReqRequirementSnapshot {
  return { ...snapshot, digest: digestValue(snapshot) };
}
