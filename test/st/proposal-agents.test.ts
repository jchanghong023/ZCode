import { describe, expect, it } from "vitest";
import type { AIReqProjectRoleMember } from "@zcode/services/aireq";
import { requireTestProject, takeRequirement } from "./business.js";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
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

async function grantProjectRole(
  admin: STClient,
  selection: { projectId: string; irId: string },
  member: AIReqProjectRoleMember,
) {
  const added = await admin.command({ type: "addProjectRoleMember", ...member }, selection);
  expect(added.receipt.status, added.receipt.error).toBe("completed");
  let granted = true;
  return async () => {
    if (!granted) return;
    granted = false;
    const removed = await admin.command({ type: "removeProjectRoleMember", ...member }, selection);
    expect(removed.receipt.status, removed.receipt.error).toBe("completed");
  };
}

describe("co-creation agents through the public API", () => {
  it(
    "isolates discussion history between roles and IRs in one Release, and enforces project membership",
    async () => {
      const business = await connectST();
      const tester = await connectST(config.testerEmployeeId);
      const admin = await connectST("y00000000");
      let revoke: (() => Promise<void>) | undefined;
      try {
        expect(
          new Set([business, tester, admin].map(({ identity }) => identity.employeeId)).size,
        ).toBe(3);
        const target = await takeRequirement(business, {
          requireRelease: true,
          requireSibling: true,
        });
        // 云龙目录不能由 ST 新建 IR；同版本隔离必须占用两条已预备的不同 IR。
        const sibling = await takeRequirement(business, {
          projectId: target.projectId,
          releaseId: target.releaseId,
        });
        expect(sibling.irId).not.toBe(target.irId);
        expect(getProposal(sibling.remote, sibling).releaseId).toBe(target.releaseId);
        // 另一项目只做错配读取，不占用其 IR，也不修改其配置。
        const hasOtherFixture = config.fixtures.projects?.some(
          ({ projectId }) => projectId !== target.projectId,
        );
        const other = hasOtherFixture
          ? await requireTestProject(business, target.projectId)
          : requireConfig(
              target.remote.view.projects.find(({ id }) => id !== target.projectId),
              "用于会话错配读取的另一云龙项目",
            );
        const selection = proposalSelection(target);
        const requirements = { ...selection, discussionPhase: "requirements" } as const;
        const solution = { ...selection, discussionPhase: "solution" } as const;
        const projectRoles = (remote: typeof target.remote) =>
          remote.view.projectRoleMembers.filter(({ projectId }) => projectId === target.projectId);
        const baselineRoles = projectRoles(target.remote);
        // 撤回测试角色后还拥有开发角色会继续有权进入方案 Agent，因而不能作为隔离夹具。
        if (
          baselineRoles.some(
            ({ employeeId }) =>
              employeeId === business.identity.employeeId ||
              employeeId === tester.identity.employeeId,
          )
        ) {
          throw new Error("ST 前置阻塞：会话隔离夹具项目的业务及测试工号必须没有预置项目角色");
        }
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
        revoke = await grantProjectRole(admin, selection, member);
        const allowed = await tester.read(solution);
        expect(projectRoles(allowed)).toEqual([...baselineRoles, member]);
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
        expect((await tester.read({ ...solution, projectId: other.id })).session).toBeUndefined();

        const reqText = unique("请补充登录前不可导出的验收条件");
        const solutionText = unique("请补充服务端测试数据隔离");
        const siblingText = unique("请补充审计追踪的验收条件");
        await discuss(tester, target, solutionText, "solution");
        const solutionFirst = await tester.read(solution);
        const srsFor = (remote: typeof target.remote, { projectId, irId }: typeof selection) =>
          remote.view.srs.filter((sr) => sr.projectId === projectId && sr.irId === irId);
        const solutionGroup = getProposal(solutionFirst, target);
        expect(solutionGroup.documentVersion).toEqual({ number: 1 });
        expect(solutionGroup.srIds.length).toBeGreaterThan(0);
        expect(
          srsFor(solutionFirst, target)
            .map(({ id }) => id)
            .sort(),
        ).toEqual([...solutionGroup.srIds].sort());
        const solutionMaterials = getMaterials(solutionFirst, target);
        expect(solutionMaterials).toContainEqual(
          expect.objectContaining({ srId: solutionGroup.srIds[0] }),
        );
        expect(solutionMaterials.some((file) => file.kind === "solution")).toBe(true);
        const siblingAfterSolution = await business.read(sibling.selection);
        expect(siblingAfterSolution.session).toEqual(sibling.remote.session);
        expect(getProposal(siblingAfterSolution, sibling)).toEqual(
          getProposal(sibling.remote, sibling),
        );
        expect(getMaterials(siblingAfterSolution, sibling)).toEqual(
          getMaterials(sibling.remote, sibling),
        );
        expect(srsFor(siblingAfterSolution, sibling)).toEqual(srsFor(sibling.remote, sibling));
        await discuss(business, target, reqText);
        const beforeSiblingEdit = await business.read(requirements);
        await discuss(business, sibling, siblingText);
        const readHistory = async (actor: typeof business, remote: typeof initial) => {
          const native = await openNative(actor, remote);
          try {
            const { control, rows } = await native.snapshot();
            return { phase: control.phase, rows: rows.window };
          } finally {
            await native.close();
          }
        };
        const inputs = ({ rows }: Awaited<ReturnType<typeof readHistory>>) =>
          rows.filter((row) => row.kind === "userInput").map((row) => row.text);
        const requirementsRemote = await business.read(requirements);
        const solutionRemote = await tester.read(solution);
        const siblingRemote = await business.read(sibling.selection);
        expect(getMaterials(siblingRemote, sibling).length).toBeGreaterThan(0);
        expect(getMaterials(requirementsRemote, target)).toEqual(
          getMaterials(beforeSiblingEdit, target),
        );
        expect(srsFor(requirementsRemote, target)).toEqual(srsFor(beforeSiblingEdit, target));
        expect(siblingRemote.session).toMatchObject({
          ...sibling.selection,
          phase: "requirements",
        });
        const siblingSession = requireConfig(siblingRemote.session, "旁路需求讨论会话");
        expect(
          new Set([irSession.sessionId, srSession.sessionId, siblingSession.sessionId]).size,
        ).toBe(3);
        const businessInputs = inputs(await readHistory(business, requirementsRemote));
        expect(businessInputs).toContain(reqText);
        expect(businessInputs).not.toContain(solutionText);
        expect(businessInputs).not.toContain(siblingText);
        const solutionHistory = await readHistory(tester, solutionRemote);
        const solutionInputs = inputs(solutionHistory);
        expect(solutionInputs).toContain(solutionText);
        expect(solutionInputs).not.toContain(reqText);
        expect(solutionInputs).not.toContain(siblingText);
        const siblingInputs = inputs(await readHistory(business, siblingRemote));
        expect(siblingInputs).toContain(siblingText);
        expect(siblingInputs).not.toContain(reqText);
        expect(siblingInputs).not.toContain(solutionText);

        const testerRequirements = await tester.read(requirements);
        expect(testerRequirements.session?.sessionId).toBe(irSession.sessionId);
        const beforeRetry = await readHistory(tester, testerRequirements);
        expect(inputs(beforeRetry)).toEqual(businessInputs);
        expect(await tester.call("retrySession", [requirements, irSession.sessionId])).toBeNull();
        for (const mismatchedId of [srSession.sessionId, siblingSession.sessionId]) {
          await expect(tester.call("retrySession", [requirements, mismatchedId])).rejects.toThrow(
            "会话已切换或不存在。",
          );
        }
        const repaired = await tester.read(requirements);
        expect(repaired).toEqual(testerRequirements);
        expect(await readHistory(tester, repaired)).toEqual(beforeRetry);
        expect(await readHistory(tester, await tester.read(solution))).toEqual(solutionHistory);

        await revoke();
        expect((await tester.read(solution)).session).toBeUndefined();
        const stillReadable = await tester.read(requirements);
        expect(projectRoles(stillReadable)).toEqual(baselineRoles);
        expect(stillReadable.session?.sessionId).toBe(irSession.sessionId);
        expect(getMaterials(stillReadable, target).length).toBeGreaterThan(0);
      } finally {
        try {
          await revoke?.();
        } finally {
          await Promise.all([business.close(), tester.close(), admin.close()]);
        }
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
      let revoke: (() => Promise<void>) | undefined;
      try {
        expect(
          new Set([business, developer, admin].map(({ identity }) => identity.employeeId)).size,
        ).toBe(3);
        const target = await takeRequirement(business);
        const selection = proposalSelection(target);
        // 评审需要业务工号没有方案权限，并由本例授予开发角色后执行独立评审。
        if (
          target.remote.view.projectRoleMembers.some(
            ({ projectId, employeeId }) =>
              projectId === target.projectId &&
              (employeeId === business.identity.employeeId ||
                employeeId === developer.identity.employeeId),
          )
        ) {
          throw new Error("ST 前置阻塞：评审夹具项目的业务及开发工号必须没有预置项目角色");
        }
        revoke = await grantProjectRole(admin, selection, {
          projectId: target.projectId,
          employeeId: developer.identity.employeeId,
          role: "development",
        });
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
        try {
          await revoke?.();
        } finally {
          await Promise.all([business.close(), developer.close(), admin.close()]);
        }
      }
    },
    config.timeoutMs,
  );
});
