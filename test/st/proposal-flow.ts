import { expect } from "vitest";
import type {
  AIReqAction,
  AIReqRemoteWorkflow,
  AIReqRequirementGroup,
  AIReqReview,
  AIReqSelection,
  AIReqWorkflowResult,
} from "@zcode/services/aireq";
import { createProposal } from "./business.js";
import { config } from "./config.js";
import { connectST, waitUntil, type STClient } from "./client.js";
import { openNative } from "./native.js";

interface ProposalTarget {
  projectId: string;
  releaseId: string;
  irId: string;
  selection: AIReqSelection;
}

/** Read only public workflow objects. No generated text, timestamps or IDs are fabricated. */
export function getProposal(
  remote: AIReqRemoteWorkflow,
  target: ProposalTarget,
): AIReqRequirementGroup {
  const group = [...remote.view.drafts, ...remote.view.groups].find(
    (item) => item.projectId === target.projectId && item.id === target.irId,
  );
  expect(group, "the created IR should remain readable under its original project").toBeDefined();
  expect(group!.releaseId).toBe(target.releaseId);
  return group!;
}

export async function expectBusinessRejection(
  operation: Promise<AIReqWorkflowResult>,
): Promise<void> {
  let failure: unknown;
  let result: AIReqWorkflowResult | undefined;
  try {
    result = await operation;
  } catch (error) {
    failure = error;
  }
  // A rejected operation may be a rejected RPC or an explicit failed business receipt.
  // Neither a running nor a completed receipt proves refusal.
  if (failure !== undefined) {
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message.trim()).not.toBe("");
    return;
  }
  expect(result?.receipt.status, "an invalid business operation should not be admitted").toBe(
    "failed",
  );
  expect(result).not.toHaveProperty("error");
  expect(result?.receipt.error?.trim()).toBeTruthy();
}

export async function commandAndRead(c: STClient, action: AIReqAction, target: ProposalTarget) {
  const result = await c.command(action, target.selection);
  expect(result.receipt.status, result.receipt.error).not.toBe("failed");
  return c.read(target.selection);
}

export async function discuss(c: STClient, target: ProposalTarget, text: string) {
  const remote = await c.read(target.selection);
  expect(
    remote.session,
    "the current discussion should expose its existing native session",
  ).toBeDefined();
  const session = await openNative(c, remote);
  try {
    const ack = await session.send("sendText", { text });
    expect(
      ["accepted", "duplicate"],
      "the user's explicit discussion input should be admitted",
    ).toContain(ack.status);
    expect((await session.waitIdle()).control.phase).toBe("completedSuccess");
  } finally {
    await session.close();
  }
}

export async function completeBusinessMaterial(c: STClient, target: ProposalTarget) {
  await discuss(
    c,
    target,
    "请完善并生成本 IR 的业务需求文档：电脑浏览器中，用户选择一个项目和版本，导出该范围的全部需求原文为 UTF-8 CSV。" +
      "仅包含原始需求一列；中文、逗号、双引号和换行必须往返无损；空结果禁用导出；读取失败显示错误且允许重试。" +
      "不修改源数据、不导出生成材料、不执行 Git、不增加移动端范围。验收覆盖范围隔离、特殊字符、空结果及失败重试。",
  );
  return waitUntil(
    "business discussion should produce readable IR material without premature SR splitting",
    () => c.read(target.selection),
    (remote) => {
      const group = getProposal(remote, target);
      return (
        group.files.some((file) => file.path === group.documentPath) &&
        group.requirementsCheck?.issues.length === 0 &&
        remote.view.materials.some(
          (file) =>
            file.projectId === target.projectId &&
            file.irId === target.irId &&
            file.path === group.documentPath &&
            file.valid &&
            !file.error &&
            Boolean(file.content?.trim()),
        )
      );
    },
    config.timeoutMs,
  );
}

export async function submitReview(c: STClient, target: ProposalTarget, kind: "original" | "full") {
  const group = getProposal(await c.read(target.selection), target);
  expect(group.snapshot?.digest).toBeTruthy();
  return commandAndRead(
    c,
    {
      type: "submitProposalReview",
      projectId: target.projectId,
      irId: target.irId,
      kind,
      snapshotDigest: group.snapshot!.digest,
    },
    target,
  );
}

export async function waitForReview(
  c: STClient,
  target: ProposalTarget,
  kind: "original" | "full",
) {
  const expectedAgents = kind === "original" ? ["a"] : ["a", "b", "c", "summary"];
  const current = (remote: AIReqRemoteWorkflow) => {
    const group = getProposal(remote, target);
    return kind === "original" ? group.originalReview : group.review;
  };
  const remote = await waitUntil(
    `automatic ${kind} review should produce current reports`,
    () => c.read(target.selection),
    (remote) => {
      const review = current(remote);
      if (!review || review.invalidatedReason) return false;
      const failed = review.agents?.find((agent) => agent.status === "failed");
      expect(failed, failed?.report || review.report).toBeUndefined();
      const summary = review.agents?.find((agent) => agent.id === "summary");
      if (summary && summary.status !== "pending") {
        for (const id of ["a", "b", "c"]) {
          const agent = review.agents!.find((agent) => agent.id === id);
          expect(agent?.status, `scheme review ${id} must finish before synthesis`).toBe(
            "completed",
          );
          expect(agent?.report.trim()).toBeTruthy();
        }
      }
      return Boolean(
        review.report.trim() &&
        expectedAgents.every((id) =>
          review.agents?.some(
            (agent) => agent.id === id && agent.status === "completed" && agent.report.trim(),
          ),
        ),
      );
    },
  );
  const review = current(remote)!;
  assertReadableReview(review, expectedAgents);
  return { remote, review };
}

function assertReadableReview(review: AIReqReview, expectedAgents: readonly string[]) {
  expect(review.id.trim()).not.toBe("");
  expect(review.snapshotDigest.trim()).not.toBe("");
  expect(review.invalidatedReason).toBeFalsy();
  expect(review.agents!.map((agent) => agent.id).sort()).toEqual([...expectedAgents].sort());
  for (const agent of review.agents!) {
    expect(agent.status, `review ${agent.id} should have completed successfully`).toBe("completed");
    expect(agent.report.trim(), `review ${agent.id} should expose its actual report`).not.toBe("");
  }
  expect(review.report.trim()).not.toBe("");
  expect(new Set(review.agents!.map((agent) => agent.session.sessionId)).size).toBe(
    expectedAgents.length,
  );
}

export async function approveOriginalReview(c: STClient, target: ProposalTarget) {
  const { review } = await waitForReview(c, target, "original");
  await commandAndRead(
    c,
    { type: "acceptProposal", reviewId: review.id, snapshotDigest: review.snapshotDigest },
    target,
  );
  const approved = await waitUntil(
    "human original-review approval should enter the solution stage",
    () => c.read(target.selection),
    (remote) => getProposal(remote, target).proposalStage === "solution",
    config.timeoutMs,
  );
  const group = getProposal(approved, target);
  expect(group.originalReview?.humanDecision).toMatchObject({
    reviewId: review.id,
    employeeId: c.identity.employeeId,
  });
  expect(group.srIds, "entering the solution stage alone should not split SRs").toEqual([]);
  const existing =
    approved.view.roleRegistrations?.filter(
      (entry) => entry.projectId === target.projectId && entry.status === "approved",
    ) ?? [];
  const roles = (["development", "testing"] as const).filter(
    (role) => !existing.some((entry) => entry.role === role),
  );
  if (!roles.length) return approved;
  const { view } = await commandAndRead(
    c,
    {
      type: "requestProjectRoles",
      projectId: target.projectId,
      roles,
    },
    target,
  );
  const registrations =
    view.roleRegistrations?.filter(
      (entry) => entry.projectId === target.projectId && entry.status === "pending",
    ) ?? [];
  const admin = await connectST("y00000000");
  try {
    for (const registration of registrations)
      await commandAndRead(
        admin,
        {
          type: "decideProjectRole",
          projectId: target.projectId,
          registrationId: registration.id,
          decision: "approved",
        },
        target,
      );
  } finally {
    await admin.close();
  }
  return c.read(target.selection);
}

export async function completeSolutionMaterial(c: STClient, target: ProposalTarget) {
  await discuss(
    c,
    target,
    "请根据已确认的只读 IR 业务文档，将导出功能与异常恢复拆成至少两个稳定 SR，分别生成提案、规格、设计、开发任务、测试方案；" +
      "生成覆盖全部 SR 的 sr-dependencies.json，每个 SR 给出正有限工作日预估和假设，依赖须给出理由且无环。" +
      "测试方案逐项追溯业务验收标准，不请求确认、不创建文档 PR。",
  );
  const remote = await waitUntil(
    "solution discussion should produce the complete current document package",
    () => c.read(target.selection),
    (value) => {
      const group = getProposal(value, target);
      return Boolean(
        group.srIds.length &&
        group.solutionCheck?.issues.length === 0 &&
        proposalMaterialPaths(group).every((path) =>
          value.view.materials.some(
            (file) =>
              file.projectId === target.projectId &&
              file.irId === target.irId &&
              file.path === path &&
              file.valid &&
              !file.error &&
              Boolean(file.content?.trim()),
          ),
        ),
      );
    },
    config.timeoutMs,
  );
  const group = getProposal(remote, target);
  expect(group.files.map((file) => file.path).sort()).toEqual(proposalMaterialPaths(group).sort());
  return remote;
}

function proposalMaterialPaths(group: AIReqRequirementGroup): string[] {
  return [
    group.documentPath,
    `docs/requirements/${group.id}/sr-dependencies.json`,
    ...group.srIds.flatMap((id) =>
      ["proposal.md", "design.md", "tasks.md", "test-plan.md", `specs/${id}/spec.md`].map(
        (name) => `openspec/changes/${id}/${name}`,
      ),
    ),
  ];
}

export function alignmentAction(
  review: AIReqReview,
  perspective: "business" | "development" | "testing",
): Extract<AIReqAction, { type: "confirmAlignment" }> {
  return {
    type: "confirmAlignment",
    perspective,
    version: review.snapshotDigest,
    reviewId: review.id,
    snapshotDigest: review.snapshotDigest,
  };
}

export async function confirmAllPerspectives(
  c: STClient,
  target: ProposalTarget,
  review: AIReqReview,
) {
  for (const perspective of ["business", "development", "testing"] as const)
    await commandAndRead(c, alignmentAction(review, perspective), target);
  const remote = await c.read(target.selection);
  const group = getProposal(remote, target);
  expect(group.proposalDelivery?.candidate.trim()).toBeTruthy();
  return { remote, group };
}

/** One case's own public prerequisites, reusable by network suites without hidden state injection. */
export async function prepareApprovedProposal(c: STClient) {
  const target = await createProposal(
    c,
    "在当前项目及版本导出需求原文，特殊字符往返无损，空结果和读取失败有明确反馈。",
  );
  await completeBusinessMaterial(c, target);
  await submitReview(c, target, "original");
  await approveOriginalReview(c, target);
  await completeSolutionMaterial(c, target);
  await submitReview(c, target, "full");
  const { review } = await waitForReview(c, target, "full");
  return { ...target, ...(await confirmAllPerspectives(c, target, review)) };
}
