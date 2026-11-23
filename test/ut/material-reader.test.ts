import { describe, expect, it } from "vitest";
import {
  readSrDependencies,
  type AIReqDocumentSnapshot,
  type AIReqMaterialView,
} from "../../packages/services/src/aireq/index.js";
import {
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
  projectId,
  irId,
};
const group = { id: irId, projectId, documentPath, documentHistory: [] };
function file(path: string, content: string, hash: string): AIReqMaterialView {
  return {
    projectId,
    irId,
    path,
    content,
    sha256: hash,
    size: new TextEncoder().encode(content).length,
    valid: true,
    kind: "ir",
  };
}
function snapshot(
  materials: AIReqMaterialView[],
  srs: AIReqDocumentSnapshot["srs"],
): AIReqDocumentSnapshot {
  return {
    number: 1,
    confirmation: { employeeId: "s00000003", confirmedAt: "2026-11-17T00:00:00Z" },
    materials,
    srs,
  };
}

const firstIr = file(documentPath, "# 业务需求\n\n现有业务正文", "ir-before");
const currentIr = file(documentPath, "# 修订业务需求\n\n修订正文", "ir-after");
const firstSr = file(sr.documentPath, "# 导出规格\n\n现有规格", "sr-before");
const currentSr = file(sr.documentPath, "# 修订导出规格\n\n修订正文", "sr-after");

describe("material reader", () => {
  it("defaults to the latest material and keeps the user's file choice across updates", () => {
    const choice = { path: sr.documentPath };
    const target = { ...group, documentHistory: [snapshot([firstIr, firstSr], [sr])] };
    expect(readMaterialSelection(target, [currentIr, currentSr], [sr], {}).material).toBe(
      currentIr,
    );
    expect(readMaterialSelection(target, [firstIr, firstSr], [sr], choice).material).toBe(firstSr);
    expect(readMaterialSelection(target, [currentIr, currentSr], [sr], choice).material).toBe(
      currentSr,
    );
    expect(readMaterialSelection(target, [currentIr], [], choice).material).toBe(currentIr);
  });

  it("opens technical design in the solution workspace and preserves explicit file choices", () => {
    const design = {
      ...file("openspec/changes/sr-a/design.md", "# 技术方案", "design"),
      srId: sr.id,
    };
    const otherDesign = {
      ...file("openspec/changes/sr-b/design.md", "# 其他技术方案", "other-design"),
      srId: "sr-b",
    };
    const srFile = { ...firstSr, srId: sr.id };
    const list = [srFile, firstIr, otherDesign, design];
    const options = { srId: sr.id, preferDesign: true };
    expect(
      readMaterialSelection(group, list, [sr], { ...options, path: documentPath }).material,
    ).toBe(firstIr);
    expect(readMaterialSelection(group, list, [sr], options).material).toBe(design);
    expect(
      readMaterialSelection(group, [firstIr, srFile], [sr], { preferDesign: true }).material,
    ).toBe(srFile);
    expect(readMaterialSelection(group, [firstIr], [], { preferDesign: true }).material).toBe(
      firstIr,
    );
    expect(readMaterialSelection(group, list, [sr], {}).material).toBe(firstIr);
  });

  it("keeps the historical version's files, confirmation and original SR names and dependencies", () => {
    const prerequisite = { ...sr, id: "sr-before-export", title: "历史前置校验" };
    const raw = JSON.stringify({
      srs: [
        { srId: prerequisite.id, prerequisites: [] },
        { srId: sr.id, prerequisites: [{ srId: prerequisite.id, reason: "先检查可见范围" }] },
      ],
    });
    const history = snapshot(
      [firstIr, file(dependencyPath, raw, "dependency-before")],
      [sr, prerequisite],
    );
    const activeRows = [{ ...sr, title: "现行导出名称" }];
    const currentFiles = [
      currentIr,
      currentSr,
      file(dependencyPath, '{"srs":[]}', "dependency-after"),
    ];
    const target = { ...group, documentHistory: [history] };
    const display = readMaterialSelection(target, currentFiles, activeRows, {
      version: 1,
      path: dependencyPath,
    });
    expect(display.historical?.confirmation).toEqual(history.confirmation);
    expect(display.materials).toEqual(history.materials);
    expect(readMaterialDependencies(display.material!, display.rows)).toEqual({
      rows: [
        { srId: prerequisite.id, title: prerequisite.title, prerequisites: [] },
        {
          srId: sr.id,
          title: sr.title,
          prerequisites: [{ srId: prerequisite.id, reason: "先检查可见范围" }],
        },
      ],
    });
    expect(
      readMaterialSelection(target, currentFiles, activeRows, { version: 3 }).material,
    ).toBeUndefined();
  });

  it("excludes material from another project or requirement even if paths match", () => {
    const others = [
      { ...currentIr, projectId: "project-b", content: "其他项目" },
      { ...currentSr, irId: "ir-b", content: "其他需求" },
    ];
    const display = readMaterialSelection(group, [...others, currentIr], [sr], {
      path: currentSr.path,
    });
    expect(display.materials).toEqual([currentIr]);
    expect(display.material).toEqual(currentIr);
  });

  it("shows the dependency file's raw bytes when the historical SR has no name", () => {
    const raw = ` {"srs":[{"srId":"${sr.id}","prerequisites":[]}]}\n`;
    const material = file(dependencyPath, raw, "old-dependency");
    expect(readMaterialDependencies(material, [{ ...sr, title: "" }])).toEqual({
      raw,
      issue: expect.stringContaining("节点名称"),
    });
  });
});

describe("SR dependency files", () => {
  it("requires an acyclic dependency graph and preserves the original dependency reasons", () => {
    const prerequisites = [{ srId: "sr-b", reason: "复用导出前的校验结果。" }];
    const estimate = { workingDays: 2, assumptions: "复用现有接口。" };
    const rows = [
      { srId: sr.id, estimate, prerequisites },
      { srId: "sr-b", estimate, prerequisites: [] },
    ];
    const target = { id: irId, srIds: [sr.id, "sr-b"] };
    const cyclic = [
      rows[0],
      { ...rows[1], prerequisites: [{ srId: sr.id, reason: "读取导出结果。" }] },
    ];
    expect(
      readSrDependencies(target, file(dependencyPath, JSON.stringify({ srs: cyclic }), "cycle")),
    ).toMatchObject({
      issue: expect.stringMatching(/循环|成环/),
    });
    expect(
      readSrDependencies(target, file(dependencyPath, JSON.stringify({ srs: rows }), "valid")),
    ).toEqual({
      document: { srs: rows },
    });
  });
});
