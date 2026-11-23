import { describe, expect, it } from "vitest";
import { connectST, unique, type STClient } from "./client.js";
import { config } from "./config.js";
import { createProject, createProposal, createProposalIn } from "./business.js";
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
    "creates a short requirement without generating documents or splitting SRs and deduplicates draft retries",
    async () => {
      await withClient(async (client) => {
        const project = await createProject(client);
        const baseline = await client.read(project.selection);
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
        const read = await client.read(project.selection);
        const drafts = read.view.requirements.filter(
          (group) => group.originalText === action.originalText,
        );
        expect(drafts.map((group) => group.id)).toEqual([created.irId]);
        expect(drafts[0]).toMatchObject({
          projectId: project.projectId,
          releaseId: project.releaseId,
          submittedBy: client.identity.employeeId,
          srIds: [],
          documentHistory: [],
          documentReviews: [],
        });
        expect(drafts[0]).not.toHaveProperty("clientDraftId");
        expect(drafts[0]).not.toHaveProperty("origin");
        expect(drafts[0]).not.toHaveProperty("files");
        expect(drafts[0]?.documentVersion).toBeUndefined();
        expect(read.view.srs).toEqual(baseline.view.srs);
        expect(read.view.materials).toEqual(baseline.view.materials);
      });
    },
    config.timeoutMs,
  );

  it(
    "uses saved document headings to validate and review requirements generated in chat",
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
          const target = await createProposal(client, "提供可配置的项目通知规则。");
          const selection = proposalSelection(target);
          await discuss(
            client,
            target,
            [
              "# 项目通知规则",
              "## 数据范围示例",
              "这是名字相近的正文标题。",
              "```md\n## 数据范围\n这是代码块中的示例。\n```",
              "## 验收方式",
            ].join("\n\n"),
          );
          const read = await client.read(selection);
          const proposal = getProposal(read, target);
          expect(proposal.documentVersion).toEqual({ number: 1 });
          const admin = await connectST("y00000000");
          try {
            expect(
              (await admin.call("validateDocumentVersion", [selection])).issues,
            ).toContainEqual({
              kind: "invalid",
              path: proposal.documentPath,
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
            "## 数据范围\n通知仅发送给当前项目的订阅者。\n\n" +
              "## 验收方式\n验证订阅者收到通知，其他人员不收到。",
          );
          const repaired = await client.read(selection);
          expect(getProposal(repaired, target).documentVersion).toEqual({ number: 1 });
          expect(getMaterials(repaired, target)[0]).toMatchObject({
            path: proposal.documentPath,
            content: expect.stringContaining("验证订阅者收到通知，其他人员不收到。"),
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
          const confirmationAction = (snapshot: string) => ({
            type: "confirmDocumentVersion",
            ...selection,
            snapshot,
            expectedRevision: target.remote.view.revision,
            operationId: unique("confirm-document"),
          }) as const;
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
          const emptyCheck = await tester.call("validateDocumentVersion", [selection]);
          await expectBusinessRejection(tester.command(confirmationAction(emptyCheck.snapshot), selection));
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
          const initialCheck = await tester.call("validateDocumentVersion", [selection]);
          expect(initialCheck.issues).toEqual([]);

          const v1Addition = "## 验收补充\n下载错误后可重试，原始需求保持原样。";
          await discuss(business, target, v1Addition);
          const latest = await tester.read(selection);
          expect(getProposal(latest, target).documentVersion).toEqual({ number: 1 });
          const files = getMaterials(latest, target);
          expect(files.find((file) => file.path === solutionGroup.documentPath)?.content).toContain(
            v1Addition,
          );
          const action = confirmationAction(
            (await tester.call("validateDocumentVersion", [selection])).snapshot,
          );
          expect(latest.view.revision).toBeGreaterThan(action.expectedRevision);
          await expect(
            tester.command(confirmationAction(initialCheck.snapshot), selection),
          ).rejects.toThrow("文档已变化");
          await expectBusinessRejection(business.command(action, selection));
          expect(await tester.call("validateDocumentVersion", [selection])).toEqual({
            snapshot: action.snapshot,
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

          await expect(
            developer.command(confirmationAction(action.snapshot), selection),
          ).rejects.toThrow("文档已变化");
          expect(getProposal(await developer.read(selection), target).documentVersion).toEqual({
            number: 2,
          });
          const nextCheck = await developer.call("validateDocumentVersion", [selection]);
          expect(nextCheck.issues).toEqual([]);
          const lockedV2 = await developer.command(confirmationAction(nextCheck.snapshot), selection);
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
          const rejected = await admin.command(
            { type: "confirmDocumentVersion", ...selection, snapshot: validation.snapshot },
            selection,
          );
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
    "deletes an unconfirmed IR and its SRs and materials without affecting a sibling IR",
    async () => {
      await withClient(async (client) => {
        const admin = await connectST("y00000000");
        try {
          const target = await createProposal(client);
          const sibling = await createProposalIn(client, target, "删除后仍保留的旁路需求");
          await completeBusinessMaterial(client, target);
          await completeSolutionMaterial(admin, target);
          await completeBusinessMaterial(client, sibling);
          const before = await client.read(target.selection);
          const targetGroup = getProposal(before, target);
          expect(targetGroup.documentVersion).toEqual({ number: 1 });
          expect(targetGroup.srIds.length).toBeGreaterThan(0);
          const targetSrIds = before.view.srs
            .filter(({ irId }) => irId === target.irId)
            .map(({ id }) => id)
            .sort();
          expect(targetSrIds).toEqual([...targetGroup.srIds].sort());
          expect(getMaterials(before, target)).toContainEqual(
            expect.objectContaining({ srId: targetGroup.srIds[0] }),
          );
          const siblingGroup = getProposal(before, sibling);
          expect(siblingGroup.releaseId).toBe(target.releaseId);
          expect(getMaterials(before, sibling).length).toBeGreaterThan(0);
          const result = await client.command(
            { type: "deleteRequirement", ...target.selection },
            target.selection,
          );
          expect(result.receipt.status, result.receipt.error).toBe("completed");
          expect(result.receipt).not.toHaveProperty("deletion");
          const deleted = await client.read(target.selection);
          expect(deleted.session).toBeUndefined();
          expect(deleted.view.requirements).toEqual(
            before.view.requirements.filter(({ id }) => id !== target.irId),
          );
          expect(deleted.view.srs).toEqual(before.view.srs.filter(({ irId }) => irId !== target.irId));
          expect(deleted.view.materials).toEqual(
            before.view.materials.filter(({ irId }) => irId !== target.irId),
          );
          expect((await client.read(sibling.selection)).session).toEqual(sibling.remote.session);
        } finally {
          await admin.close();
        }
      });
    },
    config.timeoutMs,
  );
});
