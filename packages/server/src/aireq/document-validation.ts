import {
  AIREQ_DOCUMENT_PATHS,
  checkMarkdownSections,
  fileVersions,
  readSrDependencies,
  type AIReqDocumentName,
  type AIReqDocumentValidation,
} from "@zcode/services/aireq";
import { digestValue } from "./content-digest.js";
import { production } from "./production-store.js";
import { businessRule } from "./errors.js";
import { confirmationMaterialsFor } from "./document-versions.js";
import { prototypeIrRoot } from "./proposal-storage.js";
import { readPrototypeMaterial } from "./recovery.js";
import type { RequirementGroup, WorkflowState } from "./workflow-state.js";

export function validateDocumentVersion(
  state: WorkflowState,
  requirement: RequirementGroup,
  expectedSnapshot?: string,
): AIReqDocumentValidation {
  const scope = production?.zone === "yellow" ? "requirements" : "solution";
  const version = requirement.documentVersion?.number;
  const materials = confirmationMaterialsFor(state, requirement);
  // 版本号不会随同版编辑变化；快照还须绑定需求和实际文件清单。
  const snapshot = digestValue([
    scope,
    requirement.projectId,
    requirement.id,
    version,
    fileVersions(materials),
  ]);
  if (expectedSnapshot !== undefined && expectedSnapshot !== snapshot)
    throw businessRule("文档已变化，请重新检查当前版本。");
  const dependencyPath = `${prototypeIrRoot(requirement.id)}/sr-dependencies.json`;
  const required = new Map<string, { name: AIReqDocumentName; srId?: string }>();
  const basisPath =
    materials.find((file) => file.kind === "ir" && file.path.endsWith("/imports/requirements.md"))
      ?.path ?? requirement.documentPath;
  required.set(basisPath, { name: "requirements.md" });
  for (const srId of scope === "requirements" ? [] : requirement.srIds) {
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

  const files = new Map(materials.map((file) => [file.path, readPrototypeMaterial(file)]));
  const issues: AIReqDocumentValidation["issues"] = [];
  const expectedPaths = [...required.keys()];
  if (scope === "solution") expectedPaths.push(dependencyPath);
  for (const path of expectedPaths) {
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

  // 返回参与此次签字的文件，而非客户端当前正在阅读的文件。
  return {
    scope,
    version,
    snapshot,
    fileCount: files.size,
    files: materials.map(({ path, sha256, size }) => ({ path, sha256, size })),
    issues,
  };
}
