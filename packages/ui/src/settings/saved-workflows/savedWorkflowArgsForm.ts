// 已保存工作流的启动实参表单。
// 纯函数：把 frontmatter 的 args 声明铺成可编辑字段，再把字段收回成实参袋；
// 校验规则与 CLI 的 validateWorkflowArgs 同源（required、按类型解析、default 回填由服务端做）。
import type { ZCodeSavedWorkflowArgType, ZCodeSavedWorkflowArgsDeclaration } from "@zcode/shared";

export interface SavedWorkflowArgField {
  name: string;
  type: ZCodeSavedWorkflowArgType;
  description?: string;
  required: boolean;
  hasDefault: boolean;
  /** 编辑器里的文本；boolean 用 "true" / "false"。 */
  value: string;
}

export type SavedWorkflowArgFieldError = "required" | "invalid_number" | "invalid_json";

/** 把一个默认值 / 已有值按类型转成编辑器文本。 */
export function formatSavedWorkflowArgValue(
  type: ZCodeSavedWorkflowArgType,
  value: unknown,
): string {
  if (value === undefined) return type === "boolean" ? "false" : "";
  switch (type) {
    case "string":
      return typeof value === "string" ? value : JSON.stringify(value);
    case "number":
      return typeof value === "number" ? String(value) : String(value);
    case "boolean":
      return value === true ? "true" : "false";
    case "json":
      return typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value, null, 2);
  }
}

/**
 * 声明 → 可编辑字段。`initialArgs` 在场时逐个字段**优先**用它的值（完成卡「再次运行」把这次
 * run 跑过的那一份实参预填进来，docs/dynamic-workflow/transcript-and-notifications.md「Run again」）：
 * 上一次跑成了什么，下一次多半还要跑什么。声明里没有的键不进表单——表单的形状由声明决定，
 * 一份旧实参不该凭空长出字段。
 */
export function buildSavedWorkflowArgFields(
  declaration: ZCodeSavedWorkflowArgsDeclaration | undefined,
  initialArgs?: Record<string, unknown>,
): SavedWorkflowArgField[] {
  if (!declaration) return [];
  return Object.entries(declaration).map(([name, spec]) => {
    const initial = initialArgs?.[name];
    return {
      name,
      type: spec.type,
      ...(spec.description === undefined ? {} : { description: spec.description }),
      required: spec.required === true,
      hasDefault: spec.default !== undefined,
      value: formatSavedWorkflowArgValue(spec.type, initial === undefined ? spec.default : initial),
    };
  });
}

type SavedWorkflowArgParse =
  | { ok: true; omitted: true }
  | { ok: true; omitted: false; value: unknown }
  | { ok: false; error: SavedWorkflowArgFieldError };

/**
 * 单个字段 → 实参值。空文本对 string / number / json 意味着「不传」：有默认值的由服务端回填，
 * 无默认值又非必填的就是缺席；必填而空是唯一的 required 错误。boolean 永远有值。
 */
export function parseSavedWorkflowArgField(field: SavedWorkflowArgField): SavedWorkflowArgParse {
  const raw = field.value;
  if (field.type === "boolean") {
    return { ok: true, omitted: false, value: raw === "true" };
  }
  if (raw.trim().length === 0) {
    if (field.required && !field.hasDefault) return { ok: false, error: "required" };
    return { ok: true, omitted: true };
  }
  switch (field.type) {
    case "string":
      return { ok: true, omitted: false, value: raw };
    case "number": {
      const parsed = Number(raw.trim());
      // NaN / Infinity 过不了 JSON，也过不了 CLI 的 number 校验；在这里就拦下来。
      if (!Number.isFinite(parsed)) return { ok: false, error: "invalid_number" };
      return { ok: true, omitted: false, value: parsed };
    }
    case "json": {
      try {
        return { ok: true, omitted: false, value: JSON.parse(raw) as unknown };
      } catch {
        return { ok: false, error: "invalid_json" };
      }
    }
  }
}

type SavedWorkflowArgsCollect =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; errors: Record<string, SavedWorkflowArgFieldError> };

/** 整张表单 → 实参袋；一次收齐全部错误（照 validateWorkflowArgs 的「不逐个报」）。 */
export function collectSavedWorkflowArgs(
  fields: readonly SavedWorkflowArgField[],
): SavedWorkflowArgsCollect {
  const args: Record<string, unknown> = {};
  const errors: Record<string, SavedWorkflowArgFieldError> = {};
  for (const field of fields) {
    const parsed = parseSavedWorkflowArgField(field);
    if (!parsed.ok) {
      errors[field.name] = parsed.error;
      continue;
    }
    if (!parsed.omitted) args[field.name] = parsed.value;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, args };
}
