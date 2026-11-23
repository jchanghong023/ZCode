import { describe, expect, it } from "vitest";
import { connectST, unique, type STClient } from "./client.js";
import { config, requireConfig } from "./config.js";
import { createProject, createProposal } from "./business.js";
import {
  completeBusinessMaterial,
  completeSolutionMaterial,
  discuss,
  expectBusinessRejection,
  getMaterials,
  getProposal,
  proposalSelection,
  reviewDocuments,
} from "./proposal-flow.js";

async function withClient(run: (client: STClient) => Promise<void>) {
  const client = await connectST();
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

describe("co-creation document versions through the public API", () => {
  it(
    "should create and import independent proposals without generating documents or splitting SRs",
    async () => {
      await withClient(async (client) => {
        const project = await createProject(client);
        const baseline = await client.read(project.selection);
        const originalTexts = [
          unique("CSV export with quoted newlines"),
          unique("A separate searchable requirement"),
        ];
        const result = await client.command(
          {
            type: "importProposals",
            releaseId: project.releaseId,
            proposals: originalTexts.map((originalText) => ({ originalText })),
          },
          project.selection,
        );
        expect(result.receipt.status, result.receipt.error).toBe("completed");
        const read = await client.read(project.selection);
        const imported = read.view.requirements.filter((group) =>
          originalTexts.includes(group.originalText),
        );
        expect(imported).toHaveLength(2);
        expect(new Set(imported.map((group) => group.id)).size).toBe(2);
        for (const group of imported) {
          expect(group).toMatchObject({
            projectId: project.projectId,
            releaseId: project.releaseId,
            submittedBy: client.identity.employeeId,
          });
          expect(group.originalText).toBe(
            originalTexts.find((text) => text === group.originalText),
          );
          expect(group.srIds).toEqual([]);
          expect(group.files).toEqual([]);
          expect(group.documentVersion).toBeUndefined();
          expect(group.documentHistory).toEqual([]);
          expect(group.documentReviews).toEqual([]);
        }
        expect(read.view.srs).toEqual(baseline.view.srs);
        const stable = await client.read(project.selection);
        expect(stable.view.revision).toBe(read.view.revision);
        expect(stable.view.requirements).toEqual(read.view.requirements);

        const mustNotExist = unique("should not survive an invalid batch");
        await expectBusinessRejection(
          client.command(
            {
              type: "importProposals",
              releaseId: project.releaseId,
              proposals: [{ originalText: mustNotExist }, { originalText: "   " }],
            },
            project.selection,
          ),
        );
        const refused = await client.read(project.selection);
        expect(refused.view.requirements).toEqual(read.view.requirements);
        expect(refused.view.requirements.some((group) => group.originalText === mustNotExist)).toBe(
          false,
        );
        expect(refused.view.revision).toBe(read.view.revision);
        const action = {
          type: "createProposal" as const,
          projectId: project.projectId,
          releaseId: project.releaseId,
          originalText: unique("可重试的草稿"),
          clientDraftId: unique("browser-draft"),
        };
        const created = await client.command(action, project.selection);
        const repeated = await client.command(action, project.selection);
        expect(repeated.receipt.operationId).not.toBe(created.receipt.operationId);
        expect(repeated.irId).toBe(created.irId);
        const drafts = (await client.read(project.selection)).view.requirements.filter(
          (group) => group.originalText === action.originalText,
        );
        expect(drafts.map((group) => group.id)).toEqual([created.irId]);
        expect(drafts[0]).not.toHaveProperty("clientDraftId");
      });
    },
    config.timeoutMs,
  );

  it(
    "retains Markdown import bytes and uses saved document headings in optional review",
    async () => {
      await withClient(async (client) => {
        const original = (await client.read()).view.documentFormats;
        expect(Object.keys(original).sort()).toEqual([
          "design.md",
          "proposal.md",
          "requirements.md",
          "spec.md",
          "tasks.md",
          "test-plan.md",
        ]);
        const formats = { ...original, "requirements.md": ["数据范围", "验收方式"] };
        const baseline = (await client.read()).view.revision;
        const saved = await client.command({
          type: "saveDocumentFormats",
          documentFormats: formats,
          expectedRevision: baseline,
        });
        expect(saved.receipt.status, saved.receipt.error).toBe("completed");
        try {
          expect(saved.documentFormatSnapshot).toEqual({
            documentFormats: formats,
            revision: saved.receipt.revision,
          });
          const project = await createProject(client);
          const originalText = unique("导入业务需求原文");
          const businessDocument = [
            "# CSV 导出",
            "## 数据范围示例",
            "这是名字相近的正文标题。",
            "```md\n## 数据范围\n这是代码块中的示例。\n```",
            "## 验收方式",
          ].join("\n\n");
          const result = await client.command(
            {
              type: "importProposals",
              releaseId: project.releaseId,
              proposals: [{ originalText, businessDocument }],
            },
            project.selection,
          );
          expect(result.receipt.status, result.receipt.error).toBe("completed");
          const imported = requireConfig(
            (await client.read(project.selection)).view.requirements.find(
              (group) => group.originalText === originalText,
            ),
            "导入的 Markdown 需求",
          );
          const target = { ...project, irId: imported.id };
          const selection = proposalSelection(target);
          const [material] = getMaterials(await client.read(selection), target);
          expect(imported.documentVersion).toEqual({ number: 1 });
          expect(material).toMatchObject({
            path: imported.documentPath,
            content: businessDocument,
          });
          const admin = await connectST("y00000000");
          try {
            expect(
              (await admin.call("validateDocumentVersion", [selection])).issues,
            ).toContainEqual({
              kind: "invalid",
              path: imported.documentPath,
              reason: "缺少章节「数据范围」、章节「验收方式」缺少正文",
            });
          } finally {
            await admin.close();
          }
          const { review: incomplete } = await reviewDocuments(client, target, "requirements");
          expect(incomplete.report).toContain("数据范围");
          expect(incomplete.report).toContain("验收方式");
          await discuss(
            client,
            target,
            "## 数据范围\n只导出当前项目与 Release 的需求原文。\n\n" +
              "## 验收方式\n重新解析 CSV 并逐条比较需求内容。",
          );
          const repaired = await client.read(selection);
          expect(getProposal(repaired, target).documentVersion).toEqual({ number: 1 });
          expect(getMaterials(repaired, target)[0]).toMatchObject({
            path: imported.documentPath,
            content: expect.stringContaining("重新解析 CSV 并逐条比较需求内容。"),
          });
          const { review: reviewed } = await reviewDocuments(client, target, "requirements");
          expect(reviewed.report).not.toMatch(/(?:数据范围|验收方式)[^\n]*(?:缺失|缺少)/u);
        } finally {
          const current = await client.read();
          expect(current.view.documentFormats).toEqual(formats);
          const restored = await client.command({
            type: "saveDocumentFormats",
            documentFormats: original,
            expectedRevision: current.view.revision,
          });
          expect(restored.receipt.status, restored.receipt.error).toBe("completed");
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "updates V1 until a single confirmation fixes all documents and preserves them after V2 starts",
    async () => {
      await withClient(async (business) => {
        const developer = await connectST(config.otherEmployeeId);
        const tester = await connectST(config.testerEmployeeId);
        const admin = await connectST("y00000000");
        try {
          expect(
            new Set([business, developer, tester, admin].map((actor) => actor.identity.employeeId))
              .size,
          ).toBe(4);
          const target = await createProposal(business);
          for (const [actor, role] of [
            [developer, "development"],
            [tester, "testing"],
          ] as const) {
            const result = await admin.command(
              {
                type: "addProjectRoleMember",
                projectId: target.projectId,
                employeeId: actor.identity.employeeId,
                role,
              },
              target.selection,
            );
            expect(result.receipt.status, result.receipt.error).toBe("completed");
          }
          const selection = proposalSelection(target);
          const action = {
            type: "confirmDocumentVersion",
            ...selection,
            expectedRevision: target.remote.view.revision,
            operationId: unique("confirm-v1"),
          } as const;
          const release = ({ view }: typeof target.remote) =>
            view.releases.find(
              ({ projectId, id }) => projectId === target.projectId && id === target.releaseId,
            );
          expect(getProposal(target.remote, target).documentVersion).toBeUndefined();
          expect(release(target.remote)).toMatchObject({
            requirementCount: 1,
            confirmedRequirementCount: 0,
          });
          await expect(business.call("validateDocumentVersion", [selection])).rejects.toThrow();
          await expectBusinessRejection(
            tester.command({ ...action, operationId: unique("confirm-empty") }, selection),
          );
          const v1 = await completeBusinessMaterial(business, target);
          expect(getProposal(v1, target)).toMatchObject({
            documentVersion: { number: 1 },
            documentHistory: [],
            documentReviews: [],
          });
          expect(getProposal(v1, target).documentVersion?.confirmation).toBeUndefined();
          expect(await tester.call("validateDocumentVersion", [selection])).toMatchObject({
            version: 1,
            fileCount: 1,
            issues: [{ kind: "missing", path: expect.stringMatching(/sr-dependencies\.json$/) }],
          });
          const solution = await completeSolutionMaterial(developer, target);
          const solutionGroup = getProposal(solution, target);
          expect(solutionGroup.documentVersion).toEqual({ number: 1 });
          expect(solutionGroup.documentReviews).toEqual([]);
          expect(getMaterials(solution, target).length).toBeGreaterThan(
            getMaterials(v1, target).length,
          );

          const v1Addition = "## 验收补充\n下载错误后可重试，原始需求保持原样。";
          await discuss(business, target, v1Addition);
          const latest = await tester.read(selection);
          expect(getProposal(latest, target).documentVersion).toEqual({ number: 1 });
          const files = getMaterials(latest, target);
          expect(files.find((file) => file.path === solutionGroup.documentPath)?.content).toContain(
            v1Addition,
          );
          expect(latest.view.revision).toBeGreaterThan(action.expectedRevision);
          await expectBusinessRejection(
            business.command({ ...action, operationId: unique("unauthorised-confirm") }, selection),
          );
          expect(await tester.call("validateDocumentVersion", [selection])).toEqual({
            version: 1,
            fileCount: files.length,
            issues: [],
          });
          expect((await tester.read(selection)).view.revision).toBe(latest.view.revision);

          const confirmed = await tester.command(action, selection);
          expect(confirmed.receipt).toMatchObject({ status: "completed", irId: target.irId });
          expect(await tester.command(action, selection)).toEqual(confirmed);
          const saved = await business.read(selection);
          expect(release(saved)).toMatchObject({
            requirementCount: 1,
            confirmedRequirementCount: 1,
          });
          const confirmedGroup = getProposal(saved, target);
          expect(confirmedGroup.documentVersion).toMatchObject({
            number: 1,
            confirmation: {
              employeeId: tester.identity.employeeId,
              confirmedAt: expect.any(String),
            },
          });
          const confirmation = confirmedGroup.documentVersion!.confirmation!;
          expect(Number.isFinite(Date.parse(confirmation.confirmedAt))).toBe(true);
          expect(confirmed.receipt.actorEmployeeId).toBe(confirmation.employeeId);
          expect(getMaterials(saved, target)).toEqual(files);
          expect(confirmedGroup.documentHistory).toEqual([]);
          expect(confirmedGroup.documentReviews).toEqual([]);

          const v2Addition = "## 新增验收\n高亮区分空数据和请求失败。";
          await discuss(business, target, v2Addition);
          const latestV2 = await business.read(selection);
          expect(release(latestV2)).toMatchObject({
            requirementCount: 1,
            confirmedRequirementCount: 0,
          });
          const v2 = getProposal(latestV2, target);
          expect(v2.documentVersion).toEqual({ number: 2 });
          const originalSnapshot = {
            number: 1,
            confirmation,
            materials: files,
            srs: saved.view.srs.filter(({ irId }) => irId === target.irId),
          };
          expect(v2.documentHistory).toHaveLength(1);
          expect(v2.documentHistory[0]).toMatchObject({
            ...originalSnapshot,
            materials: expect.arrayContaining(files),
            srs: expect.arrayContaining(originalSnapshot.srs),
          });
          expect(v2.documentHistory[0]?.materials).toHaveLength(files.length);
          expect(v2.documentHistory[0]?.srs).toHaveLength(originalSnapshot.srs.length);
          expect(
            getMaterials(latestV2, target).find((file) => file.path === v2.documentPath)?.content,
          ).toContain(v2Addition);

          const lockedV2 = await developer.command(
            {
              type: "confirmDocumentVersion",
              ...selection,
            },
            selection,
          );
          expect(lockedV2.receipt.status, lockedV2.receipt.error).toBe("completed");
          const reread = getProposal(await business.read(selection), target);
          expect(reread.documentVersion).toMatchObject({
            number: 2,
            confirmation: {
              employeeId: developer.identity.employeeId,
              confirmedAt: expect.any(String),
            },
          });
          expect(reread.documentHistory).toEqual(v2.documentHistory);
          await expectBusinessRejection(
            business.command({ type: "deleteRequirement", ...selection }, selection),
          );
        } finally {
          await Promise.all([developer.close(), tester.close(), admin.close()]);
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "reports missing and invalid documents together and rejects confirmation without altering V1",
    async () => {
      await withClient(async (client) => {
        const admin = await connectST("y00000000");
        try {
          const target = await createProposal(client);
          const selection = proposalSelection(target);
          const first = await completeBusinessMaterial(client, target);
          const { documentPath } = getProposal(first, target);
          const confirm = { type: "confirmDocumentVersion", ...selection } as const;
          await discuss(client, target, `请删除文件 ${documentPath}`);
          const empty = await client.read(selection);
          expect(getMaterials(empty, target)).toEqual([]);
          expect(getProposal(empty, target).documentVersion).toEqual({ number: 1 });
          await completeBusinessMaterial(client, target);
          const withSolution = await completeSolutionMaterial(admin, target);
          const materials = getMaterials(withSolution, target);
          const dependencies = materials.find(({ path }) =>
            path.endsWith("/sr-dependencies.json"),
          )!;
          const design = materials.find(({ path }) => path.endsWith("/design.md"))!;
          await discuss(admin, target, '{"srs":[]}', "solution");
          await discuss(admin, target, `请删除文件 ${design.path}`, "solution");
          await discuss(client, target, `请删除文件 ${documentPath}`);
          const before = await admin.read(selection);
          const validation = await admin.call("validateDocumentVersion", [selection]);
          expect(validation).toMatchObject({
            version: 1,
            issues: [
              { kind: "missing", path: documentPath },
              { kind: "missing", path: design.path },
              {
                kind: "invalid",
                path: dependencies.path,
                reason: expect.stringContaining("覆盖全部 SR"),
              },
            ],
          });
          const rejected = await admin.command(confirm, selection);
          expect(rejected.receipt.status).toBe("failed");
          expect(rejected.documentValidation).toEqual(validation);
          const unchanged = await admin.read(selection);
          expect(unchanged.view.revision).toBe(before.view.revision);
          expect(getProposal(unchanged, target).documentVersion).toEqual({ number: 1 });
          expect(getMaterials(unchanged, target)).toEqual(getMaterials(before, target));

          await completeBusinessMaterial(client, target);
          await discuss(admin, target, `请删除文件 ${dependencies.path}`, "solution");
          await completeSolutionMaterial(admin, target);
          expect(await admin.call("validateDocumentVersion", [selection])).toMatchObject({
            version: 1,
            issues: [],
          });
        } finally {
          await admin.close();
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "should delete a plain proposal without deleting unrelated requirements or leaving SRs behind",
    async () => {
      await withClient(async (client) => {
        const target = await createProposal(client);
        const before = await client.read(target.selection);
        const unrelated = before.view.requirements.filter((group) => group.id !== target.irId);
        const result = await client.command(
          { type: "deleteRequirement", projectId: target.projectId, irId: target.irId },
          target.selection,
        );
        expect(result.receipt.status, result.receipt.error).toBe("completed");
        expect(result.receipt).not.toHaveProperty("deletion");
        const deleted = await client.read({ projectId: target.projectId });
        expect(deleted.view.requirements.some((group) => group.id === target.irId)).toBe(false);
        expect(deleted.view.requirements.filter((group) => group.id !== target.irId)).toEqual(
          unrelated,
        );
        expect(deleted.view.srs.filter((sr) => sr.irId === target.irId)).toEqual([]);
      });
    },
    config.timeoutMs,
  );
});
