import { describe, expect, it } from "vitest";
import { createProject, createProposal } from "./business.js";
import { connectST, unique, waitUntil } from "./client.js";
import { config, requireConfig } from "./config.js";
import { openNative } from "./native.js";
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

describe("co-creation agents through the public API", () => {
  it(
    "isolates discussion history by agent and requirement, and enforces project membership",
    async () => {
      const business = await connectST();
      const tester = await connectST(config.testerEmployeeId);
      const admin = await connectST("y00000000");
      try {
        expect(business.identity.employeeId).not.toBe(tester.identity.employeeId);
        const target = await createProposal(business);
        const other = await createProject(business);
        const selection = proposalSelection(target);
        const requirements = { ...selection, discussionPhase: "requirements" } as const;
        const solution = { ...selection, discussionPhase: "solution" } as const;
        const initial = await business.read(requirements);
        const irSession = requireConfig(initial.session, "需求讨论会话");
        expect(irSession.phase).toBe("requirements");
        expect((await business.read(solution)).session).toBeUndefined();
        expect((await tester.read(solution)).session).toBeUndefined();

        const member = {
          projectId: target.projectId,
          employeeId: tester.identity.employeeId,
          role: "testing",
        } as const;
        const added = await admin.command({ type: "addProjectRoleMember", ...member }, selection);
        expect(added.receipt.status, added.receipt.error).toBe("completed");
        const allowed = await tester.read(solution);
        const srSession = requireConfig(allowed.session, "测试成员的方案讨论会话");
        expect(srSession).toMatchObject({
          projectId: target.projectId,
          irId: target.irId,
          phase: "solution",
        });
        expect(srSession.sessionId).not.toBe(irSession.sessionId);
        await expect(
          openNative(business, allowed).then((session) => session.close()),
        ).rejects.toThrow();
        expect((await business.read(solution)).session).toBeUndefined();
        expect(
          (await tester.read({ ...solution, projectId: other.projectId })).session,
        ).toBeUndefined();

        const reqText = unique("请补充登录前不可导出的验收条件");
        const solutionText = unique("请补充服务端测试数据隔离");
        await discuss(tester, target, solutionText, "solution");
        const solutionFirst = await tester.read(solution);
        expect(getProposal(solutionFirst, target).documentVersion).toEqual({ number: 1 });
        expect(getMaterials(solutionFirst, target).some((file) => file.kind === "solution")).toBe(
          true,
        );
        await discuss(business, target, reqText);
        const readInputs = async (actor: typeof business, remote: typeof initial) => {
          const native = await openNative(actor, remote);
          try {
            return (await native.snapshot()).rows.window
              .filter((row) => row.kind === "userInput")
              .map((row) => row.text);
          } finally {
            await native.close();
          }
        };
        const businessInputs = await readInputs(business, await business.read(requirements));
        const solutionInputs = await readInputs(tester, await tester.read(solution));
        expect(businessInputs).toContain(reqText);
        expect(businessInputs).not.toContain(solutionText);
        expect(solutionInputs).toContain(solutionText);
        expect(solutionInputs).not.toContain(reqText);

        const removed = await admin.command(
          { type: "removeProjectRoleMember", ...member },
          selection,
        );
        expect(removed.receipt.status, removed.receipt.error).toBe("completed");
        expect((await tester.read(solution)).session).toBeUndefined();
        const stillReadable = await tester.read(requirements);
        expect(stillReadable.session?.sessionId).toBe(irSession.sessionId);
        expect(getMaterials(stillReadable, target).length).toBeGreaterThan(0);
      } finally {
        await Promise.all([business.close(), tester.close(), admin.close()]);
      }
    },
    config.timeoutMs,
  );

  it(
    "runs optional independent reviews on current files and marks a same-version edit stale",
    async () => {
      const business = await connectST();
      const developer = await connectST(config.otherEmployeeId);
      const admin = await connectST("y00000000");
      try {
        const target = await createProposal(business);
        const selection = proposalSelection(target);
        await admin.command(
          {
            type: "addProjectRoleMember",
            projectId: target.projectId,
            employeeId: developer.identity.employeeId,
            role: "development",
          },
          selection,
        );
        await completeBusinessMaterial(business, target);
        const withSolution = await completeSolutionMaterial(developer, target);
        const initial = getProposal(withSolution, target);
        expect(initial.documentVersion).toEqual({ number: 1 });
        expect(initial.documentReviews).toEqual([]);
        const initialMaterials = getMaterials(withSolution, target);
        await expectBusinessRejection(
          business.command(
            {
              type: "reviewDocuments",
              ...selection,
              agent: "solution",
            },
            selection,
          ),
        );

        const {
          review: requirementsReview,
          action,
          result,
        } = await reviewDocuments(business, target, "requirements", {
          expectedRevision: target.remote.view.revision,
        });
        expect(await business.command(action, selection)).toEqual(result);
        const { remote, review: solutionReview } = await reviewDocuments(
          developer,
          target,
          "solution",
        );
        expect(requirementsReview.version).toBe(1);
        expect(solutionReview.version).toBe(1);
        expect(solutionReview.id).not.toBe(requirementsReview.id);
        const afterReview = getProposal(remote, target);
        expect(afterReview.documentReviews).toEqual(
          expect.arrayContaining([requirementsReview, solutionReview]),
        );
        expect(afterReview.documentReviews).toHaveLength(2);
        expect(afterReview.documentVersion).toEqual(initial.documentVersion);
        expect(afterReview.documentHistory).toEqual([]);
        expect(afterReview.sessions).toEqual(initial.sessions);
        expect(getMaterials(remote, target)).toEqual(initialMaterials);

        for (const [actor, report, otherReport] of [
          [business, requirementsReview, solutionReview],
          [developer, solutionReview, requirementsReview],
        ] as const) {
          const discussion = await actor.read({ ...selection, discussionPhase: report.agent });
          const native = await openNative(actor, discussion);
          try {
            type Row = Awaited<ReturnType<typeof native.snapshot>>["rows"]["window"][number];
            const includesReport = (row: Row, text: string) => {
              const output =
                row.kind === "assistantText"
                  ? row.text
                  : row.kind === "subagent"
                    ? row.summaryText
                    : undefined;
              return output?.includes(text) ?? false;
            };
            const snapshot = await waitUntil(
              `the ${report.agent} review returns to its own discussion`,
              () => native.snapshot(),
              (value) => value.rows.window.some((row) => includesReport(row, report.report!)),
            );
            expect(
              snapshot.rows.window.some((row) => includesReport(row, otherReport.report!)),
            ).toBe(false);
            expect(snapshot.rows.window).toContainEqual(
              expect.objectContaining({
                kind: "userInput",
                sourceCommandId: report.id,
                text: `已发起${report.agent === "requirements" ? "需求评审" : "方案审查"} · V${report.version}`,
              }),
            );
          } finally {
            await native.close();
          }
        }

        const edit = "## 最新验收补充\n导出文件必须保留字段中的换行。";
        await discuss(business, target, edit);
        const changed = await business.read(selection);
        expect(getProposal(changed, target).documentVersion).toEqual({ number: 1 });
        expect(getMaterials(changed, target)).not.toEqual(initialMaterials);
        expect(getProposal(changed, target).documentReviews).toContainEqual({
          ...requirementsReview,
          stale: true,
        });
        const { review: refreshed, remote: reviewed } = await reviewDocuments(
          business,
          target,
          "requirements",
        );
        expect(refreshed.version).toBe(requirementsReview.version);
        expect(refreshed.id).not.toBe(requirementsReview.id);
        expect(getProposal(reviewed, target).documentReviews).toContainEqual({
          ...requirementsReview,
          stale: true,
        });
        expect(getMaterials(reviewed, target)).toEqual(getMaterials(changed, target));
      } finally {
        await Promise.all([business.close(), developer.close(), admin.close()]);
      }
    },
    config.timeoutMs,
  );
});
