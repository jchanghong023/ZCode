import { describe, expect, it } from "vitest";
import type {
  AIReqAction,
  AIReqDocumentFormats,
  AIReqRequirementGroup,
} from "@zcode/services/aireq";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { config, requireConfig } from "./config.js";
import { createProject, createProposal } from "./business.js";
import {
  alignmentAction,
  approveOriginalReview,
  commandAndRead,
  completeBusinessMaterial,
  completeSolutionMaterial,
  confirmAllPerspectives,
  discuss,
  expectBusinessRejection,
  getProposal,
  submitReview,
  waitForReview,
} from "./proposal-flow.js";

// ST oracle: proposals.md, unified-side-pane.md (材料阅读) and connection-identity.md.
// These tests use published service/wire contracts only, never backend fixtures,
// private material generators or frontend/domain derivation functions as expectations.
async function withClient(run: (client: STClient) => Promise<void>) {
  const client = await connectST();
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

function materialVersions(group: AIReqRequirementGroup) {
  return group.files
    .map(({ path, sha256, size }) => ({ path, sha256, size }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

describe("proposal business lifecycle through the deployed public API", () => {
  it(
    "should create and import independent proposals without sending discussion, splitting SRs or approving anything",
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
          expect(group.originalReview).toBeUndefined();
          expect(group.review).toBeUndefined();
          expect(group.alignment ?? []).toEqual([]);
          expect(group.proposalDelivery).toBeUndefined();
          expect(group.requirementsPr).toBeUndefined();
        }
        expect(read.view.srs).toEqual(baseline.view.srs);
        expect(read.view.requirements.filter((group) => group.merge)).toEqual(
          baseline.view.requirements.filter((group) => group.merge),
        );
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
    "saves document rules, retains an invalid Markdown import and checks only new or revised material",
    async () => {
      await withClient(async (client) => {
        const baseline = await client.read();
        const original = baseline.view.documentFormats;
        expect(Object.keys(original).sort()).toEqual([
          "design.md",
          "proposal.md",
          "requirements.md",
          "spec.md",
          "tasks.md",
          "test-plan.md",
        ]);
        let owned: AIReqDocumentFormats | undefined;
        const saveFormats = async (documentFormats: AIReqDocumentFormats) => {
          const current = await client.read();
          expect(current.view.documentFormats).toEqual(owned ?? original);
          const receipt = await client.command({
            type: "saveDocumentFormats",
            documentFormats,
            expectedRevision: current.view.revision,
          });
          expect(receipt.receipt.status, receipt.receipt.error).toBe("completed");
          expect(receipt).not.toHaveProperty("view");
          expect(receipt.documentFormatSnapshot).toEqual({
            documentFormats,
            revision: receipt.receipt.revision,
          });
          owned = documentFormats;
          expect((await client.read()).view.documentFormats).toEqual(documentFormats);
        };
        try {
          const requirementsRules = { ...original, "requirements.md": ["数据范围", "验收方式"] };
          await saveFormats(requirementsRules);
          const project = await createProject(client);
          const originalText = unique("导入业务需求原文");
          const businessDocument = [
            "# CSV 导出",
            "## 数据范围示例",
            "这是相近但不同的正文标题。",
            "```md",
            "## 数据范围",
            "这是代码块中的示例，不是章节。",
            "```",
            "## 验收方式",
            "## 附注",
            "初稿尚未补齐。",
          ].join("\n\n");
          const receipt = await client.command(
            {
              type: "importProposals",
              releaseId: project.releaseId,
              proposals: [{ originalText, businessDocument }],
            },
            project.selection,
          );
          expect(receipt.receipt.status, receipt.receipt.error).toBe("completed");
          const imported = (await client.read(project.selection)).view.requirements.find(
            (group) => group.originalText === originalText,
          )!;
          expect(imported).toBeDefined();
          const target = {
            ...project,
            irId: imported.id,
            selection: { projectId: project.projectId, irId: imported.id },
          };
          const invalid = await waitUntil(
            "the saved Markdown import exposes its file-specific format errors",
            () => client.read(target.selection),
            (remote) => Boolean(getProposal(remote, target).requirementsCheck?.issues.length),
          );
          expect(
            invalid.view.materials.find(
              (file) => file.irId === target.irId && file.path === imported.documentPath,
            )?.content,
          ).toBe(businessDocument);
          const invalidGroup = getProposal(invalid, target);
          const issues = invalidGroup.requirementsCheck!.issues;
          expect(issues.every((issue) => issue.path === imported.documentPath)).toBe(true);
          const reasons = issues.map((issue) => issue.reason).join("\n");
          expect(reasons).toContain("数据范围");
          expect(reasons).toContain("验收方式");
          expect(invalidGroup.originalReview).toBeUndefined();

          await discuss(
            client,
            target,
            "请补齐导入文档的下列真实 Markdown 章节，保留原有业务目标：\n\n" +
              "## 验收方式\n对比导出的 CSV 解析结果与项目原始需求。\n\n" +
              "## 数据范围\n只导出当前项目及 Release 的原始需求。",
          );
          await submitReview(client, target, "original");
          const accepted = getProposal(await approveOriginalReview(client, target), target);
          const requirementsCheck = accepted.requirementsCheck;
          expect(requirementsCheck?.issues).toEqual([]);
          expect(accepted.originalReviewHistory ?? []).toEqual([]);
          expect(accepted.originalText).toBe(originalText);

          const testHeading = "CSV 往返验证";
          await saveFormats({
            ...requirementsRules,
            "requirements.md": ["新需求合规声明"],
            "test-plan.md": [testHeading],
          });
          const reread = getProposal(await client.read(target.selection), target);
          expect(reread.requirementsCheck).toEqual(requirementsCheck);
          expect(reread.originalReview).toEqual(accepted.originalReview);
          await discuss(
            client,
            target,
            "使用已确认的 IR 业务文档生成两项 SR 的提案、规格、设计、任务、测试方案及依赖和工作日预估，" +
              "测试方案暂不包含往返验证章节。",
          );
          const missing = await waitUntil(
            "new scheme material follows the newly saved test plan rule",
            () => client.read(target.selection),
            (remote) => Boolean(getProposal(remote, target).solutionCheck?.issues.length),
          );
          const incomplete = getProposal(missing, target);
          expect(incomplete.srIds.length).toBeGreaterThan(0);
          for (const id of incomplete.srIds) {
            expect(incomplete.solutionCheck?.issues).toContainEqual(
              expect.objectContaining({
                path: `openspec/changes/${id}/test-plan.md`,
                reason: expect.stringContaining(testHeading),
              }),
            );
          }
          expect(incomplete.review).toBeUndefined();
          expect(incomplete.requirementsCheck).toEqual(requirementsCheck);
          await discuss(
            client,
            target,
            `## ${testHeading}\n导出后重新解析 CSV，逐条核对中文、逗号、引号及换行。`,
          );
          await submitReview(client, target, "full");
          const { remote } = await waitForReview(client, target, "full");
          const repaired = getProposal(remote, target);
          expect(repaired.solutionCheck?.issues).toEqual([]);
          expect(repaired.requirementsCheck).toEqual(requirementsCheck);
          expect(repaired.originalReview).toEqual(accepted.originalReview);
          expect(repaired.files.find((file) => file.path === imported.documentPath)).toEqual(
            accepted.files.find((file) => file.path === imported.documentPath),
          );
        } finally {
          if (owned) await saveFormats(original);
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "lets a business user return an unconfirmed requirements review without a reason",
    async () => {
      await withClient(async (client) => {
        const target = await createProposal(client);
        const before = await client.read(target.selection);
        await expectBusinessRejection(
          client.command(
            { type: "acceptProposal", reviewId: unique("missing-review"), snapshotDigest: "none" },
            target.selection,
          ),
        );
        const unchanged = await client.read(target.selection);
        expect(getProposal(unchanged, target)).toEqual(getProposal(before, target));
        await completeBusinessMaterial(client, target);
        await submitReview(client, target, "original");
        const { remote: reviewed, review: original } = await waitForReview(
          client,
          target,
          "original",
        );
        expect(reviewed.view.roleAdministrator).toBe(false);
        expect(
          reviewed.view.projectRoleMembers.filter((entry) => entry.projectId === target.projectId),
        ).toEqual([]);
        expect(original.humanDecision).toBeUndefined();
        const returned = await commandAndRead(
          client,
          { type: "returnProposal", reason: "  " },
          {
            ...target,
            selection: { ...target.selection, proposalStep: "solution" },
          },
        );
        const group = getProposal(returned, target);
        expect(group.returnFeedback).toMatchObject({
          reason: "",
          employeeId: client.identity.employeeId,
        });
        expect(group.returnFeedback?.returnedAt).toBeTruthy();
        expect(group.returnFeedback?.resumedAt).toBeUndefined();
        expect(group.proposalStage).toBe("requirements");
        expect(group.srIds).toEqual([]);
        expect(group.originalReview).toBeUndefined();
        expect(group.originalReviewHistory).toContainEqual(
          expect.objectContaining({ id: original.id, invalidatedReason: expect.any(String) }),
        );
        await expectBusinessRejection(
          client.command(
            {
              type: "acceptProposal",
              reviewId: original.id,
              snapshotDigest: original.snapshotDigest,
            },
            target.selection,
          ),
        );
        const refused = await client.read(target.selection);
        expect(getProposal(refused, target).returnFeedback).toEqual(group.returnFeedback);
        expect(getProposal(refused, target).proposalStage).toBe("requirements");
      });
    },
    config.timeoutMs,
  );

  it(
    "starts reviews only after explicit submission, preserves each role's first confirmer and freezes the submitted material version",
    async () => {
      await withClient(async (client) => {
        const target = await createProposal(client);
        const notStarted = getProposal(target.remote, target);
        expect(notStarted.files).toEqual([]);
        expect(notStarted.snapshot).toBeUndefined();
        expect(notStarted.originalReview).toBeUndefined();
        expect(notStarted.review).toBeUndefined();

        const firstDraft = getProposal(await completeBusinessMaterial(client, target), target);
        expect(firstDraft.originalReview).toBeUndefined();
        await discuss(client, target, "补充验收条件：下载后核对每行与原始需求一致。");
        const business = getProposal(await client.read(target.selection), target);
        expect(business.originalReview).toBeUndefined();
        expect(business.snapshot).not.toHaveProperty("version");
        expect(business.snapshot?.digest).not.toBe(firstDraft.snapshot?.digest);
        await expectBusinessRejection(
          client.command(
            {
              type: "submitProposalReview",
              projectId: target.projectId,
              irId: target.irId,
              kind: "original",
              snapshotDigest: firstDraft.snapshot!.digest,
            },
            target.selection,
          ),
        );
        const irFile = business.files.find((row) => row.path === business.documentPath)!;
        expect(irFile.size).toBeGreaterThan(0);
        expect(business.snapshot?.files).toContainEqual(irFile);
        await submitReview(client, target, "original");
        const { review: originalReport } = await waitForReview(client, target, "original");
        await expectBusinessRejection(
          client.command(
            {
              type: "submitProposalReview",
              projectId: target.projectId,
              irId: target.irId,
              kind: "original",
              snapshotDigest: business.snapshot!.digest,
            },
            target.selection,
          ),
        );
        expect(getProposal(await client.read(target.selection), target).originalReview?.id).toBe(
          originalReport.id,
        );
        expect(originalReport.inputFiles).toEqual([irFile]);
        expect(originalReport.humanDecision).toBeUndefined();
        const originalApproved = getProposal(await approveOriginalReview(client, target), target);
        expect(originalApproved.originalReview?.humanDecision?.reviewId).toBe(originalReport.id);
        expect(originalApproved).not.toHaveProperty("requirementsDecisions");
        expect(originalApproved.originalReviewHistory ?? []).toEqual([]);
        expect(originalApproved.srIds).toEqual([]);
        expect(originalApproved.review).toBeUndefined();

        const solution = getProposal(await completeSolutionMaterial(client, target), target);
        expect(solution.files.find((file) => file.path === irFile.path)).toEqual(irFile);
        expect(solution.originalReview?.humanDecision).toEqual(
          originalApproved.originalReview?.humanDecision,
        );
        expect(solution.review).toBeUndefined();
        await submitReview(client, target, "full");
        const { review: fullReport } = await waitForReview(client, target, "full");
        expect(
          fullReport.inputFiles
            ?.map(({ path, sha256, size }) => ({ path, sha256, size }))
            .sort((a, b) => a.path.localeCompare(b.path)),
        ).toEqual(materialVersions(solution));
        expect(fullReport.humanDecision).toBeUndefined();
        const version = fullReport.snapshotDigest;
        const alignment = alignmentAction(fullReport, "business");
        await expectBusinessRejection(
          client.command({ ...alignment, reviewId: originalReport.id }, target.selection),
        );
        await expectBusinessRejection(
          client.command(
            { ...alignment, version: originalReport.snapshotDigest },
            target.selection,
          ),
        );
        const readHandoff = () =>
          client.call("readPrHandoff", [{ projectId: target.projectId, irId: target.irId }]);
        expect((await readHandoff()).blockers).not.toHaveLength(0);

        const first = getProposal(await commandAndRead(client, alignment, target), target);
        const firstConfirmation = first.alignment?.find(
          (entry) => entry.perspective === "business",
        );
        expect(firstConfirmation).toMatchObject({
          version,
          employeeId: client.identity.employeeId,
          confirmedAt: expect.any(String),
        });
        const otherEmployee = requireConfig(config.otherEmployeeId, "第二个合法工号");
        expect(otherEmployee).not.toBe(client.identity.employeeId);
        const other = await connectST(otherEmployee);
        try {
          const repeated = getProposal(await commandAndRead(other, alignment, target), target);
          expect(repeated.alignment).toEqual([firstConfirmation]);
        } finally {
          await other.close();
        }
        const two = await commandAndRead(
          client,
          alignmentAction(fullReport, "development"),
          target,
        );
        expect(getProposal(two, target).proposalDelivery).toBeUndefined();
        expect((await readHandoff()).blockers).not.toHaveLength(0);
        const confirmed = await commandAndRead(
          client,
          alignmentAction(fullReport, "testing"),
          target,
        );
        const aligned = getProposal(confirmed, target);
        expect(aligned.requirementsPr).toBeUndefined();
        expect(aligned.alignment?.map((entry) => entry.perspective).sort()).toEqual([
          "business",
          "development",
          "testing",
        ]);
        for (const entry of aligned.alignment!) {
          expect(entry).toMatchObject({
            version,
            reviewId: fullReport.id,
            snapshotDigest: fullReport.snapshotDigest,
            employeeId: client.identity.employeeId,
          });
          expect(Number.isFinite(Date.parse(entry.confirmedAt))).toBe(true);
        }
        expect(aligned.review?.id).toBe(fullReport.id);
        expect(aligned.reviewHistory ?? []).toEqual([]);
        const candidate = aligned.proposalDelivery!;
        expect(candidate).toMatchObject({
          version,
          confirmedBy: client.identity.employeeId,
          candidate: expect.any(String),
        });
        expect(materialVersions({ ...aligned, files: candidate.files })).toEqual(
          materialVersions(aligned),
        );
        const handoff = await readHandoff();
        expect(handoff.blockers).toEqual([]);
        expect(handoff).not.toHaveProperty("ready");
        const sourceDirectory = handoff.sourceDirectory.replace(/\\/g, "/").replace(/\/$/, "");
        expect(sourceDirectory).not.toBe("");
        expect(sourceDirectory).not.toBe(aligned.proposalLocation?.directory);

        const publish: AIReqAction = {
          type: "publishProposal",
          candidate: candidate.candidate,
          operationId: unique("publish"),
        };
        await expectBusinessRejection(
          client.command({ ...publish, candidate: unique("wrong-candidate") }, target.selection),
        );
        const receipt = await client.command(publish, target.selection);
        expect(receipt).not.toHaveProperty("operationId");
        expect(receipt).not.toHaveProperty("status");
        expect(receipt).not.toHaveProperty("revision");
        expect(receipt).not.toHaveProperty("view");
        expect(receipt).not.toHaveProperty("documentFormatSnapshot");
        expect(receipt.receipt.status, receipt.receipt.error).not.toBe("failed");
        const published = await waitUntil(
          "submitted candidate exposes its open document PR",
          () => client.read(target.selection),
          (remote) => getProposal(remote, target).requirementsPr?.status === "opened",
        );
        const frozen = getProposal(published, target);
        expect(frozen.proposalDelivery).toMatchObject({
          candidate: candidate.candidate,
          version,
          pushedCandidate: candidate.candidate,
          prCandidate: candidate.candidate,
        });
        expect(frozen.proposalDelivery).not.toHaveProperty("repositoryTarget");
        expect(frozen.proposalDelivery).not.toHaveProperty("simulatedMr");
        expect(published.view.requirements.some((group) => group.id === target.irId && group.merge)).toBe(false);
        const repeated = await client.command(publish, target.selection);
        expect(repeated.receipt.operationId).toBe(receipt.receipt.operationId);
        await commandAndRead(
          client,
          { type: "publishProposal", candidate: candidate.candidate },
          target,
        );
        const reread = getProposal(await client.read(target.selection), target);
        expect(reread.requirementsPr).toEqual(frozen.requirementsPr);
        expect(reread.alignment).toEqual(aligned.alignment);
        await expectBusinessRejection(
          client.command(
            { type: "returnProposal", target: "solution", reason: "补充引用换行的测试用例" },
            target.selection,
          ),
        );
        await expectBusinessRejection(
          client.command(
            {
              type: "deleteRequirement",
              projectId: target.projectId,
              irId: target.irId,
            },
            target.selection,
          ),
        );
        expect(materialVersions(getProposal(await client.read(target.selection), target))).toEqual(
          materialVersions(frozen),
        );
        const project = published.view.projects.find((item) => item.id === target.projectId)!;
        const newBranch = unique("st-delivery-branch");
        await client.call("projects.saveRepository", [
          {
            projectId: project.id,
            name: project.name,
            repositoryUrl: requireConfig(project.repositoryUrl, "交付项目仓库"),
            defaultBranch: newBranch,
            expectedRevision: project.revision,
            operationId: unique("change-delivery-branch"),
          },
        ]);
        expect(await readHandoff()).toMatchObject({
          blockers: expect.arrayContaining([expect.stringContaining("仍绑定原目标")]),
          targetBranch: project.defaultBranch,
        });
        await expect(
          client.command(
            { type: "publishProposal", candidate: candidate.candidate },
            target.selection,
          ),
        ).rejects.toThrow(/仍绑定原目标/);
        await expectBusinessRejection(
          client.command(
            { type: "closeProposalPr", candidate: unique("wrong-candidate") },
            target.selection,
          ),
        );
        await commandAndRead(
          client,
          { type: "closeProposalPr", candidate: candidate.candidate },
          target,
        );
        const closed = getProposal(await client.read(target.selection), target);
        expect(closed.requirementsPr).toBeUndefined();
        expect(closed.proposalDeliveryHistory).toContainEqual(
          expect.objectContaining({
            candidate: candidate.candidate,
            closedPr: { ...frozen.requirementsPr, status: "closed" },
          }),
        );
        expect(
          closed.proposalDeliveryHistory?.find((item) => item.candidate === candidate.candidate),
        ).not.toHaveProperty("repositoryTarget");
        expect(await readHandoff()).toMatchObject({ blockers: [], targetBranch: newBranch });
        expect(materialVersions(closed)).toEqual(materialVersions(frozen));
        await expectBusinessRejection(
          client.command(
            { type: "publishProposal", candidate: candidate.candidate },
            target.selection,
          ),
        );
        const reboundCandidate = closed.proposalDelivery!.candidate;
        const rebound = getProposal(
          await commandAndRead(
            client,
            { type: "publishProposal", candidate: reboundCandidate },
            target,
          ),
          target,
        );
        expect(rebound.requirementsPr).toMatchObject({ status: "opened", targetBranch: newBranch });
        expect(rebound.requirementsPr?.number).not.toBe(frozen.requirementsPr?.number);
        await commandAndRead(
          client,
          { type: "closeProposalPr", candidate: reboundCandidate },
          target,
        );

        const testPlan = published.view.materials.find(
          (file) => file.irId === target.irId && file.path.endsWith("/test-plan.md"),
        )!;
        const reason = "补充 CSV 引用单元格换行和失败重试的验收用例。";
        const returnedRemote = await commandAndRead(
          client,
          { type: "returnProposal", target: "solution", reason },
          target,
        );
        const returned = getProposal(returnedRemote, target);
        expect(returned).toMatchObject({
          proposalStage: "solution",
          originalReview: aligned.originalReview,
          files: rebound.files,
          snapshot: rebound.snapshot,
          returnFeedback: { target: "solution", reason, employeeId: client.identity.employeeId },
        });
        expect(returned.review).toBeUndefined();
        expect(returned.proposalDelivery).toBeUndefined();
        expect(returned.alignment).toEqual([]);
        expect(returnedRemote.session?.phase).toBe("solution");
        await expectBusinessRejection(
          client.command(
            {
              type: "submitProposalReview",
              projectId: target.projectId,
              irId: target.irId,
              kind: "full",
              snapshotDigest: returned.snapshot!.digest,
            },
            target.selection,
          ),
        );
        await discuss(client, target, reason);
        await submitReview(client, target, "full");
        const { remote: revisedRemote, review: revisedReport } = await waitForReview(
          client,
          target,
          "full",
        );
        const revised = getProposal(revisedRemote, target);
        expect(revised.returnFeedback?.resumedAt).toBeTruthy();
        expect(revised.originalReview).toEqual(aligned.originalReview);
        expect(revised.requirementsCheck).toEqual(aligned.requirementsCheck);
        expect(revised.srIds).toEqual(aligned.srIds);
        expect(revisedReport.id).not.toBe(fullReport.id);
        expect(revisedReport.snapshotDigest).not.toBe(version);
        expect(revised.reviewHistory).toContainEqual(
          expect.objectContaining({ id: fullReport.id, invalidatedReason: expect.any(String) }),
        );
        expect(revised.alignment ?? []).toEqual([]);
        expect(revised.alignmentHistory).toEqual(expect.arrayContaining(aligned.alignment!));
        const history = revised.materialHistory?.find((item) => item.version === version);
        expect(history?.materials).toContainEqual(testPlan);
        expect(history?.srs).toHaveLength(frozen.srIds.length);
        expect(history?.srs).toEqual(expect.arrayContaining(frozen.snapshot!.srs));
        expect(history?.proposalRound).toBe(frozen.proposalRound ?? 1);
        await expectBusinessRejection(client.command(alignment, target.selection));
        await expect(
          client.call("retryMaterial", [
            {
              projectId: target.projectId,
              releaseId: target.releaseId,
              irId: target.irId,
              path: testPlan.path,
              sha256: testPlan.sha256,
              round: testPlan.round,
            },
          ]),
        ).rejects.toThrow();
        const currentTestPlan = revisedRemote.view.materials.find(
          (file) => file.irId === target.irId && file.path === testPlan.path,
        )!;
        expect(currentTestPlan.sha256).not.toBe(testPlan.sha256);
        expect(
          await client.call("retryMaterial", [
            {
              projectId: target.projectId,
              releaseId: target.releaseId,
              irId: target.irId,
              path: currentTestPlan.path,
              sha256: currentTestPlan.sha256,
              round: currentTestPlan.round,
            },
          ]),
        ).toBe(true);
        const afterRetry = getProposal(await client.read(target.selection), target);
        expect(materialVersions(afterRetry)).toEqual(materialVersions(revised));
        expect(afterRetry.review).toEqual(revisedReport);
        expect(afterRetry.alignment ?? []).toEqual([]);

        const realigned = await confirmAllPerspectives(client, target, revisedReport);
        await commandAndRead(
          client,
          { type: "returnProposal", target: "solution", reason: "交付前需要重新核对业务范围。" },
          target,
        );
        await commandAndRead(
          client,
          {
            type: "returnProposal",
            target: "requirements",
            reason: "明确支持导出的访问权限。",
          },
          target,
        );
        await discuss(client, target, "明确支持导出的访问权限。");
        await submitReview(client, target, "original");
        const { remote: rechecked, review: replacement } = await waitForReview(
          client,
          target,
          "original",
        );
        const changed = getProposal(rechecked, target);
        expect(changed.originalText).toBe(aligned.originalText);
        expect(changed.originalReviewHistory).toContainEqual(
          expect.objectContaining({
            id: originalReport.id,
            humanDecision: aligned.originalReview?.humanDecision,
            invalidatedReason: expect.any(String),
          }),
        );
        expect(replacement.id).not.toBe(originalReport.id);
        expect(replacement.humanDecision).toBeUndefined();
        expect(changed.review).toBeUndefined();
        expect(changed.reviewHistory).toContainEqual(
          expect.objectContaining({ id: revisedReport.id, invalidatedReason: expect.any(String) }),
        );
        expect(changed.alignmentHistory).toEqual(
          expect.arrayContaining(realigned.group.alignment!),
        );
        expect(changed.alignment ?? []).toEqual([]);
        expect(changed.proposalDelivery).toBeUndefined();
        expect(rechecked.view.requirements.some((group) => group.id === target.irId && group.merge)).toBe(false);
        await expectBusinessRejection(
          client.command(
            {
              type: "acceptProposal",
              reviewId: originalReport.id,
              snapshotDigest: originalReport.snapshotDigest,
            },
            target.selection,
          ),
        );
        expect(getProposal(await client.read(target.selection), target).originalReview).toEqual(
          replacement,
        );
      });
    },
    config.timeoutMs,
  );

  it(
    "should recover only an existing target session and never manufacture materials when merely reading or retrying",
    async () => {
      await withClient(async (client) => {
        const target = await createProposal(client);
        const before = await client.read(target.selection);
        expect(before.view).not.toHaveProperty("selected");
        expect(before.session).toBeDefined();
        const group = getProposal(before, target);
        await expect(
          client.call("retrySession", [target.selection, unique("wrong-session")]),
        ).rejects.toThrow();
        await client.call("retrySession", [target.selection, before.session!.sessionId]);
        const recovered = await client.read(target.selection);
        expect(recovered.session?.sessionId).toBe(before.session!.sessionId);
        expect(recovered.workspace).toEqual(before.workspace);
        expect(getProposal(recovered, target).files).toEqual(group.files);
        expect(getProposal(recovered, target).srIds).toEqual([]);
        expect(getProposal(recovered, target).originalReview).toBeUndefined();
        const absentPath = `docs/requirements/${target.irId}/not-generated.md`;
        await expect(
          client.call("retryMaterial", [
            {
              projectId: target.projectId,
              releaseId: target.releaseId,
              irId: target.irId,
              path: absentPath,
              sha256: "0".repeat(64),
            },
          ]),
        ).rejects.toThrow();
        const after = await client.read(target.selection);
        expect(getProposal(after, target).files).toEqual(group.files);
        expect(after.session?.sessionId).toBe(before.session!.sessionId);
      });
    },
    config.timeoutMs,
  );

  it(
    "should delete a plain proposal without deleting unrelated requirements or creating a formal IR",
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
        expect(deleted.view.requirements.filter((group) => group.id !== target.irId)).toEqual(unrelated);
        expect(deleted.view.srs.filter((sr) => sr.irId === target.irId)).toEqual([]);
      });
    },
    config.timeoutMs,
  );
});
