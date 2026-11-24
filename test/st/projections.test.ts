import { describe, expect, it } from "vitest";
import type { AIReqWorkflowView } from "@zcode/services/aireq";
import { connectST, unique, type STClient } from "./client.js";
import { config } from "./config.js";
import { createProject, createProposal } from "./business.js";
import { openNative } from "./native.js";
import {
  completeBusinessMaterial,
  expectBusinessRejection,
  getMaterials,
  getProposal,
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
    "keeps the same IR, file contents and Release count when the project working directory changes",
    async () => {
      await usingClient(async (client) => {
        const target = await createProposal(client);
        const before = await completeBusinessMaterial(client, target);
        expect(summary(before.view, target.projectId, target.releaseId).requirementCount).toBe(1);
        const project = before.view.projects.find((item) => item.id === target.projectId)!;
        const repositoryUrl = project.repositoryUrl!;
        const defaultBranch = project.defaultBranch;
        const workDirectory = `${project.workDirectory}-${unique("st-moved")}`;
        await client.call("projects.saveRepository", [
          {
            projectId: project.id,
            name: project.name,
            repositoryUrl,
            defaultBranch,
            workDirectory,
            expectedRevision: project.revision,
            operationId: unique("update-code-source"),
          },
        ]);
        const after = await client.read(target.selection);
        expect(after.view.projects.find((item) => item.id === project.id)).toMatchObject({
          repositoryUrl,
          defaultBranch,
          workDirectory,
        });
        expect(summary(after.view, target.projectId, target.releaseId).requirementCount).toBe(1);
        expect(getProposal(after, target)).toEqual(getProposal(before, target));
        expect(getMaterials(after, target)).toEqual(getMaterials(before, target));
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
          confirmedRequirementCount: 0,
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
          confirmedRequirementCount: 0,
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
    "does not change workflow data or existing session history through repeated reads and bootstrap",
    async () => {
      await usingClient(async (client) => {
        const target = await createProposal(client, unique("只读不生成动态"));
        await completeBusinessMaterial(client, target);
        const baseline = await client.read(target.selection);
        const stats = summary(baseline.view, target.projectId, target.releaseId);
        const session = await openNative(client, baseline);
        try {
          const before = await session.waitIdle();
          expect(before.rows.window).toContainEqual(expect.objectContaining({ kind: "userInput" }));
          for (let attempt = 0; attempt < 3; attempt++) {
            await client.bootstrap();
            const reread = await client.read(target.selection);
            expect(reread).toEqual(baseline);
            expect(summary(reread.view, target.projectId, target.releaseId)).toEqual(stats);
          }
          const after = await session.snapshot();
          expect(after.rows.window).toEqual(before.rows.window);
          expect(after.control.phase).toBe(before.control.phase);
        } finally {
          await session.close();
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "retries only the current material identified by its project, Release, IR, path and digest",
    async () => {
      await usingClient(async (client) => {
        const target = await createProposal(client);
        const baseline = await completeBusinessMaterial(client, target);
        const { documentPath } = getProposal(baseline, target);
        const material = getMaterials(baseline, target).find(({ path }) => path === documentPath);
        expect(material).toMatchObject({
          valid: true,
          content: expect.stringMatching(/\S/),
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        });
        const request = {
          ...target.selection,
          releaseId: target.releaseId,
          path: documentPath,
          sha256: material!.sha256,
        };
        expect(await client.call("retryMaterial", [request])).toBe(true);
        const staleSha = `${request.sha256[0] === "0" ? "1" : "0"}${request.sha256.slice(1)}`;
        await expect(client.call("retryMaterial", [{ ...request, sha256: staleSha }])).rejects.toThrow(
          "材料版本已变化，请重新读取当前版本。",
        );
        for (const wrong of [
          { ...request, releaseId: unique("missing-release") },
          { ...request, path: `${documentPath}.missing` },
        ]) {
          await expect(client.call("retryMaterial", [wrong])).rejects.toThrow(
            "材料不属于当前需求版本。",
          );
        }
        expect(await client.read(target.selection)).toEqual(baseline);
      });
    },
    config.timeoutMs,
  );
});
