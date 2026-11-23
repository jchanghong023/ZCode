import { expect, it } from "vitest";
import type { AIReqMaterialView } from "@zcode/services/aireq";
import { createProposal } from "./business.js";
import { connectST } from "./client.js";
import { config } from "./config.js";
import { openNative } from "./native.js";
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

function orderedMaterials(materials: AIReqMaterialView[], irId: string) {
  return materials
    .filter((item) => item.irId === irId)
    .sort((a, b) => a.path.localeCompare(b.path));
}

it(
  "returns solution design to business clarification without changing material or losing history",
  async () => {
    const client = await connectST();
    try {
      const target = await createProposal(client);
      await completeBusinessMaterial(client, target);
      await submitReview(client, target, "original");
      const approved = getProposal(await approveOriginalReview(client, target), target);
      const original = approved.originalReview!;
      const solution = {
        ...target,
        selection: {
          ...target.selection,
          proposalStep: "solution",
          discussionPhase: "solution",
        } as const,
      };
      await completeSolutionMaterial(client, solution);
      await submitReview(client, solution, "full");
      const { remote: reviewed, review } = await waitForReview(client, solution, "full");
      const before = await commandAndRead(client, alignmentAction(review, "development"), solution);
      const beforeReturn = getProposal(before, target);
      const recordedAlignment = beforeReturn.alignment!;
      expect(recordedAlignment).toHaveLength(1);
      const materials = orderedMaterials(before.view.materials, target.irId);
      expect(materials.length).toBeGreaterThan(1);
      expect(materials.every((item) => item.content?.trim())).toBe(true);

      const reason = "请业务确认导出结果是否包含筛选后被权限规则隐藏的行。";
      const action = {
        type: "returnProposal",
        projectId: target.projectId,
        irId: target.irId,
        reason,
      } as const;
      const tester = await connectST(config.otherEmployeeId);
      try {
        expect(tester.identity.employeeId).not.toBe(client.identity.employeeId);
        const admin = await connectST("y00000000");
        const assignment = {
          projectId: target.projectId,
          employeeId: tester.identity.employeeId,
          role: "testing",
        } as const;
        try {
          await commandAndRead(admin, { type: "addProjectRoleMember", ...assignment }, target);
        } finally {
          await admin.close();
        }
        await expect(
          tester.command(action, { ...solution.selection, proposalStep: "requirements-review" }),
        ).rejects.toThrow(/开发角色/);
        const reviewer = await tester.read({ ...solution.selection, reviewAgent: "a" });
        expect(reviewer.session?.sessionId).toBe(
          review.agents?.find((agent) => agent.id === "a")?.session.sessionId,
        );
        const native = await openNative(tester, reviewer);
        try {
          const initial = await native.snapshot();
          expect(initial.availability.queueEdit.allowed).toBe(false);
          await expect(native.send("stop", {})).rejects.toThrow(/开发角色/);
          await expect(native.send("setAutoDrain", { autoDrain: false })).resolves.toMatchObject({
            status: "rejected",
            reasonCode: "fault.command.capabilityUnsupported",
          });
          const after = await native.snapshot();
          expect(after.revision).toBe(initial.revision);
          expect(after.queue).toEqual(initial.queue);
        } finally {
          await native.close();
        }
        const administrator = await connectST("y00000000");
        try {
          await commandAndRead(
            administrator,
            { type: "removeProjectRoleMember", ...assignment },
            target,
          );
          expect(
            (await tester.read({ ...solution.selection, reviewAgent: "a" })).session,
          ).toBeUndefined();
        } finally {
          await administrator.close();
        }
      } finally {
        await tester.close();
      }
      await expectBusinessRejection(
        client.command({ ...action, reason: "  " }, solution.selection),
      );
      await expectBusinessRejection(
        client.command({ ...action, expectedRevision: reviewed.view.revision }, solution.selection),
      );
      expect(getProposal(await client.read(solution.selection), target)).toEqual(beforeReturn);

      await commandAndRead(client, action, solution);
      const business = {
        ...target,
        selection: {
          ...target.selection,
          proposalStep: "requirements",
          discussionPhase: "requirements",
        } as const,
      };
      const clarified = await client.read(business.selection);
      const returned = getProposal(clarified, target);
      expect(returned.returnFeedback).toMatchObject({
        reason,
        employeeId: client.identity.employeeId,
        round: beforeReturn.proposalRound,
      });
      expect(returned.returnFeedback?.resumedAt).toBeUndefined();
      expect(clarified.session).toMatchObject({
        phase: "requirements",
        round: returned.proposalRound,
      });
      expect(clarified.session?.sessionId).not.toBe(before.session?.sessionId);
      expect(returned.proposalStage).toBe("requirements");
      expect(returned.proposalRound).toBe((beforeReturn.proposalRound ?? 1) + 1);
      expect(returned.files).toEqual(beforeReturn.files);
      expect(returned.snapshot).toEqual(beforeReturn.snapshot);
      expect(returned.srIds).toEqual(beforeReturn.srIds);
      expect(orderedMaterials(clarified.view.materials, target.irId)).toEqual(materials);
      expect(returned.materialHistory).toContainEqual(
        expect.objectContaining({
          version: review.snapshotDigest,
          materials: expect.arrayContaining(materials),
        }),
      );
      expect(returned.materialHistory).toEqual(
        expect.arrayContaining(beforeReturn.materialHistory ?? []),
      );
      expect(returned.originalReview).toBeUndefined();
      expect(returned.review).toBeUndefined();
      expect(returned.alignment ?? []).toEqual([]);
      expect(returned.originalReviewHistory).toContainEqual(
        expect.objectContaining({
          id: original.id,
          humanDecision: original.humanDecision,
          invalidatedReason: expect.any(String),
        }),
      );
      expect(returned.reviewHistory).toContainEqual(
        expect.objectContaining({
          id: review.id,
          invalidatedReason: expect.any(String),
        }),
      );
      expect(returned.alignmentHistory).toEqual(expect.arrayContaining(recordedAlignment));
      await expectBusinessRejection(client.command(action, solution.selection));
      await expectBusinessRejection(
        client.command(alignmentAction(review, "testing"), solution.selection),
      );
      const historical = await client.read({ ...solution.selection, reviewAgent: "a" });
      expect(historical.session?.sessionId).toBe(
        review.agents?.find((agent) => agent.id === "a")?.session.sessionId,
      );
      const oldReviewer = await openNative(client, historical);
      try {
        await expect(oldReviewer.send("stop", {})).rejects.toThrow(/历史阶段/);
      } finally {
        await oldReviewer.close();
      }

      await discuss(
        client,
        business,
        "导出只能包含当前用户按权限可见的筛选结果，并核对不可见行没有被导出。",
      );
      const materialUpdate = await client.read(business.selection);
      const supplemented = getProposal(materialUpdate, target);
      expect(supplemented.returnFeedback?.resumedAt).toBeTruthy();
      expect(supplemented.originalReview).toBeUndefined();
      expect(supplemented.snapshot?.digest).not.toBe(returned.snapshot?.digest);
      expect(supplemented.materialHistory).toEqual(
        expect.arrayContaining(returned.materialHistory!),
      );

      await submitReview(client, business, "original");
      const { review: revised } = await waitForReview(client, business, "original");
      expect(revised.id).not.toBe(original.id);
      const reopened = getProposal(
        await commandAndRead(
          client,
          { type: "acceptProposal", reviewId: revised.id, snapshotDigest: revised.snapshotDigest },
          business,
        ),
        target,
      );
      expect(reopened.proposalStage).toBe("solution");
      expect(reopened.originalReview?.humanDecision?.reviewId).toBe(revised.id);
      await completeSolutionMaterial(client, solution);
      await submitReview(client, solution, "full");
      const { review: revisedSolution } = await waitForReview(client, solution, "full");
      const { group: delivery } = await confirmAllPerspectives(client, solution, revisedSolution);
      await expectBusinessRejection(client.command(action, solution.selection));
      expect(getProposal(await client.read(solution.selection), target)).toEqual(delivery);
    } finally {
      await client.close();
    }
  },
  config.timeoutMs,
);
