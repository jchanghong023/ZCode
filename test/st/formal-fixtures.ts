import { expect } from "vitest";
import { serialSTStep } from "./execution.js";
import type { AIReqRemoteWorkflow, AIReqSystemRequirement } from "@zcode/services/aireq";
import type { STFixture } from "./config.js";
import { config, requireConfig } from "./config.js";
import { unique, waitUntil, type STClient } from "./client.js";
import { commandAndRead, getProposal, prepareApprovedProposal } from "./proposal-flow.js";

type FormalFixture = STFixture & { srId: string; releaseId: string };

function members(
  remote: AIReqRemoteWorkflow,
  ref: Pick<STFixture, "projectId" | "irId">,
): AIReqSystemRequirement[] {
  return remote.view.srs.filter((sr) => sr.projectId === ref.projectId && sr.irId === ref.irId);
}

/** Only the published business flow creates documents, decisions, registered branches and acceptance. */
export async function createFormalFixture(c: STClient, purpose: string): Promise<FormalFixture> {
  const { target, delivery } = await serialSTStep(async () => {
    const target = await prepareApprovedProposal(c);
    for (const perspective of ["business", "development", "testing"] as const)
      await commandAndRead(
        c,
        { type: "confirmAlignment", perspective, version: target.version },
        target,
      );
    const confirmed = await commandAndRead(
      c,
      { type: "confirmProposal", version: target.version },
      target,
    );
    const delivery = getProposal(confirmed, target).proposalDelivery!;
    expect(delivery?.candidate.trim()).toBeTruthy();
    const published = await commandAndRead(
      c,
      { type: "publishProposal", candidate: delivery.candidate },
      target,
    );
    expect(getProposal(published, target).proposalDelivery?.candidate).toBe(delivery.candidate);
    expect(getProposal(published, target).requirementsPr).toBeDefined();
    expect(getProposal(published, target).proposalDelivery).not.toHaveProperty("simulatedMr");
    return { target, delivery };
  });
  // 只等待读回实际合入事实；不固定等待时长，不调用场景、推进时钟或伪造 Git/PR 结果。
  let remote = await waitUntil(
    `${purpose}: the published candidate becomes a formal IR with registered SR branches`,
    () => c.read(target.selection),
    (value) => {
      const group = value.view.groups.find(
        (item) => item.projectId === target.projectId && item.id === target.irId,
      );
      return Boolean(
        group?.merge?.commit &&
        group.requirementsPr?.status === "merged" &&
        group.srIds.length &&
        group.srIds.every((id) =>
          members(value, target).some(
            (sr) =>
              sr.id === id &&
              sr.trackingBranch?.name &&
              sr.trackingBranch.baseCommit === group.merge!.commit,
          ),
        ),
      );
    },
    config.timeoutMs,
  );
  const group = remote.view.groups.find(
    (item) => item.projectId === target.projectId && item.id === target.irId,
  )!;
  expect(group.originalText).toBe(target.group.originalText);
  expect(group.proposalDelivery?.candidate).toBe(delivery.candidate);
  expect(group.merge?.files).toEqual(delivery.files);
  expect(group.proposalDelivery).not.toHaveProperty("simulatedMr");
  expect(group).not.toHaveProperty("branchCreationAttempts");
  expect(
    remote.view.drafts.some(
      (item) => item.projectId === target.projectId && item.id === target.irId,
    ),
  ).toBe(false);
  const all = members(remote, target);
  const failed = all.find((sr) => sr.trackingBranch?.status === "failed");
  if (purpose === "formalBranchFailure") {
    const sr = requireConfig(failed, "正式分支重试需要服务端公开返回实际失败的登记分支");
    return {
      projectId: target.projectId,
      irId: target.irId,
      releaseId: target.releaseId,
      srId: sr.id,
      expectedBaseCommit: group.merge!.commit,
    };
  }
  // 活跃阶段重读版本并串行重试；长时间等待不占用写入锁。
  await serialSTStep(async () => {
    const current = await c.read(target.selection);
    for (const sr of members(current, target).filter(
      (item) => item.trackingBranch?.status === "failed",
    ))
      await commandAndRead(c, { type: "retrySrBranch", srId: sr.id }, target);
  });
  remote = await waitUntil(
    `${purpose}: registered branches become usable after any explicit retry`,
    () => c.read(target.selection),
    (value) => members(value, target).every((sr) => sr.trackingBranch?.status === "ready"),
    config.timeoutMs,
  );
  const ref: FormalFixture = {
    projectId: target.projectId,
    irId: target.irId,
    releaseId: target.releaseId,
    srId: requireConfig(members(remote, target)[0], "正式需求必须包含 SR").id,
  };
  if (["formalPlanning", "formalCleanupBlocked"].includes(purpose)) return ref;
  remote = await waitUntil(
    `${purpose}: current code merge facts become readable for registered SR branches`,
    () => c.read(target.selection),
    (value) => {
      const required =
        purpose === "formalCleanup"
          ? members(value, ref)
          : members(value, ref).filter((sr) => sr.id === ref.srId);
      return required.length > 0 && required.every((sr) => Boolean(sr.codeMerge?.commit));
    },
    config.timeoutMs,
  );
  if (purpose === "formalRetest") {
    const failedVersion = await serialSTStep(async () => {
      const current = await c.read(target.selection);
      const sr = members(current, ref).find((item) => item.id === ref.srId)!;
      const failedVersion = sr.codeMerge!.commit;
      await c.call(
        "progress.recordTest",
        [
          ref.projectId,
          ref.irId,
          sr.id,
          {
            operationId: unique("failed-acceptance"),
            expectedRevision: current.view.revision,
            expectedCodeVersion: failedVersion,
            outcome: "failed",
            reason: "首次验收发现边界行为不符合验收标准，需要修复后复测。",
          },
        ],
        target.selection,
      );
      return failedVersion;
    });
    await waitUntil(
      "a new merged repair version makes the recorded issue ready for retest",
      () => c.read(target.selection),
      (value) => {
        const current = members(value, ref).find((item) => item.id === ref.srId);
        return Boolean(
          current?.codeMerge?.commit &&
          current.codeMerge.commit !== failedVersion &&
          current.developmentIssues?.some(
            (issue) =>
              issue.status === "awaiting-retest" &&
              issue.failedCodeVersion === failedVersion &&
              issue.fixCodeVersion === current.codeMerge!.commit,
          ),
        );
      },
      config.timeoutMs,
    );
  }
  if (purpose === "formalCleanup") {
    await serialSTStep(async () => {
      for (const member of members(remote, ref)) {
        const latest = await c.read(target.selection);
        const sr = members(latest, ref).find((item) => item.id === member.id)!;
        await c.call(
          "progress.recordTest",
          [
            ref.projectId,
            ref.irId,
            sr.id,
            {
              operationId: unique("passed-acceptance"),
              expectedRevision: latest.view.revision,
              expectedCodeVersion: sr.codeMerge!.commit,
              outcome: "passed",
              reason: "本版本各项验收标准已人工核对，通过验收。",
            },
          ],
          target.selection,
        );
      }
    });
  }
  return ref;
}
