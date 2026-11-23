import { describe, expect, it } from "vitest";
import type { AIReqWorkflowView } from "@zcode/services/aireq";
import { connectST, unique, type STClient } from "./client.js";
import { config, requireConfig } from "./config.js";
import { createProject, createProposal } from "./business.js";
import {
  approveOriginalReview,
  completeBusinessMaterial,
  completeSolutionMaterial,
  confirmAllPerspectives,
  discuss,
  expectBusinessRejection,
  getProposal,
  submitReview,
  waitForReview,
} from "./proposal-flow.js";

// Read the server's public projection; never call services/aireq derived functions here.
// Rules: section-navigation-and-ideas.md and services/aireq/CONTRACT.md.
async function usingClient(run: (client: STClient) => Promise<void>, employeeId?: string) {
  const client = await connectST(employeeId);
  try {
    await run(client);
  } finally {
    await client.close();
  }
}
function summary(view: AIReqWorkflowView, projectId: string, releaseId: string) {
  const release = view.releases.find(
    (item) => item.projectId === projectId && item.id === releaseId,
  );
  expect(release, "空 Release 也必须有同源统计").toBeDefined();
  return release!;
}
function projectActivity(view: AIReqWorkflowView, projectId: string) {
  const irIds = new Set(
    view.requirements.filter((group) => group.projectId === projectId).map((group) => group.id),
  );
  return {
    operations: view.operations.filter(
      (item) =>
        (item.irId !== undefined && irIds.has(item.irId)) ||
        item.irIds?.some((id) => irIds.has(id)),
    ),
    requirements: view.requirements.filter((item) => item.projectId === projectId),
    sessions: view.sessions.filter((item) => item.projectId === projectId),
  };
}

describe("ST same-owner workflow projections", () => {
  it(
    "shares role lists while allowing only the administrator to change project membership",
    async () => {
      await usingClient(async (client) => {
        const target = await createProject(client);
        const other = await createProject(client);
        const admin = await connectST("y00000000");
        const member = await connectST(config.otherEmployeeId);
        try {
          expect(member.identity.employeeId).not.toBe(client.identity.employeeId);
          const development = {
            projectId: target.projectId,
            employeeId: member.identity.employeeId,
            role: "development",
          } as const;
          const testing = { ...development, role: "testing" } as const;
          const add = { type: "addProjectRoleMember", ...development } as const;
          const remove = { type: "removeProjectRoleMember", ...development } as const;
          const baseline = (await client.read(target.selection)).view;
          expect(baseline.roleAdministrator).toBe(false);
          await expectBusinessRejection(client.command(add, target.selection));
          expect((await client.read(target.selection)).view.revision).toBe(baseline.revision);

          const operationId = unique("add-project-member");
          const accepted = await admin.command(
            { ...add, operationId, expectedRevision: baseline.revision },
            target.selection,
          );
          expect(accepted.receipt).toMatchObject({
            status: "completed",
            actorEmployeeId: admin.identity.employeeId,
          });
          expect(
            await admin.command(
              { ...add, operationId, expectedRevision: baseline.revision },
              target.selection,
            ),
          ).toEqual(accepted);
          await expectBusinessRejection(admin.command(add, target.selection));
          await expectBusinessRejection(
            admin.command(
              { type: "addProjectRoleMember", ...testing, expectedRevision: baseline.revision },
              target.selection,
            ),
          );
          expect(
            (await admin.command({ type: "addProjectRoleMember", ...testing }, target.selection))
              .receipt.status,
          ).toBe("completed");

          const list = (view: AIReqWorkflowView, projectId = target.projectId) =>
            view.projectRoleMembers.filter((entry) => entry.projectId === projectId);
          const shared = (await client.read(target.selection)).view;
          expect(list(shared)).toEqual([development, testing]);
          expect(list((await member.read(target.selection)).view)).toEqual(list(shared));
          expect(list((await admin.read(target.selection)).view)).toEqual(list(shared));
          expect(list(shared, other.projectId)).toEqual([]);

          await expectBusinessRejection(member.command(remove, target.selection));
          await expectBusinessRejection(
            admin.command({ ...remove, projectId: other.projectId }, other.selection),
          );
          expect((await admin.command(remove, target.selection)).receipt.status).toBe("completed");
          expect(list((await client.read(target.selection)).view)).toEqual([testing]);
          await expectBusinessRejection(admin.command(remove, target.selection));
        } finally {
          await Promise.all([admin.close(), member.close()]);
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "archives the same IR and verified file set independently of the code source",
    async () => {
      await usingClient(async (client) => {
        const target = await createProject(client);
        const emptyView = (await client.read(target.selection)).view;
        const empty = summary(emptyView, target.projectId, target.releaseId);
        expect(empty).toMatchObject({
          requirementCount: 0,
        });
        const text = unique("未评审提案不计入正式文档");
        const created = await client.command(
          {
            type: "createProposal",
            projectId: target.projectId,
            releaseId: target.releaseId,
            originalText: text,
          },
          target.selection,
        );
        const current = (await client.read(target.selection)).view;
        const currentSummary = summary(current, target.projectId, target.releaseId);
        expect(currentSummary).toMatchObject({
          requirementCount: 1,
        });
        expect(current.srs.filter((sr) => sr.projectId === target.projectId)).toEqual([]);

        const irId = requireConfig(created.irId, "提案创建回执的 IR 标识");
        const proposal = { ...target, irId, selection: { projectId: target.projectId, irId } };
        await completeBusinessMaterial(client, proposal);
        await submitReview(client, proposal, "original");
        await approveOriginalReview(client, proposal);
        const initial = getProposal(await completeSolutionMaterial(client, proposal), proposal);
        expect(initial.srIds.length).toBeGreaterThanOrEqual(2);
        const [first, second] = initial.srIds;
        const estimate = { workingDays: 2, assumptions: "复用已配置的导出基础设施。" };
        // Repair the actual dependency document using the generated SR identities.
        const dependencies = initial.srIds.map((srId) => ({
          srId,
          estimate,
          prerequisites:
            srId === first || srId === second
              ? [{ srId: srId === first ? second! : first!, reason: "使用前置项的接口结果。" }]
              : [],
        }));
        await discuss(client, proposal, JSON.stringify({ srs: dependencies }));
        const cyclic = getProposal(await client.read(proposal.selection), proposal);
        expect(cyclic.solutionCheck?.issues).toContainEqual({
          path: `docs/requirements/${irId}/sr-dependencies.json`,
          reason: expect.stringMatching(/循环|成环/),
        });
        expect(cyclic.review).toBeUndefined();
        await discuss(
          client,
          proposal,
          JSON.stringify({
            srs: dependencies.map((row) =>
              row.srId === first ? { ...row, prerequisites: [] } : row,
            ),
          }),
        );
        await submitReview(client, proposal, "full");
        const { review } = await waitForReview(client, proposal, "full");
        const administrator = await connectST("y00000000");
        const { group, remote: confirmed } = await confirmAllPerspectives(
          administrator,
          proposal,
          review,
        ).finally(() => administrator.close());
        expect(group.srIds).toEqual(initial.srIds);
        const confirmations =
          group.materialHistory?.filter((entry) => entry.event?.type === "confirmation") ?? [];
        expect(confirmations).toHaveLength(4);
        expect(confirmations[0]?.materials.map((file) => file.path)).toEqual([group.documentPath]);
        expect(confirmations[1]?.materials.map((file) => file.path).sort()).toEqual(
          group.files.map((file) => file.path).sort(),
        );
        expect(confirmations.at(-1)).toMatchObject({
          event: { type: "confirmation", role: "testing", employeeId: "y00000000" },
          changedAt: expect.any(String),
        });
        expect(summary(confirmed.view, target.projectId, target.releaseId)).toMatchObject({
          requirementCount: 1,
        });
        const project = confirmed.view.projects.find((item) => item.id === target.projectId)!;
        const replacementUrl = `https://example.invalid/${unique("st-replacement")}.git`;
        const defaultBranch = unique("st-code-source");
        await client.call("projects.saveRepository", [
          {
            projectId: project.id,
            name: project.name,
            repositoryUrl: replacementUrl,
            defaultBranch,
            expectedRevision: project.revision,
            operationId: unique("update-code-source"),
          },
        ]);
        const beforeArchive = await client.read(proposal.selection);
        expect(beforeArchive.view.projects.find((item) => item.id === project.id)).toMatchObject({
          repositoryUrl: replacementUrl,
          defaultBranch,
        });
        expect(getProposal(beforeArchive, proposal).proposalDelivery).toEqual(
          group.proposalDelivery,
        );
        const action = {
          type: "archiveProposal",
          projectId: project.id,
          irId,
          candidate: group.proposalDelivery!.candidate,
          operationId: unique("archive-materials"),
        } as const;
        await expectBusinessRejection(
          client.command(
            { ...action, expectedRevision: confirmed.view.revision },
            proposal.selection,
          ),
        );
        const result = await client.command(action, proposal.selection);
        expect(result.receipt).toMatchObject({ status: "completed", irId });
        expect(await client.command(action, proposal.selection)).toEqual(result);
        const { view: archived, session } = await client.read(proposal.selection);
        expect(session).toBeUndefined();
        await expectBusinessRejection(
          client.command(
            {
              ...action,
              operationId: unique("archive-again"),
            },
            proposal.selection,
          ),
        );
        await expectBusinessRejection(
          client.command(
            {
              type: "deleteRequirement",
              projectId: project.id,
              irId,
            },
            proposal.selection,
          ),
        );
        expect(summary(archived, target.projectId, target.releaseId)).toMatchObject({
          requirementCount: 1,
        });
        const matches = archived.requirements.filter((item) => item.id === irId);
        expect(matches).toHaveLength(1);
        const [formal] = matches;
        expect(formal).toMatchObject({
          originalText: text,
          releaseId: target.releaseId,
          srIds: group.srIds,
          review: { id: review.id },
        });
        expect(formal?.archive).toEqual({
          archivedBy: client.identity.employeeId,
          archivedAt: expect.any(String),
          files: group.files,
        });
        expect(formal?.freeze?.files).toEqual(group.files);
        expect(formal?.materialHistory).toEqual(group.materialHistory);
        expect(archived.materials.filter((item) => item.irId === irId)).toEqual(
          expect.arrayContaining(group.files.map((file) => expect.objectContaining(file))),
        );
      });
    },
    config.timeoutMs,
  );

  it(
    "projects global Release counts without exposing other projects' details",
    async () => {
      await usingClient(async (client) => {
        const target = await createProject(client);
        const other = await createProject(client);
        const second = await client.command(
          { type: "createRelease", projectId: target.projectId, title: unique("第二版本") },
          target.selection,
        );
        expect(second.receipt.status).toBe("completed");
        const directory = (await client.read(target.selection)).view;
        const secondReleases = directory.releases.filter(
          (item) => item.projectId === target.projectId && item.id !== target.releaseId,
        );
        expect(secondReleases).toHaveLength(1);
        const secondRelease = secondReleases[0]!;
        expect(summary(directory, other.projectId, other.releaseId)).toMatchObject({
          requirementCount: 0,
        });
        await client.command(
          {
            type: "createProposal",
            projectId: target.projectId,
            originalText: unique("第一版本需求"),
            releaseId: target.releaseId,
          },
          target.selection,
        );
        await client.command(
          {
            type: "createProposal",
            projectId: target.projectId,
            originalText: unique("第二版本需求甲"),
            releaseId: secondRelease.id,
          },
          target.selection,
        );
        await client.command(
          {
            type: "createProposal",
            projectId: target.projectId,
            originalText: unique("第二版本需求乙"),
            releaseId: secondRelease.id,
          },
          target.selection,
        );
        const view = (await client.read(target.selection)).view;
        expect(summary(view, target.projectId, target.releaseId)).toMatchObject({
          requirementCount: 1,
        });
        expect(summary(view, target.projectId, secondRelease.id)).toMatchObject({
          title: secondRelease.title,
          createdAt: secondRelease.createdAt,
          requirementCount: 2,
        });
        const otherView = (await client.read(other.selection)).view;
        expect(summary(otherView, target.projectId, target.releaseId)).toEqual(
          summary(view, target.projectId, target.releaseId),
        );
        expect(summary(otherView, target.projectId, secondRelease.id)).toEqual(
          summary(view, target.projectId, secondRelease.id),
        );
        expect(otherView.requirements.some((item) => item.projectId === target.projectId)).toBe(
          false,
        );
      });
    },
    config.timeoutMs,
  );

  it(
    "does not create operations or new sessions through repeated reads and bootstrap",
    async () => {
      await usingClient(async (client) => {
        const target = await createProposal(client, unique("只读不生成动态"));
        const baseline = (await client.read(target.selection)).view;
        const activity = projectActivity(baseline, target.projectId);
        const stats = summary(baseline, target.projectId, target.releaseId);
        for (let attempt = 0; attempt < 3; attempt++) {
          await client.bootstrap();
          const reread = (await client.read(target.selection)).view;
          expect(projectActivity(reread, target.projectId)).toEqual(activity);
          expect(summary(reread, target.projectId, target.releaseId)).toEqual(stats);
          expect(reread.running.filter((item) => item.projectId === target.projectId)).toEqual([]);
        }
      });
    },
    config.timeoutMs,
  );
});
