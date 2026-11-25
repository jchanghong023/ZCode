import { describe, expect, it } from "vitest";
import {
  AIREQ_ROLE_ADMINISTRATOR,
  type AIReqProject,
  type AIReqProjectRole,
  type AIReqWorkflowView,
} from "@zcode/services/aireq";
import { connectST, unique, type STClient } from "./client.js";
import { config, requireConfig } from "./config.js";
import { requireTestProject, takeRequirement, withProjectRepository } from "./business.js";
import { openNative } from "./native.js";
import {
  completeBusinessMaterial,
  expectBusinessRejection,
  getMaterials,
  getProposal,
} from "./proposal-flow.js";

// Read the server's public projection; never call services/aireq derived functions here.
// Rules: section-navigation.md and services/aireq/CONTRACT.md.
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
  expect(release, "当前项目已分配 IR 的 Release 必须有公开统计").toBeDefined();
  return release!;
}

function countRequirements(requirements: AIReqWorkflowView["requirements"]) {
  return {
    requirementCount: requirements.length,
    completedRequirementCount: requirements.filter(({ process }) => process === "完成").length,
    confirmedRequirementCount: requirements.filter(({ documentVersion }) =>
      Boolean(documentVersion?.confirmation),
    ).length,
  };
}

function canKeepMovedDirectory(project: AIReqProject) {
  return (
    project.repositoryUrl === undefined &&
    project.workDirectory === undefined &&
    config.fixtures.projects?.some(
      (fixture) => fixture.projectId === project.id && fixture.allowUnconfigured === true,
    )
  );
}

describe("ST same-owner workflow projections", () => {
  it(
    "shares role lists while allowing only the administrator to change project membership",
    async () => {
      const failures: unknown[] = [];
      await usingClient(async (client) => {
        let admin: STClient | undefined;
        let member: STClient | undefined;
        try {
          const target = await requireTestProject(client);
          const other = await requireTestProject(client, target.id);
          const selection = { projectId: target.id };
          const otherSelection = { projectId: other.id };
          admin = await connectST(AIREQ_ROLE_ADMINISTRATOR);
          member = await connectST(config.otherEmployeeId);
          expect(member.identity.employeeId).not.toBe(client.identity.employeeId);
          const development = {
            projectId: target.id,
            employeeId: member.identity.employeeId,
            role: "development",
          } as const;
          const testing = { ...development, role: "testing" } as const;
          const add = { type: "addProjectRoleMember", ...development } as const;
          const remove = { type: "removeProjectRoleMember", ...development } as const;
          const list = (view: AIReqWorkflowView, projectId = target.id) =>
            view.projectRoleMembers.filter((entry) => entry.projectId === projectId);
          const baseline = (await client.read(selection)).view;
          const initial = list(baseline);
          const otherMembers = list(baseline, other.id);
          if (
            initial.some(({ employeeId }) => employeeId === development.employeeId) ||
            otherMembers.some(({ employeeId }) => employeeId === development.employeeId)
          ) {
            throw new Error("ST 前置阻塞：专用角色测试工号不得在两个测试项目中已有角色");
          }
          expect(baseline.roleAdministrator).toBe(false);
          await expectBusinessRejection(client.command(add, selection));
          expect((await client.read(selection)).view.revision).toBe(baseline.revision);

          const ownedRoles = new Set<AIReqProjectRole>();
          try {
            const request = {
              ...add,
              operationId: unique("add-project-member"),
              expectedRevision: baseline.revision,
            };
            const accepted = await admin.command(request, selection);
            if (accepted.receipt.status === "completed") ownedRoles.add("development");
            expect(accepted.receipt).toMatchObject({
              status: "completed",
              actorEmployeeId: admin.identity.employeeId,
            });
            expect(await admin.command(request, selection)).toEqual(accepted);
            await expectBusinessRejection(admin.command(add, selection));
            await expectBusinessRejection(
              admin.command(
                { type: "addProjectRoleMember", ...testing, expectedRevision: baseline.revision },
                selection,
              ),
            );
            const addedTesting = await admin.command(
              { type: "addProjectRoleMember", ...testing },
              selection,
            );
            if (addedTesting.receipt.status === "completed") ownedRoles.add("testing");
            expect(addedTesting.receipt.status).toBe("completed");

            const shared = (await client.read(selection)).view;
            expect(list(shared)).toEqual([...initial, development, testing]);
            expect(list((await member.read(selection)).view)).toEqual(list(shared));
            expect(list((await admin.read(selection)).view)).toEqual(list(shared));
            expect(list(shared, other.id)).toEqual(otherMembers);

            await expectBusinessRejection(member.command(remove, selection));
            await expectBusinessRejection(
              admin.command({ ...remove, projectId: other.id }, otherSelection),
            );
            const removed = await admin.command(remove, selection);
            if (removed.receipt.status === "completed") ownedRoles.delete("development");
            expect(removed.receipt.status).toBe("completed");
            expect(list((await client.read(selection)).view)).toEqual([...initial, testing]);
            await expectBusinessRejection(admin.command(remove, selection));
          } catch (error) {
            failures.push(error);
          } finally {
            // 只撤销本例首次接纳的成员写入；重试回执不是一次新的角色变更。
            for (const role of ownedRoles) {
              try {
                const current = (await admin.read(selection)).view;
                expect(list(current)).toContainEqual({ ...development, role });
                const restored = await admin.command(
                  { ...remove, role, expectedRevision: current.revision },
                  selection,
                );
                expect(restored.receipt.status).toBe("completed");
                expect(list((await admin.read(selection)).view)).not.toContainEqual({
                  ...development,
                  role,
                });
              } catch (error) {
                failures.push(error);
              }
            }
          }
        } catch (error) {
          failures.push(error);
        } finally {
          const closed = await Promise.allSettled([admin?.close(), member?.close()]);
          for (const result of closed)
            if (result.status === "rejected") failures.push(result.reason);
        }
      }).catch((error: unknown) => {
        failures.push(error);
      });
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1)
        throw new AggregateError(failures, "ST 项目角色断言、回收或连接关闭失败");
    },
    config.timeoutMs,
  );

  it(
    "keeps the same IR, file contents and Release count when the project working directory changes",
    async () => {
      await usingClient(async (client) => {
        const first = await requireTestProject(client);
        const project = canKeepMovedDirectory(first)
          ? first
          : await requireTestProject(client, first.id);
        if (!canKeepMovedDirectory(project)) {
          // 公开接口不能切回非空旧共享目录，只能在明确允许保留终态的隔离项目迁移。
          throw new Error("ST 前置阻塞：目录迁移需要 allowUnconfigured=true 的未配置专用项目");
        }
        const target = await takeRequirement(client, {
          projectId: project.id,
          requireRelease: true,
        });
        await withProjectRepository(client, target.projectId, async (configured) => {
          const before = await completeBusinessMaterial(client, target);
          const release = summary(before.view, target.projectId, target.releaseId);
          expect(release.requirementCount).toBeGreaterThan(0);
          const materials = getMaterials(before, target);
          expect(materials.length).toBeGreaterThan(0);
          const repositoryUrl = requireConfig(configured.repositoryUrl, "迁移前的仓库地址");
          const directory = requireConfig(configured.workDirectory, "迁移前的隔离工作目录");
          const workDirectory = `${directory}-${unique("st-moved")}`;
          await client.call("projects.saveRepository", [
            {
              projectId: target.projectId,
              repositoryUrl,
              defaultBranch: configured.defaultBranch,
              workDirectory,
              expectedRevision: configured.revision,
              operationId: unique("move-project-directory"),
            },
          ]);
          const after = await client.read(target.selection);
          expect(after.view.projects.find((item) => item.id === target.projectId)).toEqual({
            ...configured,
            name: project.name,
            workDirectory,
            revision: configured.revision + 1,
          });
          expect(summary(after.view, target.projectId, target.releaseId)).toEqual(release);
          expect(getProposal(after, target)).toEqual(getProposal(before, target));
          expect(getMaterials(after, target)).toEqual(materials);
        });
      });
    },
    config.timeoutMs,
  );

  it(
    "projects global Release counts without exposing other projects' details",
    async () => {
      await usingClient(async (client) => {
        const directory = (await client.read()).view;
        expect(directory.requirements).toEqual([]);
        expect(directory.srs).toEqual([]);
        expect(directory.materials).toEqual([]);
        const projects = directory.projects.filter(
          ({ id }) => !directory.releaseReadFailures?.includes(id),
        );
        expect(projects.length, "至少两个可读云龙项目才能验证跨项目隔离").toBeGreaterThan(1);
        let assignedCount = 0;
        let unassignedCount = 0;
        for (const { id: projectId } of projects) {
          const { view } = await client.read({ projectId });
          expect(view.releases).toEqual(directory.releases);
          expect(view.projectRequirementCounts).toEqual(directory.projectRequirementCounts);
          expect(view.requirements.every((item) => item.projectId === projectId)).toBe(true);
          expect(view.srs.every((item) => item.projectId === projectId)).toBe(true);
          expect(view.materials.every((item) => item.projectId === projectId)).toBe(true);

          // 逐项目用公开 IR 重算；没有 Release 的 IR 仍要计入项目统计。
          const counts = countRequirements(view.requirements);
          expect(view.projectRequirementCounts?.[projectId]).toEqual(counts);
          const byRelease = new Map<string, AIReqWorkflowView["requirements"]>();
          let unassigned = 0;
          for (const item of view.requirements) {
            if (!item.releaseId) {
              unassigned++;
              continue;
            }
            const group = byRelease.get(item.releaseId);
            if (group) group.push(item);
            else byRelease.set(item.releaseId, [item]);
          }
          const releases = view.releases.filter((item) => item.projectId === projectId);
          expect(releases.map(({ id }) => id).sort()).toEqual([...byRelease.keys()].sort());
          for (const [releaseId, requirements] of byRelease) {
            const release = summary(view, projectId, releaseId);
            expect(release).toMatchObject(countRequirements(requirements));
            expect(release.requirementCount).toBeGreaterThan(0);
          }
          const assigned = releases.reduce((total, item) => total + item.requirementCount, 0);
          expect(assigned + unassigned).toBe(counts.requirementCount);
          assignedCount += assigned;
          unassignedCount += unassigned;
        }
        expect(assignedCount, "公开目录需有实际分配了 Release 的 IR").toBeGreaterThan(0);
        expect(unassignedCount, "公开目录需有实际未分配 Release 的 IR").toBeGreaterThan(0);
      });
    },
    config.timeoutMs,
  );

  it(
    "does not change workflow data or existing session history through repeated reads and bootstrap",
    async () => {
      await usingClient(async (client) => {
        const target = await takeRequirement(client, { requireRelease: true });
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
        const target = await takeRequirement(client, { requireRelease: true });
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
        await expect(
          client.call("retryMaterial", [{ ...request, sha256: staleSha }]),
        ).rejects.toThrow("材料版本已变化，请重新读取当前版本。");
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
