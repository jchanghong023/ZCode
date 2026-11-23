import { expect } from "vitest";
import type {
  AIReqDiscussionAgent,
  AIReqDocumentReview,
  AIReqMaterialView,
  AIReqRemoteWorkflow,
  AIReqRequirementGroup,
  AIReqWorkflowResult,
} from "@zcode/services/aireq";
import { unique, waitUntil, type STClient } from "./client.js";
import { requireAccepted, openNative } from "./native.js";

interface ProposalTarget {
  projectId: string;
  releaseId: string;
  irId: string;
}

export function proposalSelection({ projectId, irId }: ProposalTarget) {
  return { projectId, irId };
}

/** Read only public workflow objects. */
export function getProposal(
  remote: AIReqRemoteWorkflow,
  target: ProposalTarget,
): AIReqRequirementGroup {
  const group = remote.view.requirements.find(
    (item) => item.projectId === target.projectId && item.id === target.irId,
  );
  expect(group, "the created IR should remain readable under its original project").toBeDefined();
  expect(group!.releaseId).toBe(target.releaseId);
  return group!;
}

export function getMaterials(
  remote: AIReqRemoteWorkflow,
  target: ProposalTarget,
): AIReqMaterialView[] {
  return remote.view.materials
    .filter(({ projectId, irId }) => projectId === target.projectId && irId === target.irId)
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function expectBusinessRejection(operation: Promise<AIReqWorkflowResult>) {
  const outcome = await operation.then(
    (result) => ({ ok: true as const, result }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!outcome.ok) {
    expect(outcome.error).toBeInstanceOf(Error);
    expect((outcome.error as Error).message).toMatch(/\S/);
    return;
  }
  expect(outcome.result?.receipt?.status).toBe("failed");
  expect(outcome.result.receipt.error).toMatch(/\S/);
}

export async function discuss(
  c: STClient,
  target: ProposalTarget,
  text: string,
  discussionPhase: AIReqDiscussionAgent = "requirements",
) {
  const remote = await c.read({ ...proposalSelection(target), discussionPhase });
  expect(remote.session?.phase).toBe(discussionPhase);
  const session = await openNative(c, remote);
  try {
    requireAccepted(await session.send("sendText", { text }));
    expect((await session.waitIdle()).control.phase).toBe("completedSuccess");
  } finally {
    await session.close();
  }
}

export async function completeBusinessMaterial(c: STClient, target: ProposalTarget) {
  await discuss(
    c,
    target,
    "请生成需求文档：按项目和 Release 导出原始需求为 UTF-8 CSV，覆盖特殊字符、空结果与失败重试的验收。",
  );
  return waitUntil(
    "the requirements discussion saves a readable requirements document",
    () => c.read(proposalSelection(target)),
    (remote) =>
      getMaterials(remote, target).some(
        (file) =>
          file.path === getProposal(remote, target).documentPath && Boolean(file.content?.trim()),
      ),
  );
}

export async function completeSolutionMaterial(c: STClient, target: ProposalTarget) {
  await discuss(
    c,
    target,
    "请生成当前需求的方案材料：各 SR 的提案、技术方案、开发任务、测试方案、规格和完整的依赖清单。",
    "solution",
  );
  return waitUntil(
    "the solution discussion saves its complete file set",
    () => c.read(proposalSelection(target)),
    (remote) => {
      const group = getProposal(remote, target);
      const files = getMaterials(remote, target);
      return (
        group.srIds.length > 0 &&
        group.srIds.every((id) =>
          ["proposal.md", "design.md", "tasks.md", "test-plan.md", `specs/${id}/spec.md`].every(
            (name) =>
              files.some(
                (file) =>
                  file.path === `openspec/changes/${id}/${name}` && Boolean(file.content?.trim()),
              ),
          ),
        ) &&
        files.some(
          (file) => file.path.endsWith("/sr-dependencies.json") && Boolean(file.content?.trim()),
        )
      );
    },
  );
}

export async function reviewDocuments(
  c: STClient,
  target: ProposalTarget,
  agent: AIReqDiscussionAgent,
  options: { expectedRevision?: number; operationId?: string } = {},
) {
  const selection = proposalSelection(target);
  const existing = getProposal(await c.read(selection), target).documentReviews;
  const operationId = options.operationId ?? unique("review-documents");
  const action = { type: "reviewDocuments", ...selection, agent, ...options, operationId } as const;
  const result = await c.command(action, selection);
  expect(result.receipt.status, result.receipt.error).not.toBe("failed");
  const getReview = (remote: AIReqRemoteWorkflow) =>
    getProposal(remote, target).documentReviews.find(
      (review) => !existing.some(({ id }) => id === review.id) && review.agent === agent,
    );
  const remote = await waitUntil(
    `the independent ${agent} review finishes`,
    () => c.read(selection),
    (value) => {
      const review = getReview(value);
      return !!review && review.status !== "running";
    },
  );
  const review = getReview(remote)!;
  expect(review).toMatchObject({
    agent,
    requestedBy: c.identity.employeeId,
    status: "completed",
    stale: false,
  });
  expect(review.report).toMatch(/\S/);
  expect(Number.isFinite(Date.parse(review.requestedAt))).toBe(true);
  return { remote, review, result, action };
}

export async function reviewInvocation(
  c: STClient,
  target: ProposalTarget,
  review: AIReqDocumentReview,
) {
  const remote = await c.read({ ...proposalSelection(target), discussionPhase: review.agent });
  const native = await openNative(c, remote);
  try {
    const snapshot = await native.waitIdle();
    const rows = snapshot.rows.window;
    const turn = rows.find((row) => row.kind === "turnHeader" && row.sourceCommandId === review.id);
    expect(turn).toBeDefined();
    const subagent = rows.find(
      (row) => row.kind === "subagent" && row.status === "success" && row.turnId === turn?.turnId,
    );
    expect(subagent).toMatchObject({ summaryText: expect.stringContaining(review.report!) });
    if (!subagent || subagent.kind !== "subagent") throw new Error("评审缺少子代理记录");
    const tool = rows.find(
      (row) => row.kind === "toolCall" && row.toolCallId === subagent.parentToolCallId,
    );
    expect(tool).toBeDefined();
    return tool;
  } finally {
    await native.close();
  }
}
