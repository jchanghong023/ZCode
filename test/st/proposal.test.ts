import { describe, expect, it } from "vitest";
import type { AIReqAction, AIReqRequirementGroup } from "@zcode/services/aireq";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { config } from "./config.js";
import { createProject, createProposal } from "./business.js";
import {
  approveOriginalReview,
  commandAndRead,
  completeBusinessMaterial,
  completeSolutionMaterial,
  expectBusinessRejection,
  getProposal,
} from "./proposal-flow.js";

// ST oracle: proposals.md, document-surface.md and connection-identity.md.
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

function approvalRetained(group: AIReqRequirementGroup, reviewId: string): boolean {
  return [group.review, ...(group.reviewHistory ?? [])].some(
    (review) => review?.id === reviewId && Boolean(review.humanDecision),
  );
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
        expect(result.status, result.error).toBe("completed");
        const read = await client.read(project.selection);
        const imported = read.view.drafts.filter((group) =>
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
          expect(group.confirmation).toBeUndefined();
          expect(group.requirementsPr).toBeUndefined();
          expect(group.contacts?.business).toBe(client.identity.employeeId);
        }
        expect(read.view.srs).toEqual(baseline.view.srs);
        expect(read.view.groups).toEqual(baseline.view.groups);
        const stable = await client.read(project.selection);
        expect(stable.view.revision).toBe(read.view.revision);
        expect(stable.view.drafts).toEqual(read.view.drafts);

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
        expect(refused.view.drafts).toEqual(read.view.drafts);
        expect(refused.view.drafts.some((group) => group.originalText === mustNotExist)).toBe(
          false,
        );
        expect(refused.view.revision).toBe(read.view.revision);
      });
    },
    config.timeoutMs,
  );

  it(
    "should require readable current business material and record a nonempty return reason without accepting the old review",
    async () => {
      await withClient(async (client) => {
        const target = await createProposal(client);
        const before = await client.read(target.selection);
        await expectBusinessRejection(
          client.command({ type: "runRequirementsReview" }, target.selection),
        );
        const unchanged = await client.read(target.selection);
        expect(getProposal(unchanged, target)).toEqual(getProposal(before, target));
        await completeBusinessMaterial(client, target);
        const approved = await approveOriginalReview(client, target);
        const original = getProposal(approved, target).originalReview!;
        expect(original.passed).toBe(true);
        await expectBusinessRejection(
          client.command({ type: "returnProposal", reason: "  " }, target.selection),
        );
        const reason = "导出验收还须明确引用单元格换行和中文往返无损。";
        const returned = await commandAndRead(client, { type: "returnProposal", reason }, target);
        const group = getProposal(returned, target);
        expect(group.returnFeedback).toMatchObject({
          reason,
          employeeId: client.identity.employeeId,
        });
        expect(group.returnFeedback?.returnedAt).toBeTruthy();
        expect(group.returnFeedback?.resumedAt).toBeUndefined();
        expect(group.proposalStage).toBe("requirements");
        expect(group.srIds).toEqual([]);
        expect(
          [group.originalReview, ...(group.originalReviewHistory ?? [])].some(
            (review) => review?.id === original.id,
          ),
        ).toBe(true);
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
    "should bind approval and three separate perspectives to one version, freeze the published candidate and allow revision only after its PR is closed",
    async () => {
      await withClient(async (client) => {
        // 八态的前进依据是实际材料和确认，不以内部粗 status 或前端派生函数代替 HTTP 事实。
        const target = await createProposal(client);
        const notStarted = getProposal(await client.read(target.selection), target);
        expect(notStarted.files).toEqual([]);
        expect(notStarted.snapshot).toBeUndefined();
        expect(notStarted.originalReview).toBeUndefined();
        expect(notStarted.review).toBeUndefined();
        const business = getProposal(await completeBusinessMaterial(client, target), target);
        const irFile = business.files.find((row) => row.path === business.documentPath)!;
        expect(irFile.size).toBeGreaterThan(0);
        expect(business.snapshot?.files).toContainEqual(irFile);
        expect(business.originalReview).toBeUndefined();
        expect(business.srIds).toEqual([]);
        await commandAndRead(client, { type: "runRequirementsReview" }, target);
        const originalReviewed = await waitUntil(
          "current original review completes before its separate human confirmation",
          () => client.read(target.selection),
          (remote) => {
            const review = getProposal(remote, target).originalReview;
            return Boolean(
              review?.agents?.length &&
              review.agents.every((agent) => agent.status === "completed"),
            );
          },
        );
        const originalReport = getProposal(originalReviewed, target).originalReview!;
        expect(originalReport.report.trim()).toBeTruthy();
        expect(originalReport.inputFiles).toEqual([irFile]);
        expect(originalReport.humanDecision).toBeUndefined();
        expect(
          originalReport.findings?.filter((finding) => finding.level === "blocking") ?? [],
        ).toEqual([]);
        const originalApproved = getProposal(
          await commandAndRead(
            client,
            {
              type: "acceptProposal",
              reviewId: originalReport.id,
              snapshotDigest: originalReport.snapshotDigest,
            },
            target,
          ),
          target,
        );
        expect(originalApproved.originalReview?.humanDecision).toMatchObject({
          reviewId: originalReport.id,
          employeeId: client.identity.employeeId,
        });
        expect(originalApproved.srIds).toEqual([]);
        expect(originalApproved.review).toBeUndefined();
        const solution = getProposal(await completeSolutionMaterial(client, target), target);
        expect(solution.srIds.length).toBeGreaterThan(0);
        expect(solution.snapshot?.files).toEqual(expect.arrayContaining(solution.files));
        expect(solution.review).toBeUndefined();
        expect(solution.alignment ?? []).toEqual([]);
        await commandAndRead(client, { type: "runFullReview" }, target);
        const fullReviewed = await waitUntil(
          "current full review completes before human approval and three independent perspectives",
          () => client.read(target.selection),
          (remote) => {
            const review = getProposal(remote, target).review;
            return Boolean(
              review?.agents?.length === 4 &&
              review.agents.every((agent) => agent.status === "completed"),
            );
          },
        );
        const fullReport = getProposal(fullReviewed, target).review!;
        expect(fullReport.agents?.map((agent) => agent.id).sort()).toEqual([
          "a",
          "b",
          "c",
          "summary",
        ]);
        expect(fullReport.report.trim()).toBeTruthy();
        expect(fullReport.humanDecision).toBeUndefined();
        expect(
          fullReport.findings?.filter((finding) => finding.level === "blocking") ?? [],
        ).toEqual([]);
        expect(
          fullReport.inputFiles
            ?.map(({ path, sha256, size }) => ({ path, sha256, size }))
            .sort((a, b) => a.path.localeCompare(b.path)),
        ).toEqual(materialVersions(solution));
        const remote = await commandAndRead(
          client,
          {
            type: "approveFullReview",
            reviewId: fullReport.id,
            snapshotDigest: fullReport.snapshotDigest,
          },
          target,
        );
        const prepared = { ...target, remote, version: fullReport.snapshotDigest };
        const initial = getProposal(prepared.remote, prepared);
        const fullReviewId = initial.review!.id;
        const originalReviewId = initial.originalReview!.id;
        const originalText = initial.originalText;
        const srIds = [...initial.srIds];
        const version = prepared.version;
        expect(version.trim()).not.toBe("");
        expect(initial.review?.passed).toBe(true);
        await expectBusinessRejection(
          client.command(
            { type: "approveFullReview", reviewId: unique("old-review"), snapshotDigest: version },
            prepared.selection,
          ),
        );
        await expectBusinessRejection(
          client.command(
            { type: "confirmAlignment", perspective: "business", version: unique("old-version") },
            prepared.selection,
          ),
        );
        await expectBusinessRejection(
          client.command({ type: "confirmProposal", version }, prepared.selection),
        );
        for (const perspective of ["business", "development", "testing"] as const) {
          await commandAndRead(
            client,
            { type: "confirmAlignment", perspective, version },
            prepared,
          );
          const current = getProposal(await client.read(prepared.selection), prepared);
          expect(current.alignment).toContainEqual(
            expect.objectContaining({
              perspective,
              version,
              employeeId: client.identity.employeeId,
            }),
          );
          if (perspective !== "testing")
            await expectBusinessRejection(
              client.command({ type: "confirmProposal", version }, prepared.selection),
            );
        }
        const aligned = getProposal(await client.read(prepared.selection), prepared);
        expect(aligned.requirementsPr).toBeUndefined();
        const confirmations = aligned.alignment!.filter((entry) => entry.version === version);
        expect(confirmations.map((entry) => entry.perspective).sort()).toEqual([
          "business",
          "development",
          "testing",
        ]);
        expect(
          confirmations.every(
            (entry) =>
              entry.employeeId === client.identity.employeeId && Boolean(entry.confirmedAt),
          ),
        ).toBe(true);
        const handoff = await client.call(
          "readPrHandoff",
          [{ projectId: prepared.projectId, irId: prepared.irId }],
          prepared.selection,
        );
        expect(handoff.ready, handoff.blockers.join("; ")).toBe(true);
        expect(handoff.files.length).toBeGreaterThan(0);
        const confirmed = await commandAndRead(
          client,
          { type: "confirmProposal", version },
          prepared,
        );
        const candidate = getProposal(confirmed, prepared).proposalDelivery!;
        expect(candidate.version).toBe(version);
        expect(candidate.confirmedBy).toBe(client.identity.employeeId);
        expect(candidate.candidate.trim()).not.toBe("");
        expect(candidate.files).toEqual(
          expect.arrayContaining(materialVersions(getProposal(confirmed, prepared))),
        );
        expect(getProposal(confirmed, prepared).requirementsPr).toBeUndefined();
        await expectBusinessRejection(
          client.command(
            { type: "publishProposal", candidate: unique("wrong-candidate") },
            prepared.selection,
          ),
        );
        const publish: AIReqAction = {
          type: "publishProposal",
          candidate: candidate.candidate,
          operationId: unique("publish"),
        };
        const receipt = await client.command(publish, prepared.selection);
        expect(receipt.status, receipt.error).not.toBe("failed");
        const published = await client.read(prepared.selection);
        const frozen = getProposal(published, prepared);
        expect(frozen.status).toBe("requirements-pr");
        expect(frozen.requirementsPr?.status).toBe("opened");
        expect(frozen.proposalDelivery).toMatchObject({
          candidate: candidate.candidate,
          version,
          pushedCandidate: candidate.candidate,
          prCandidate: candidate.candidate,
        });
        expect(
          published.view.groups.some(
            (group) => group.projectId === prepared.projectId && group.id === prepared.irId,
          ),
        ).toBe(false);
        const repeated = await client.command(publish, prepared.selection);
        expect(repeated.operationId).toBe(receipt.operationId);
        expect(
          getProposal(await client.read(prepared.selection), prepared).proposalDelivery?.candidate,
        ).toBe(candidate.candidate);
        await expectBusinessRejection(
          client.command(
            { type: "reviseProposalMaterial", target: "test-plan", note: "补充引用换行的测试用例" },
            prepared.selection,
          ),
        );
        await expectBusinessRejection(
          client.command(
            {
              type: "deleteRequirement",
              version: 1,
              projectId: prepared.projectId,
              irId: prepared.irId,
            },
            prepared.selection,
          ),
        );
        const stillFrozen = getProposal(await client.read(prepared.selection), prepared);
        expect(materialVersions(stillFrozen)).toEqual(materialVersions(frozen));
        expect(stillFrozen.proposalDelivery).toEqual(frozen.proposalDelivery);
        await expectBusinessRejection(
          client.command(
            { type: "closeProposalPr", candidate: unique("wrong-close-candidate") },
            prepared.selection,
          ),
        );
        await commandAndRead(
          client,
          { type: "closeProposalPr", candidate: candidate.candidate },
          prepared,
        );
        const closed = getProposal(await client.read(prepared.selection), prepared);
        expect(closed.requirementsPr?.status).toBe("closed");
        expect(closed.id).toBe(prepared.irId);
        expect(closed.originalText).toBe(originalText);
        expect(closed.srIds).toEqual(srIds);
        expect(materialVersions(closed)).toEqual(materialVersions(frozen));
        await commandAndRead(
          client,
          {
            type: "reviseProposalMaterial",
            target: "test-plan",
            note: "补充 CSV 引用单元格换行和失败重试的验收用例。",
          },
          prepared,
        );
        await completeSolutionMaterial(client, prepared);
        const revised = getProposal(await client.read(prepared.selection), prepared);
        expect(revised.originalText).toBe(originalText);
        expect(revised.srIds).toEqual(srIds);
        expect(revised.originalReview?.id).toBe(originalReviewId);
        expect(revised.originalReview?.passed).toBe(true);
        expect(approvalRetained(revised, fullReviewId)).toBe(true);
        expect(
          revised.review?.humanDecision && !revised.review.invalidatedReason,
          "the changed package must not retain an effective full approval",
        ).toBeFalsy();
        expect(revised.alignment?.some((entry) => entry.version === version)).toBeFalsy();
        expect(revised.materialHistory?.some((history) => history.materials.length > 0)).toBe(true);
        await expectBusinessRejection(
          client.command(
            { type: "approveFullReview", reviewId: fullReviewId, snapshotDigest: version },
            prepared.selection,
          ),
        );
        await expectBusinessRejection(
          client.command({ type: "confirmProposal", version }, prepared.selection),
        );
        expect(
          (await client.read(prepared.selection)).view.groups.some(
            (group) => group.projectId === prepared.projectId && group.id === prepared.irId,
          ),
        ).toBe(false);
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
        expect(before.session).toBeDefined();
        const group = getProposal(before, target);
        await client.call("retrySession", [target.selection], target.selection);
        const recovered = await client.read(target.selection);
        expect(recovered.session?.sessionId).toBe(before.session!.sessionId);
        expect(recovered.workspace).toEqual(before.workspace);
        expect(getProposal(recovered, target).files).toEqual(group.files);
        expect(getProposal(recovered, target).srIds).toEqual([]);
        expect(getProposal(recovered, target).originalReview).toBeUndefined();
        const absentPath = `docs/requirements/${target.irId}/not-generated.md`;
        let failure: unknown;
        let accepted: boolean | undefined;
        try {
          accepted = await client.call(
            "retryMaterial",
            [absentPath, target.selection],
            target.selection,
          );
        } catch (error) {
          failure = error;
        }
        if (failure === undefined) expect(accepted).toBe(false);
        else expect(failure).toBeInstanceOf(Error);
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
        const unrelated = before.view.drafts.filter((group) => group.id !== target.irId);
        await client.command(
          { type: "deleteRequirement", version: 1, projectId: target.projectId, irId: target.irId },
          target.selection,
        );
        const deleted = await client.read({ projectId: target.projectId });
        expect(deleted.view.drafts.some((group) => group.id === target.irId)).toBe(false);
        expect(deleted.view.groups.some((group) => group.id === target.irId)).toBe(false);
        expect(deleted.view.drafts.filter((group) => group.id !== target.irId)).toEqual(unrelated);
        expect(deleted.view.srs.filter((sr) => sr.irId === target.irId)).toEqual([]);
      });
    },
    config.timeoutMs,
  );
});
