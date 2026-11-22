import { describe, expect, it } from "vitest";
import type { AIReqWorkflowView } from "@zcode/services/aireq";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { config, requireConfig, type STFixture } from "./config.js";
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
    [...view.drafts, ...view.groups]
      .filter((group) => group.projectId === projectId)
      .map((group) => group.id),
  );
  return {
    operations: view.operations.filter(
      (item) =>
        (item.irId !== undefined && irIds.has(item.irId)) ||
        item.irIds?.some((id) => irIds.has(id)),
    ),
    drafts: view.drafts.filter((item) => item.projectId === projectId),
    formal: view.groups.filter((item) => item.projectId === projectId),
    sessions: view.sessions.filter((item) => item.projectId === projectId),
  };
}

describe("ST same-owner workflow projections", () => {
  it(
    "grants each role to its actual applicant even when clients reuse a request operation ID",
    async () => {
      await usingClient(async (client) => {
        const target = await createProject(client);
        const other = await createProject(client);
        const admin = await connectST("y00000000");
        const second = await connectST(config.otherEmployeeId);
        try {
          expect((await client.read(target.selection)).view.roleAdministrator).toBe(false);
          expect(second.identity.employeeId).not.toBe(client.identity.employeeId);
          const operationId = unique("shared-role-request");
          await client.command(
            {
              type: "requestProjectRoles",
              projectId: target.projectId,
              roles: ["development", "testing"],
              operationId,
            },
            target.selection,
          );
          const pending =
            (await client.read(target.selection)).view.roleRegistrations?.filter(
              (entry) => entry.projectId === target.projectId,
            ) ?? [];
          expect(pending.map((entry) => entry.status)).toEqual(["pending", "pending"]);
          await second.command(
            {
              type: "requestProjectRoles",
              projectId: target.projectId,
              roles: ["development"],
              operationId,
            },
            target.selection,
          );
          const secondApplication = (
            await second.read(target.selection)
          ).view.roleRegistrations?.find(
            (entry) => entry.projectId === target.projectId && entry.role === "development",
          );
          expect(secondApplication).toMatchObject({
            employeeId: second.identity.employeeId,
            status: "pending",
          });
          expect(secondApplication!.id).not.toBe(pending[0]!.id);
          await admin.command(
            {
              type: "decideProjectRole",
              projectId: target.projectId,
              registrationId: secondApplication!.id,
              decision: "approved",
            },
            target.selection,
          );
          const registrations = (await admin.read(target.selection)).view.roleRegistrations;
          expect(registrations?.find((entry) => entry.id === secondApplication!.id)?.status).toBe(
            "approved",
          );
          expect(registrations?.find((entry) => entry.id === pending[0]!.id)?.status).toBe(
            "pending",
          );
          const approval = {
            type: "decideProjectRole" as const,
            projectId: target.projectId,
            registrationId: pending[0]!.id,
            decision: "approved" as const,
          };
          await expectBusinessRejection(client.command(approval, target.selection));
          await admin.command(approval, target.selection);
          const approved = (await client.read(target.selection)).view.roleRegistrations?.filter(
            (entry) => entry.projectId === target.projectId,
          );
          expect(approved?.map((entry) => entry.status)).toEqual(["approved", "pending"]);
          await expectBusinessRejection(
            admin.command({ ...approval, projectId: other.projectId }, other.selection),
          );
          await admin.command({ ...approval, decision: "revoked" }, target.selection);
          expect(
            (await client.read(target.selection)).view.roleRegistrations?.find(
              (entry) => entry.id === approval.registrationId,
            )?.status,
          ).toBe("revoked");
        } finally {
          await Promise.all([admin.close(), second.close()]);
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "counts proposals and formal documents in the same Release",
    async () => {
      await usingClient(async (client) => {
        const target = await createProject(client);
        const emptyView = (await client.read(target.selection)).view;
        const empty = summary(emptyView, target.projectId, target.releaseId);
        expect(empty).toMatchObject({
          proposalCount: 0,
          formalCount: 0,
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
          proposalCount: 1,
          formalCount: 0,
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
        const { remote: reviewed, review } = await waitForReview(client, proposal, "full");
        const todos = (view: AIReqWorkflowView) => view.todos!.filter((todo) => todo.irId === irId);
        expect(
          todos(reviewed.view)
            .map((todo) => todo.perspective)
            .sort(),
        ).toEqual(["business", "development", "testing"]);
        expect(todos(reviewed.view).every((todo) => todo.kind === "alignment")).toBe(true);
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
        expect(todos(confirmed.view)).toEqual([expect.objectContaining({ kind: "publish" })]);
        expect(summary(confirmed.view, target.projectId, target.releaseId)).toMatchObject({
          proposalCount: 1,
          formalCount: 0,
        });
        const project = confirmed.view.projects.find((item) => item.id === target.projectId)!;
        const originalUrl = requireConfig(project.repositoryUrl, "交付项目仓库");
        const replacementUrl = `https://example.invalid/${unique("st-replacement")}.git`;
        const changeRepository = (repositoryUrl: string, expectedRevision: number) =>
          client.call("projects.saveRepository", [
            {
              projectId: project.id,
              name: project.name,
              repositoryUrl,
              defaultBranch: project.defaultBranch,
              expectedRevision,
              operationId: unique("switch-repository-target"),
            },
          ]);
        const publication = await client.command(
          { type: "publishProposal", candidate: group.proposalDelivery!.candidate },
          proposal.selection,
        );
        expect(publication.receipt.status).toBe("completed");
        await changeRepository(replacementUrl, project.revision);
        const changed = await client.read(proposal.selection);
        const changedProject = changed.view.projects.find((item) => item.id === project.id)!;
        expect(changedProject).toMatchObject({
          repositoryUrl: replacementUrl,
          defaultBranch: project.defaultBranch,
        });
        const observed = await waitUntil(
          "the server observes the old MR after the URL-only repository change",
          () => client.read(proposal.selection),
          (value) => getProposal(value, proposal).requirementsPr?.status === "merged",
          config.timeoutMs,
        );
        const blocked = observed.view.drafts.find((item) => item.id === irId);
        expect(blocked?.proposalDelivery?.mergeCheck).toMatchObject({
          status: "incomplete",
          message: expect.stringMatching(/仍绑定原目标/),
        });
        expect(blocked?.merge).toBeUndefined();
        expect(observed.view.groups.some((item) => item.id === irId)).toBe(false);
        expect(summary(observed.view, target.projectId, target.releaseId)).toMatchObject({
          proposalCount: 1,
          formalCount: 0,
        });

        await changeRepository(originalUrl, changedProject.revision);
        const { view: archived } = await waitUntil(
          "verified document merge archives the original IR",
          () => client.read(proposal.selection),
          (value) => value.view.groups.some((item) => item.id === irId),
          config.timeoutMs,
        );
        expect(summary(archived, target.projectId, target.releaseId)).toMatchObject({
          proposalCount: 0,
          formalCount: 1,
        });
        expect(archived.drafts.some((item) => item.id === irId)).toBe(false);
        const formal = archived.groups.find((item) => item.id === irId)!;
        expect(formal).toMatchObject({
          originalText: text,
          releaseId: target.releaseId,
          srIds: group.srIds,
          requirementsPr: { status: "merged" },
          review: { id: review.id },
        });
        expect(formal.merge?.files).toEqual(group.files);
        expect(formal.merge?.commit).toMatch(/\S/);
        expect(archived.materials.filter((item) => item.irId === irId)).toEqual(
          expect.arrayContaining(group.files.map((file) => expect.objectContaining(file))),
        );
        expect(todos(archived)).toEqual([]);

        const restoredProject = archived.projects.find((item) => item.id === project.id)!;
        await changeRepository(replacementUrl, restoredProject.revision);
        const replacement = (await client.read(proposal.selection)).view.projects.find(
          (item) => item.id === project.id,
        )!;
        const sync = { type: "syncFormalDocuments" as const, projectId: project.id, irId };
        try {
          await expect(client.command(sync, proposal.selection)).rejects.toThrow(
            /暂无已登记的文档快照/,
          );
        } finally {
          await changeRepository(originalUrl, replacement.revision);
        }
        expect((await client.command(sync, proposal.selection)).receipt.status).toBe("completed");
        const synced = (await client.read(proposal.selection)).view;
        expect(synced.groups.find((item) => item.id === irId)?.materialHistory).toEqual(
          formal.materialHistory,
        );
        expect(synced.materials.filter((item) => item.irId === irId)).toEqual(
          archived.materials.filter((item) => item.irId === irId),
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
          proposalCount: 0,
          formalCount: 0,
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
          proposalCount: 1,
        });
        expect(summary(view, target.projectId, secondRelease.id)).toMatchObject({
          title: secondRelease.title,
          createdAt: secondRelease.createdAt,
          proposalCount: 2,
        });
        const otherView = (await client.read(other.selection)).view;
        expect(summary(otherView, target.projectId, target.releaseId)).toEqual(
          summary(view, target.projectId, target.releaseId),
        );
        expect(summary(otherView, target.projectId, secondRelease.id)).toEqual(
          summary(view, target.projectId, secondRelease.id),
        );
        expect(otherView.drafts.some((item) => item.projectId === target.projectId)).toBe(false);
      });
    },
    config.timeoutMs,
  );

  it(
    "projects assignment changes to the correct requirement, Release and responsibility without granting exclusive access",
    async () => {
      await usingClient(async (client) => {
        const target = await createProposal(client, unique("验证待办归属与分配"));
        const otherEmployee = requireConfig(
          config.otherEmployeeId,
          "otherEmployeeId：待办跨身份观察需要第二个合法工号",
        );
        expect(otherEmployee).not.toBe(client.identity.employeeId);
        const current = (await client.read(target.selection)).view;
        const group = current.drafts.find(
          (item) => item.id === target.irId && item.projectId === target.projectId,
        );
        expect(group).toBeDefined();
        const initialTodos = current.todos?.filter(
          (item) => item.projectId === target.projectId && item.irId === target.irId,
        );
        expect(initialTodos, "提案应提供当前可执行的业务讨论待办").toHaveLength(1);
        expect(initialTodos![0]).toMatchObject({
          releaseId: target.releaseId,
          irId: target.irId,
          requirementTitle: group!.title,
          kind: "business-discussion",
          assignmentPerspective: "business",
          selection: { projectId: target.projectId, irId: target.irId },
        });
        const assignment = await client.command(
          {
            type: "assignContacts",
            projectId: target.projectId,
            irId: target.irId,
            contacts: {
              ...group!.contacts,
              business: otherEmployee,
            },
          },
          target.selection,
        );
        expect(assignment.receipt.status).toBe("completed");
        const assignedView = (await client.read(target.selection)).view;
        const assigned = assignedView.todos!.filter(
          (item) => item.projectId === target.projectId && item.irId === target.irId,
        );
        expect(assigned).toHaveLength(1);
        expect(assigned[0]).toMatchObject({
          id: initialTodos![0]!.id,
          projectId: target.projectId,
          releaseId: target.releaseId,
          irId: target.irId,
          kind: "business-discussion",
          assignmentPerspective: "business",
          employeeId: otherEmployee,
        });
        const other = await connectST(otherEmployee);
        try {
          const observed = (await other.read(target.selection)).view;
          expect(observed.todos!.find((item) => item.id === assigned[0]!.id)).toEqual(assigned[0]);
          const sharedGroup = observed.drafts.find(
            (item) => item.id === target.irId && item.projectId === target.projectId,
          );
          expect(sharedGroup?.contacts?.business).toBe(otherEmployee);
          expect(sharedGroup).not.toHaveProperty("contactHistory");
        } finally {
          await other.close();
        }
        // Contacts are attribution, not exclusive permission. The submitting employee may reclaim.
        const latest = (await client.read(target.selection)).view;
        const latestGroup = latest.drafts.find((item) => item.id === target.irId)!;
        await client.command(
          {
            type: "assignContacts",
            projectId: target.projectId,
            irId: target.irId,
            contacts: {
              ...latestGroup.contacts,
              business: client.identity.employeeId,
            },
          },
          target.selection,
        );
        const reclaimed = (await client.read(target.selection)).view;
        expect(reclaimed.todos!.find((item) => item.id === assigned[0]!.id)?.employeeId).toBe(
          client.identity.employeeId,
        );
        expect(
          reclaimed.operations.some(
            (operation) => operation.operationId === assignment.receipt.operationId,
          ),
        ).toBe(true);
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

const localGitSyncFixtures = {
  gitSyncChanged: {
    projectId: "demo-aurora",
    releaseId: "release-2026-12",
    irId: "ir-notifications",
    path: "docs/requirements/ir-notifications/requirements.md",
    commitMessage: "补充通知恢复、审计查询及附件验收说明",
    committer: "m00000001",
    newText: "刷新通知失败时，保留上一次成功结果与未读状态。",
  },
  gitSyncMissing: {
    projectId: "demo-aurora",
    releaseId: "release-2026-12",
    irId: "ir-audit-archive",
    path: "openspec/changes/sr-audit-retention/test-plan.md",
  },
  gitSyncMoved: {
    projectId: "demo-aurora",
    releaseId: "release-2026-11",
    irId: "ir-attachment-management",
    path: "openspec/changes/sr-attachment-upload/test-plan.md",
    movedPath: "openspec/changes/sr-attachment-upload/verification/test-plan.md",
  },
} satisfies Record<string, STFixture>;

const localSecondGitSyncChanged = {
  ...localGitSyncFixtures.gitSyncChanged,
  releaseId: "release-2026-11",
  irId: "ir-workspace-shortcuts",
  path: "docs/requirements/ir-workspace-shortcuts/requirements.md",
  newText: "快捷入口重排失败时，保留上一次成功保存的顺序。",
} satisfies STFixture;
const useLocalGitSyncFixtures =
  !process.env.ST_FIXTURES_FILE &&
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(config.baseUrl).hostname);

function gitSyncFixture(
  purpose: keyof typeof localGitSyncFixtures,
  localFallback: STFixture = localGitSyncFixtures[purpose],
) {
  const fixture = requireConfig<STFixture>(
    config.fixtures[purpose]?.[0] ?? (useLocalGitSyncFixtures ? localFallback : undefined),
    "ST_FIXTURES_FILE 中的 " + purpose,
  );
  const field = (key: string) => {
    const value = fixture[key];
    return requireConfig(
      typeof value === "string" && value.trim() ? value : undefined,
      purpose + "." + key,
    );
  };
  return {
    selection: { projectId: field("projectId"), irId: field("irId") },
    releaseId: field("releaseId"),
    path: field("path"),
    field,
  };
}

async function gitSyncArchive(client: STClient, target: ReturnType<typeof gitSyncFixture>) {
  const { projectId, irId } = target.selection;
  const { view } = await client.read(target.selection);
  const group = requireConfig(
    view.groups.find(
      (item) =>
        item.projectId === projectId && item.id === irId && item.releaseId === target.releaseId,
    ),
    "正式文档 " + projectId + "/" + target.releaseId + "/" + irId,
  );
  const materials = view.materials.filter(
    (file) => file.projectId === projectId && file.irId === irId,
  );
  const file = requireConfig(
    materials.find((item) => item.path === target.path),
    target.path,
  );
  return { group, materials, file };
}

describe("ST Git document synchronization", () => {
  it(
    "confirms changed content with Git attribution and preserves the previous version",
    async () => {
      await usingClient(async (admin) => {
        let target = gitSyncFixture("gitSyncChanged");
        let before = await gitSyncArchive(admin, target);
        // 第一轮完成后通知中心已同步，第二轮读取另一份归档，仍然验证一次实际写入。
        if (useLocalGitSyncFixtures && before.file.content?.includes(target.field("newText"))) {
          target = gitSyncFixture("gitSyncChanged", localSecondGitSyncChanged);
          before = await gitSyncArchive(admin, target);
        }
        const { selection, path, field } = target;
        const newText = field("newText");
        const message = field("commitMessage");
        const employee = field("committer");
        expect(before.file.content, "公开投影必须包含同步前的正文").toEqual(expect.any(String));
        if (before.file.content?.includes(newText))
          throw new Error("ST 前置阻塞：正式文档已包含 newText，请为本轮提供尚未同步的 Git 提交");

        const action = { type: "syncFormalDocuments" as const, ...selection };
        expect((await admin.command(action, selection)).receipt.status).toBe("completed");
        const after = await gitSyncArchive(admin, target);
        expect(after.group.files.map((file) => file.path).sort()).toEqual(
          before.group.files.map((file) => file.path).sort(),
        );
        expect(after.file.content).toContain(newText);
        expect(after.file.sha256).not.toBe(before.file.sha256);
        expect(after.group.files).toContainEqual(
          expect.objectContaining({ path, sha256: after.file.sha256 }),
        );
        expect(after.materials.filter((file) => file.path !== path)).toEqual(
          before.materials.filter((file) => file.path !== path),
        );

        const history = after.group.materialHistory ?? [];
        const confirmed = history.at(-1);
        expect(history.slice(0, -1)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ materials: expect.arrayContaining([before.file]) }),
          ]),
        );
        expect(confirmed?.materials).toContainEqual(after.file);
        expect(Number.isFinite(Date.parse(confirmed?.changedAt ?? ""))).toBe(true);
        expect(confirmed?.event).toEqual({
          type: "git-sync",
          commit: expect.stringMatching(/\S/),
          employeeId: admin.identity.employeeId,
          files: [
            {
              path,
              change: {
                hash: expect.stringMatching(/\S/),
                message,
                employee,
                committedAt: expect.any(String),
              },
            },
          ],
        });
        const event = confirmed?.event;
        const committedAt =
          event?.type === "git-sync" ? event.files[0]?.change.committedAt : undefined;
        expect(Number.isFinite(Date.parse(committedAt ?? ""))).toBe(true);

        expect((await admin.command(action, selection)).receipt.status).toBe("completed");
        const repeated = await gitSyncArchive(admin, target);
        expect(repeated.group.files).toEqual(after.group.files);
        expect(repeated.group.materialHistory).toEqual(history);
        expect(repeated.materials).toEqual(after.materials);
      }, "y00000000");
    },
    config.timeoutMs,
  );

  it.each(["gitSyncMissing", "gitSyncMoved"] as const)(
    "rejects the whole batch for %s",
    async (purpose) => {
      const target = gitSyncFixture(purpose);
      const { selection, path, field } = target;
      const movedPath = purpose === "gitSyncMoved" ? field("movedPath") : undefined;
      await usingClient(async (admin) => {
        const before = await gitSyncArchive(admin, target);
        const expectedCount = before.group.files.length;
        const actualCount = movedPath ? expectedCount : expectedCount - 1;
        const message = await admin
          .command({ type: "syncFormalDocuments", ...selection }, selection)
          .then(
            (result) => {
              expect(result.receipt.status).toBe("failed");
              return result.receipt.error;
            },
            (error: unknown) => {
              if (!(error instanceof Error)) throw error;
              return error.message;
            },
          );
        expect(message).toContain("Git 文档目录与上版不一致");
        expect(message).toContain("预期 " + expectedCount + " 份，实际 " + actualCount + " 份");
        expect(message).toContain("缺少：" + path);
        if (movedPath) expect(message).toContain("新增或改名：" + movedPath);

        const after = await gitSyncArchive(admin, target);
        expect(after.group.files).toEqual(before.group.files);
        expect(after.group.materialHistory).toEqual(before.group.materialHistory);
        expect(after.materials).toEqual(before.materials);
      }, "y00000000");
    },
    config.timeoutMs,
  );
});
