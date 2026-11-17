import { describe, expect, it } from "vitest";
import type { AIReqWorkflowView } from "../../packages/services/src/aireq/index.js";
import { connectST, unique, type STClient } from "./client.js";
import { config, requireConfig } from "./config.js";
import { createProject, createProposal } from "./business.js";

// Read the server's public projection; never call services/aireq derived functions here.
// Rules: section-navigation-and-ideas.md and services/aireq/CONTRACT.md.
async function usingClient(run: (client: STClient) => Promise<void>) {
  const client = await connectST();
  try {
    await run(client);
  } finally {
    await client.close();
  }
}
function summary(view: AIReqWorkflowView, projectId: string, releaseId: string) {
  const project = view.projectProgress?.find((item) => item.projectId === projectId);
  expect(project, "公开 readWorkflow 必须提供当前项目的进度投影").toBeDefined();
  const release = project!.releases.find((item) => item.releaseId === releaseId);
  expect(release, "空 Release 也必须有同源统计").toBeDefined();
  return { project: project!, release: release! };
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
    statuses: view.srs
      .filter((item) => item.projectId === projectId)
      .map((sr) => ({ id: sr.id, statusChange: sr.statusChange })),
    drafts: view.drafts.filter((item) => item.projectId === projectId),
    formal: view.groups.filter((item) => item.projectId === projectId),
    sessions: view.sessions.filter((item) => item.projectId === projectId),
  };
}

describe("ST same-owner workflow projections", () => {
  it(
    "keeps an empty Release visible with null progress and does not count proposals as formal SR delivery",
    async () => {
      await usingClient(async (client) => {
        const target = await createProject(client);
        const emptyView = (await client.read(target.selection)).view;
        const empty = summary(emptyView, target.projectId, target.releaseId);
        expect(empty.release).toMatchObject({
          proposalCount: 0,
          formalCount: 0,
          srCount: 0,
          unanalyzedCount: 0,
          percent: null,
          requirements: [],
        });
        expect(empty.project.total).toMatchObject({
          proposalCount: 0,
          formalCount: 0,
          srCount: 0,
          percent: null,
        });
        const text = unique("未评审提案不计入正式进度");
        await client.command(
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
        expect(currentSummary.release).toMatchObject({
          proposalCount: 1,
          formalCount: 0,
          srCount: 0,
          unanalyzedCount: 0,
          percent: null,
          requirements: [],
        });
        expect(currentSummary.project.total).toMatchObject({
          proposalCount: 1,
          formalCount: 0,
          srCount: 0,
          percent: null,
        });
        expect(current.srs.filter((sr) => sr.projectId === target.projectId)).toEqual([]);
      });
    },
    config.timeoutMs,
  );

  it(
    "separates each Release's proposals within the same project snapshot",
    async () => {
      await usingClient(async (client) => {
        const target = await createProject(client);
        const second = await client.command(
          { type: "createRelease", projectId: target.projectId, title: unique("第二版本") },
          target.selection,
        );
        expect(second.status).toBe("completed");
        const directory = (await client.read(target.selection)).view;
        const releaseIds = directory.releases.filter(
          (item) => item.projectId === target.projectId && item.id !== target.releaseId,
        );
        expect(releaseIds).toHaveLength(1);
        const secondRelease = releaseIds[0]!;
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
        expect(summary(view, target.projectId, target.releaseId).release).toMatchObject({
          proposalCount: 1,
          srCount: 0,
          percent: null,
        });
        expect(summary(view, target.projectId, secondRelease.id).release).toMatchObject({
          title: secondRelease.title,
          createdAt: secondRelease.createdAt,
          proposalCount: 2,
          srCount: 0,
          percent: null,
        });
        expect(summary(view, target.projectId, target.releaseId).project.total.proposalCount).toBe(
          3,
        );
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
        expect(assignment.status).toBe("completed");
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
            (operation) => operation.operationId === assignment.operationId,
          ),
        ).toBe(true);
      });
    },
    config.timeoutMs,
  );

  it(
    "does not create operations, status changes or new sessions through repeated reads and bootstrap",
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
