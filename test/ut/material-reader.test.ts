import { describe, expect, it } from "vitest";
import type {
  AIReqMaterialHistory,
  AIReqMaterialReadRequest,
  AIReqMaterialView,
} from "../../packages/services/src/aireq/index.js";
import {
  materialReadFeedback,
  readMaterialDependencies,
  readMaterialSelection,
} from "../../packages/ui/src/aireq/proposals/material-reader.js";

const projectId = "project-a";
const irId = "ir-a";
const documentPath = `docs/requirements/${irId}/requirements.md`;
const dependencyPath = `docs/requirements/${irId}/sr-dependencies.json`;
const sr = {
  id: "sr-a",
  title: "导出记录",
  documentPath: "openspec/changes/sr-a/specs/sr-a/spec.md",
};
const group = { id: irId, projectId, documentPath, proposalRound: 2 };
function file(path: string, content: string, version: string): AIReqMaterialView {
  return {
    projectId,
    irId,
    path,
    content,
    sha256: version,
    size: new TextEncoder().encode(content).length,
    valid: true,
    kind: "ir",
  };
}

function snapshot(
  materials: AIReqMaterialView[],
  metadata: Pick<AIReqMaterialHistory, "srs" | "proposalRound">,
): AIReqMaterialHistory {
  return {
    version: "previous-version",
    changedAt: "2026-11-17T00:00:00Z",
    reason: "方案变更",
    documentPath,
    materials,
    ...metadata,
  };
}

const firstIr = file(documentPath, "# 业务需求\n\n现有业务正文", "ir-before");
const currentIr = file(documentPath, "# 修订业务需求\n\n修订正文", "ir-after");
const firstSr = file(sr.documentPath, "# 导出规格\n\n现有规格", "sr-before");
const currentSr = file(sr.documentPath, "# 修订导出规格\n\n修订正文", "sr-after");

describe("material reader", () => {
  it("keeps the chosen non-default file and displays its latest version, then defaults when removed", () => {
    const choice = { path: sr.documentPath };
    expect(readMaterialSelection(group, [firstIr, firstSr], [sr], choice).material).toBe(firstSr);
    expect(readMaterialSelection(group, [currentIr, currentSr], [sr], choice).material).toBe(
      currentSr,
    );
    expect(readMaterialSelection(group, [currentIr], [], choice).material).toBe(currentIr);
  });

  it("uses the requested path, then the target SR, then the stage default and IR document", () => {
    const design = file("openspec/changes/sr-a/design.md", "# 技术方案", "design");
    const list = [firstSr, firstIr, design];
    const options = { srId: sr.id, preferDesign: true };
    expect(
      readMaterialSelection(group, list, [sr], { ...options, path: documentPath }).material,
    ).toBe(firstIr);
    expect(readMaterialSelection(group, list, [sr], options).material).toBe(firstSr);
    expect(readMaterialSelection(group, list, [sr], { preferDesign: true }).material).toBe(design);
    expect(readMaterialSelection(group, list, [sr], {}).material).toBe(firstIr);
  });

  it("keeps the chosen snapshot's names, SR identities, round and dependency reasons", () => {
    const prerequisite = {
      id: "sr-before-export",
      title: "历史前置校验",
      documentPath: "openspec/changes/sr-before-export/specs/sr-before-export/spec.md",
    };
    const raw = JSON.stringify({
      srs: [
        { srId: prerequisite.id, prerequisites: [] },
        { srId: sr.id, prerequisites: [{ srId: prerequisite.id, reason: "先检查可见范围" }] },
      ],
    });
    const previousDependency = { ...file(dependencyPath, raw, "dependency-before"), round: 1 };
    const history = snapshot([firstIr, previousDependency], {
      srs: [sr, prerequisite],
      proposalRound: 1,
    });
    const activeRows = [{ ...sr, title: "现行导出名称" }];
    const activeDependency = {
      ...file(dependencyPath, '{"srs":[]}', "dependency-after"),
      round: 2,
    };
    const display = readMaterialSelection(
      { ...group, materialHistory: [history] },
      [currentIr, currentSr, activeDependency],
      activeRows,
      { historyIndex: 0, path: dependencyPath },
    );
    expect(display.materials.map((material) => material.path)).toEqual([
      documentPath,
      dependencyPath,
    ]);
    expect(
      readMaterialDependencies(display.material!, display.rows, display.proposalRound),
    ).toEqual({
      rows: [
        { srId: prerequisite.id, title: prerequisite.title, prerequisites: [] },
        {
          srId: sr.id,
          title: sr.title,
          prerequisites: [{ srId: prerequisite.id, reason: "先检查可见范围" }],
        },
      ],
    });
  });

  it.each([
    { metadata: { srs: undefined, proposalRound: 1 }, missing: "SR 清单" },
    { metadata: { srs: [sr], proposalRound: undefined }, missing: "方案轮次" },
    { metadata: { srs: [{ ...sr, title: "" }], proposalRound: 1 }, missing: "节点名称" },
  ])(
    "shows the original dependency bytes when the snapshot lacks $missing",
    ({ metadata, missing }) => {
      const raw = ` {"srs":[{"srId":"${sr.id}","prerequisites":[]}]}\n`;
      const material = { ...file(dependencyPath, raw, "old-dependency"), round: 1 };
      const display = readMaterialSelection(
        { ...group, materialHistory: [snapshot([material], metadata)] },
        [currentIr, currentSr],
        [sr],
        { historyIndex: 0, path: dependencyPath },
      );
      expect(
        readMaterialDependencies(display.material!, display.rows, display.proposalRound),
      ).toEqual({
        raw,
        issue: expect.stringContaining(missing),
      });
    },
  );

  it("does not apply late feedback to a newer file or a different project, Release, IR or path", () => {
    const request: AIReqMaterialReadRequest = {
      projectId,
      releaseId: "r1",
      irId,
      path: documentPath,
      sha256: firstIr.sha256,
      round: 1,
    };
    const feedback = { request, message: "重新读取失败" };
    expect(materialReadFeedback({ ...request }, feedback)).toBe(feedback.message);
    for (const changed of [
      { projectId: "project-b" },
      { releaseId: "r2" },
      { irId: "ir-b" },
      { path: sr.documentPath },
      { sha256: currentIr.sha256 },
      { round: 2 },
    ]) {
      expect(materialReadFeedback({ ...request, ...changed }, feedback)).toBeUndefined();
    }
    expect(materialReadFeedback(undefined, feedback)).toBeUndefined();
  });
});
