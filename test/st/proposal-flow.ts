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
import { waitUntil, type STClient } from "./client.js";
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
  expect(result?.status, "an invalid business operation should not be admitted").toBe("failed");
  expect(result?.error?.trim()).toBeTruthy();
}

export async function commandAndRead(c: STClient, action: AIReqAction, target: ProposalTarget) {
  const receipt = await c.command(action, target.selection);
  expect(receipt.status, receipt.error).not.toBe("failed");
  return c.read(target.selection);
}

async function discuss(c: STClient, target: ProposalTarget, text: string) {
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
    await session.waitIdle();
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

function reviewFinished(review: AIReqReview | undefined): boolean {
  return Boolean(
    review?.agents?.length &&
    review.agents.every((agent) => agent.status === "completed" || agent.status === "failed"),
  );
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
  expect(review.findings?.filter((item) => item.level === "blocking") ?? []).toEqual([]);
}

export async function approveOriginalReview(c: STClient, target: ProposalTarget) {
  await commandAndRead(c, { type: "runRequirementsReview" }, target);
  const reviewed = await waitUntil(
    "the current original review should finish",
    () => c.read(target.selection),
    (remote) => reviewFinished(getProposal(remote, target).originalReview),
    config.timeoutMs,
  );
  const review = getProposal(reviewed, target).originalReview!;
  assertReadableReview(review, ["a"]);
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
  return approved;
}

export async function completeSolutionMaterial(c: STClient, target: ProposalTarget) {
  await discuss(
    c,
    target,
    "请根据已经人工通过的业务需求，完成本轮方案材料。拆分稳定 SR，分别生成规格、设计、开发任务、测试方案；" +
      "补齐 IR 整体验收标准，以及覆盖全部 SR 的 sr-dependencies.json。每个 SR 给出正有限工作日预估和假设，" +
      "依赖须给出理由且无环。测试方案逐项追溯业务验收标准，不请求批准、不创建文档 PR。",
  );
  const remote = await waitUntil(
    "solution discussion should produce the complete current document package",
    () => c.read(target.selection),
    (value) => {
      const group = getProposal(value, target);
      return Boolean(
        group.srIds.length &&
        group.proposalSolution?.valid &&
        group.srDependencyFile?.valid &&
        group.srIds.every((srId) =>
          ["proposal.md", "design.md", "tasks.md", "test-plan.md"].every((name) =>
            value.view.materials.some(
              (file) =>
                file.projectId === target.projectId &&
                file.irId === target.irId &&
                file.path === `openspec/changes/${srId}/${name}` &&
                file.valid &&
                !file.error &&
                Boolean(file.content?.trim()),
            ),
          ),
        ),
      );
    },
    config.timeoutMs,
  );
  const group = getProposal(remote, target);
  const materialPaths = remote.view.materials
    .filter(
      (file) =>
        file.projectId === target.projectId &&
        file.irId === target.irId &&
        file.valid &&
        !file.error &&
        Boolean(file.content?.trim()),
    )
    .map((file) => file.path);
  expect(materialPaths).toContain(`docs/requirements/${target.irId}/acceptance.md`);
  expect(materialPaths).toContain(`docs/requirements/${target.irId}/sr-dependencies.json`);
  for (const srId of group.srIds) {
    expect(materialPaths.some((path) => path.startsWith(`openspec/changes/${srId}/specs/`))).toBe(
      true,
    );
  }
  return remote;
}

async function approveFullReview(c: STClient, target: ProposalTarget) {
  await commandAndRead(c, { type: "runFullReview" }, target);
  const reviewed = await waitUntil(
    "three independent reviews and their summary should finish",
    () => c.read(target.selection),
    (remote) => reviewFinished(getProposal(remote, target).review),
    config.timeoutMs,
  );
  const review = getProposal(reviewed, target).review!;
  assertReadableReview(review, ["a", "b", "c", "summary"]);
  const approved = await commandAndRead(
    c,
    { type: "approveFullReview", reviewId: review.id, snapshotDigest: review.snapshotDigest },
    target,
  );
  expect(getProposal(approved, target).review?.humanDecision).toMatchObject({
    reviewId: review.id,
    employeeId: c.identity.employeeId,
  });
  return { remote: approved, version: review.snapshotDigest };
}

/** One case's own public prerequisites, reusable by network suites without hidden state injection. */
export async function prepareApprovedProposal(c: STClient) {
  const target = await createProposal(
    c,
    "在当前项目及版本导出需求原文，特殊字符往返无损，空结果和读取失败有明确反馈。",
  );
  await completeBusinessMaterial(c, target);
  await approveOriginalReview(c, target);
  await completeSolutionMaterial(c, target);
  const approved = await approveFullReview(c, target);
  return { ...target, ...approved, group: getProposal(approved.remote, target) };
}
