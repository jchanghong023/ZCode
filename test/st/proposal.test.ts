import { describe, expect, it } from "vitest";
import type { AIReqProjectRoleMember } from "@zcode/services/aireq";
import { connectST, unique, type STClient } from "./client.js";
import { config, requireConfig } from "./config.js";
import { takeRequirement } from "./business.js";
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
    "uses saved document headings to validate and review requirements generated in chat",
    async () => {
      await withClient(async (client) => {
        // 云龙是 IR 的来源；先占用没有本地材料的专用 IR，再临时修改全局格式。
        const target = await takeRequirement(client);
        const { documentFormats: original, revision: baseline } = target.remote.view;
        expect(Object.keys(original).sort()).toEqual([
          "design.md",
          "proposal.md",
          "requirements.md",
          "spec.md",
          "tasks.md",
          "test-plan.md",
        ]);
        const formats = { ...original, "requirements.md": ["数据范围", "验收方式"] };
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
          expect(restored.documentFormatSnapshot?.documentFormats).toEqual(original);
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "updates V1 until a single confirmation fixes all documents and preserves them after V2 starts",
    async () => {
      const failures: unknown[] = [];
      await withClient(async (business) => {
        let developer: STClient | undefined;
        let tester: STClient | undefined;
        let admin: STClient | undefined;
        const granted: AIReqProjectRoleMember[] = [];
        try {
          developer = await connectST(config.otherEmployeeId);
          tester = await connectST(config.testerEmployeeId);
          admin = await connectST("y00000000");
          expect(
            new Set([business, developer, tester, admin].map((actor) => actor.identity.employeeId))
              .size,
          ).toBe(4);
          const target = await takeRequirement(business, { requireRelease: true });
          const ordinaryActors = new Set(
            [business, developer, tester].map(({ identity }) => identity.employeeId),
          );
          // 预置的开发或测试角色会绕过本例要验证的独立授权，不清理环境原有权限。
          if (
            target.remote.view.projectRoleMembers.some(
              ({ projectId, employeeId }) =>
                projectId === target.projectId && ordinaryActors.has(employeeId),
            )
          ) {
            throw new Error("ST 前置阻塞：定版夹具项目的三个测试工号必须没有预置项目角色");
          }
          for (const [actor, role] of [
            [developer, "development"],
            [tester, "testing"],
          ] as const) {
            const member = {
              projectId: target.projectId,
              employeeId: actor.identity.employeeId,
              role,
            };
            const result = await admin.command(
              {
                type: "addProjectRoleMember",
                ...member,
              },
              target.selection,
            );
            expect(result.receipt.status, result.receipt.error).toBe("completed");
            granted.push(member);
          }
          const selection = proposalSelection(target);
          const confirmationAction = (snapshot: string) =>
            ({
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
          const { originalText, documentVersion } = getProposal(target.remote, target);
          expect(documentVersion).toBeUndefined();
          // 同一云龙 Release 可能已有其他 IR（包括已定版的 IR），只核对本例的增量。
          const releaseRequirements = target.remote.view.requirements.filter(
            ({ projectId, releaseId }) =>
              projectId === target.projectId && releaseId === target.releaseId,
          );
          const requirementCount = releaseRequirements.length;
          const confirmedRequirementCount = releaseRequirements.filter(
            ({ documentVersion }) => documentVersion?.confirmation,
          ).length;
          expect(requirementCount).toBeGreaterThan(0);
          const initialRelease = requireConfig(release(target.remote), "定版夹具的 Release");
          expect(initialRelease).toMatchObject({ requirementCount, confirmedRequirementCount });
          await expect(business.call("validateDocumentVersion", [selection])).rejects.toThrow();
          const emptyCheck = await tester.call("validateDocumentVersion", [selection]);
          await expectBusinessRejection(
            tester.command(confirmationAction(emptyCheck.snapshot), selection),
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
          expect(release(saved)).toEqual({
            ...initialRelease,
            confirmedRequirementCount: confirmedRequirementCount + 1,
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
          expect(release(latestV2)).toEqual(initialRelease);
          const v2 = getProposal(latestV2, target);
          expect(v2.documentVersion).toEqual({ number: 2 });
          const originalSnapshot = {
            number: 1,
            confirmation,
            materials: files,
            srs: saved.view.srs.filter(
              ({ projectId, irId }) => projectId === target.projectId && irId === target.irId,
            ),
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
          const lockedV2 = await developer.command(
            confirmationAction(nextCheck.snapshot),
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
          expect(reread.originalText).toBe(originalText);
          expect(reread.documentHistory).toEqual(v2.documentHistory);
        } catch (error) {
          failures.push(error);
        } finally {
          if (admin) {
            for (const member of granted) {
              try {
                const removed = await admin.command(
                  { type: "removeProjectRoleMember", ...member },
                  { projectId: member.projectId },
                );
                expect(removed.receipt.status, removed.receipt.error).toBe("completed");
              } catch (error) {
                failures.push(error);
              }
            }
          }
          const closed = await Promise.allSettled([
            developer?.close(),
            tester?.close(),
            admin?.close(),
          ]);
          for (const result of closed)
            if (result.status === "rejected") failures.push(result.reason);
        }
      }).catch((error: unknown) => {
        failures.push(error);
      });
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1)
        throw new AggregateError(failures, "ST 定版断言、角色回收或连接关闭失败");
    },
    config.timeoutMs,
  );

  it(
    "reports missing and invalid documents together and rejects confirmation without altering V1",
    async () => {
      await withClient(async (client) => {
        const admin = await connectST("y00000000");
        try {
          const target = await takeRequirement(client);
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
});
