import {
  AIREQ_DOCUMENT_PATHS,
  checkMarkdownSections,
  readSrDependencies,
  type AIReqDocumentName,
  type AIReqDocumentValidation,
} from "@zcode/services/aireq";
import { requirementMaterialsFor } from "./document-versions.js";
import { prototypeIrRoot } from "./proposal-storage.js";
import { readPrototypeMaterial } from "./recovery.js";
import type { RequirementGroup, WorkflowState } from "./workflow-state.js";

export function validateDocumentVersion(
  state: WorkflowState,
  requirement: RequirementGroup,
): AIReqDocumentValidation {
  const dependencyPath = `${prototypeIrRoot(requirement.id)}/sr-dependencies.json`;
  const required = new Map<string, { name: AIReqDocumentName; srId?: string }>();
  required.set(requirement.documentPath, { name: "requirements.md" });
  for (const srId of requirement.srIds) {
    for (const [name, template] of Object.entries(AIREQ_DOCUMENT_PATHS)) {
      if (name === "requirements.md") continue;
      required.set(
        template.replaceAll("<sr-id>", () => srId),
        {
          name: name as AIReqDocumentName,
          srId,
        },
      );
    }
  }

  const files = new Map(
    requirementMaterialsFor(state, requirement).map((file) => [
      file.path,
      readPrototypeMaterial(file),
    ]),
  );
  const issues: AIReqDocumentValidation["issues"] = [];
  for (const path of [...required.keys(), dependencyPath]) {
    if (!files.has(path)) {
      issues.push({
        kind: "missing",
        path,
        reason:
          path === dependencyPath && !requirement.srIds.length
            ? "请通过方案 Agent 生成至少一个 SR 及其依赖清单。"
            : "当前版本缺少此文件。",
      });
    }
  }

  for (const [path, file] of files) {
    const expected = required.get(path);
    let reason = file.error;
    if (!reason && (!file.valid || !file.content?.trim())) {
      reason = "文件无效或正文为空。";
    }
    if (!reason && path === dependencyPath) {
      reason = requirement.srIds.length
        ? readSrDependencies(requirement, file).issue
        : "依赖清单须至少包含一个 SR。";
    }
    if (!reason && expected) {
      if (file.srId !== expected.srId) {
        reason = "文件归属与路径不一致。";
      } else {
        const sections = checkMarkdownSections(file.content!, state.documentFormats[expected.name]);
        if (sections.length) {
          reason = sections
            .map(({ heading, kind }) =>
              kind === "missing" ? `缺少章节「${heading}」` : `章节「${heading}」缺少正文`,
            )
            .join("、");
        }
      }
    }
    if (reason) issues.push({ kind: "invalid", path, reason });
  }

  return { version: requirement.documentVersion?.number, fileCount: files.size, issues };
}
