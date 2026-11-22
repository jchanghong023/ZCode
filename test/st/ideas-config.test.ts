import { describe, expect, it } from "vitest";
import type {
  AIReqAction,
  AIReqAgentModelSettings,
  AIReqIdea,
  AIReqRemoteBootstrap,
} from "@zcode/services/aireq";
import { USER_INSTRUCTIONS_MAX_BYTES } from "../../packages/shared/src/userInstructions.js";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { config, requireConfig } from "./config.js";
import { createProject, createProposal } from "./business.js";
import {
  approveOriginalReview,
  commandAndRead,
  completeBusinessMaterial,
  completeSolutionMaterial,
  getProposal,
  submitReview,
  waitForReview,
} from "./proposal-flow.js";

// Assertions come from section-navigation-and-ideas.md, tools-settings.md,
// connection-identity.md and the public services/aireq contract, not backend samples.
async function usingClient(run: (client: STClient) => Promise<void>) {
  const client = await connectST();
  try {
    await run(client);
  } finally {
    await client.close();
  }
}
function ideaByText(ideas: AIReqIdea[], text: string): AIReqIdea {
  const matching = ideas.filter((idea) => idea.originalText === text);
  expect(matching).toHaveLength(1);
  return matching[0]!;
}

// Global configuration is shared. Restore only the exact revision written here;
// a newer writer is a test conflict and must never be overwritten in cleanup.
async function restoreModels(
  client: STClient,
  original: AIReqRemoteBootstrap["models"],
  owned?: AIReqRemoteBootstrap["models"],
) {
  if (!owned) return;
  const current = (await client.bootstrap()).models;
  if (current.revision !== owned.revision) {
    throw new Error("模型配置在 ST 运行期间被其他操作者修改，拒绝覆盖其配置；需人工核对本次变更。");
  }
  expect(current.settings, "同版本模型内容也必须仍是本例写入值").toEqual(owned.settings);
  await client.call("models.save", [original.settings, current.revision]);
  expect((await client.bootstrap()).models.settings).toEqual(original.settings);
}
async function restorePrompts(
  client: STClient,
  original: AIReqRemoteBootstrap["prompts"],
  owned?: AIReqRemoteBootstrap["prompts"],
) {
  if (!owned) return;
  const current = (await client.bootstrap()).prompts;
  if (current.revision !== owned.revision) {
    throw new Error(
      "Agent 指令在 ST 运行期间被其他操作者修改，拒绝覆盖其配置；需人工核对本次变更。",
    );
  }
  expect(current.saved, "同版本指令内容也必须仍是本例写入值").toEqual(owned.saved);
  await client.call("prompts.save", [original.saved, current.revision]);
  expect((await client.bootstrap()).prompts.saved).toEqual(original.saved);
}

describe("ST global ideas and configuration", () => {
  it(
    "creates an unplanned idea globally and edits text without replacing its submitter or creation time",
    async () => {
      await usingClient(async (client) => {
        const text = unique("想法原文");
        const created = await client.command({ type: "createIdea", originalText: text });
        expect(created.receipt.status).toBe("completed");
        expect(created).not.toHaveProperty("ideaId");
        expect(created.receipt).not.toHaveProperty("identity");
        expect(created.receipt.actorEmployeeId).toBe(client.identity.employeeId);
        const { view } = await client.read();
        expect(view.operations.find((item) => item.operationId === created.receipt.operationId)).toEqual(
          created.receipt,
        );
        const first = ideaByText(view.ideas, text);
        expect(first.submittedBy).toBe(client.identity.employeeId);
        expect(Number.isFinite(Date.parse(first.createdAt))).toBe(true);
        const nextText = unique("编辑后的想法");
        const edited = await client.command({
          type: "updateIdea",
          ideaId: first.id,
          ideaRevision: first.revision,
          originalText: nextText,
        });
        expect(edited.receipt.status).toBe("completed");
        const after = ideaByText((await client.read()).view.ideas, nextText);
        expect(after).not.toHaveProperty("updatedAt");
        expect(after).toMatchObject({
          id: first.id,
          submittedBy: first.submittedBy,
          createdAt: first.createdAt,
        });
        expect(after.revision).toBeGreaterThan(first.revision);
        await expect(
          client.command({
            type: "updateIdea",
            ideaId: first.id,
            ideaRevision: first.revision,
            originalText: unique("过期覆盖"),
          }),
        ).rejects.toThrow();
        expect((await client.read()).view.ideas.find((idea) => idea.id === first.id)).toEqual(
          after,
        );
      });
    },
    config.timeoutMs,
  );

  it(
    "imports duplicate bodies as independent ideas and rejects an invalid batch without partial creation",
    async () => {
      await usingClient(async (client) => {
        const repeated = unique("重复但有效的短需求");
        const imported = await client.command({
          type: "importIdeas",
          originalTexts: [repeated, repeated],
        });
        expect(imported.receipt.status).toBe("completed");
        const duplicateIdeas = (await client.read()).view.ideas.filter(
          (idea) => idea.originalText === repeated,
        );
        expect(duplicateIdeas).toHaveLength(2);
        expect(new Set(duplicateIdeas.map((idea) => idea.id)).size).toBe(2);
        expect(
          duplicateIdeas.every((idea) => idea.submittedBy === client.identity.employeeId),
        ).toBe(true);
        const validText = unique("失败批次里的合法行");
        await expect(
          client.command({ type: "importIdeas", originalTexts: [validText, " \n\t "] }),
        ).rejects.toThrow();
        await expect(client.command({ type: "importIdeas", originalTexts: [] })).rejects.toThrow();
        const after = (await client.read()).view;
        expect(after.ideas.some((idea) => idea.originalText === validText)).toBe(false);
        expect(after.ideas.filter((idea) => idea.originalText === repeated)).toEqual(
          duplicateIdeas,
        );
      });
    },
    config.timeoutMs,
  );

  it(
    "atomically transfers an idea into multiple Releases, preserving provenance and the idempotent receipt",
    async () => {
      await usingClient(async (client) => {
        const firstTarget = await createProject(client);
        const secondTarget = await createProject(client);
        const text = unique("同时转入两个项目的需求");
        await client.command({ type: "createIdea", originalText: text });
        const original = ideaByText((await client.read()).view.ideas, text);
        const targets = [firstTarget, secondTarget].map(({ projectId, releaseId }) => ({
          projectId,
          releaseId,
        }));
        const baseline = (await client.read()).view.revision;
        const action: AIReqAction = {
          type: "transferIdea",
          ideaId: original.id,
          ideaRevision: original.revision,
          targets,
          operationId: unique("转入操作"),
          expectedRevision: baseline,
        };
        const transferred = await client.command(action);
        expect(transferred.receipt.status).toBe("completed");
        expect(transferred.receipt).not.toHaveProperty("commandDigest");
        expect(transferred.transferredRequirements).toHaveLength(2);
        expect(new Set(transferred.transferredRequirements!.map((item) => item.irId)).size).toBe(2);
        // 转入目标的 releaseId 不是 readWorkflow selection 字段；按项目读取后再核对 Release 归属。
        // 原请求违反严格契约，导致转入成功后被误报为失败。
        for (const target of targets) {
          const view = (await client.read({ projectId: target.projectId })).view;
          expect(view.ideas.some((idea) => idea.id === original.id)).toBe(false);
          const proposals = view.drafts.filter((group) => group.originalText === text);
          expect(proposals).toHaveLength(1);
          expect(proposals[0]).toMatchObject({
            projectId: target.projectId,
            releaseId: target.releaseId,
            originalText: original.originalText,
            submittedBy: original.submittedBy,
            createdAt: original.createdAt,
          });
          expect(proposals[0]!.srIds).toEqual([]);
          expect(view.srs.filter((sr) => sr.irId === proposals[0]!.id)).toEqual([]);
          expect(view.running.filter((session) => session.irId === proposals[0]!.id)).toEqual([]);
        }
        const retried = await client.command(action);
        expect(retried.receipt.operationId).toBe(transferred.receipt.operationId);
        expect(retried.transferredRequirements).toEqual(transferred.transferredRequirements);
        await expect(client.command({ ...action, targets: [targets[0]!] })).rejects.toThrow();
        for (const target of targets) {
          expect(
            (await client.read({ projectId: target.projectId })).view.drafts.filter(
              (group) => group.originalText === text,
            ),
          ).toHaveLength(1);
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "rejects duplicate or wrongly-owned transfer targets without consuming the original idea",
    async () => {
      await usingClient(async (client) => {
        const a = await createProject(client);
        const b = await createProject(client);
        const text = unique("无效目标不应消费的想法");
        await client.command({ type: "createIdea", originalText: text });
        const original = ideaByText((await client.read()).view.ideas, text);
        for (const targets of [
          [],
          [
            { projectId: a.projectId, releaseId: a.releaseId },
            { projectId: a.projectId, releaseId: a.releaseId },
          ],
          [
            { projectId: a.projectId, releaseId: a.releaseId },
            { projectId: a.projectId, releaseId: b.releaseId },
          ],
        ]) {
          await expect(
            client.command({
              type: "transferIdea",
              ideaId: original.id,
              ideaRevision: original.revision,
              targets,
            }),
          ).rejects.toThrow();
          expect((await client.read()).view.ideas.find((idea) => idea.id === original.id)).toEqual(
            original,
          );
          expect(
            (await client.read(a.selection)).view.drafts.some(
              (group) => group.originalText === text,
            ),
          ).toBe(false);
          expect(
            (await client.read(b.selection)).view.drafts.some(
              (group) => group.originalText === text,
            ),
          ).toBe(false);
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "applies repository configuration atomically with its own CAS revision",
    async () => {
      await usingClient(async (client) => {
        const target = await createProject(client);
        const project = (await client.read(target.selection)).view.projects.find(
          (item) => item.id === target.projectId,
        )!;
        expect(project).toBeDefined();
        const name = unique("修改项目名称");
        const repositoryUrl = requireConfig(config.repositoryUrl, "repositoryUrl");
        await client.call("projects.saveRepository", [
          {
            projectId: project.id,
            name,
            repositoryUrl,
            defaultBranch: config.branch,
            expectedRevision: project.revision,
            operationId: unique("保存项目"),
          },
        ]);
        const changed = (await client.read(target.selection)).view.projects.find(
          (item) => item.id === project.id,
        )!;
        expect(changed).toMatchObject({ name, defaultBranch: config.branch });
        expect(changed.revision).toBeGreaterThan(project.revision);
        await expect(
          client.call("projects.saveRepository", [
            {
              projectId: project.id,
              name: unique("旧版本覆盖"),
              repositoryUrl,
              defaultBranch: config.branch,
              expectedRevision: project.revision,
              operationId: unique("过期项目保存"),
            },
          ]),
        ).rejects.toThrow();
        await expect(
          client.call("projects.saveRepository", [
            {
              projectId: project.id,
              name: unique("无效地址不应保存"),
              repositoryUrl: "javascript:invalid-repository",
              defaultBranch: config.branch,
              expectedRevision: changed.revision,
              operationId: unique("无效项目保存"),
            },
          ]),
        ).rejects.toThrow();
        expect(
          (await client.read(target.selection)).view.projects.find(
            (item) => item.id === project.id,
          ),
        ).toEqual(changed);
      });
    },
    config.timeoutMs,
  );

  it(
    "saves shared and independent Agent models, binds new work and retains the original discussion binding",
    async () => {
      await usingClient(async (client) => {
        const original = (await client.bootstrap()).models;
        const before = await createProposal(client);
        const originalBinding = before.remote.session?.modelConfig;
        expect(originalBinding?.role).toBe("requirements");
        const alternative = requireConfig(
          original.choices.find((choice) => choice.id !== original.settings.defaultModel),
          "模型配置测试需要至少两个可选正式模型",
        );
        const reviewers = [
          "requirements-review-a",
          "requirements-review-b",
          "requirements-review-c",
        ];
        const shared: AIReqAgentModelSettings = {
          defaultModel: alternative.id,
          agents: original.settings.agents.map((agent) =>
            ["requirements", ...reviewers].includes(agent.id)
              ? { ...agent, model: "inherit" }
              : agent,
          ),
        };
        const originalReviewer = requireConfig(
          shared.agents.find((agent) => agent.id === "requirements-review"),
          "独立需求评审 Agent",
        );
        const previousReviewModel =
          originalReviewer.model === "inherit" ? shared.defaultModel : originalReviewer.model;
        const reviewModel = requireConfig(
          original.choices.find((choice) => choice.id !== previousReviewModel),
          "需求评审的独立模型选项",
        );
        const next: AIReqAgentModelSettings = {
          ...shared,
          agents: shared.agents.map((agent) =>
            agent.id === originalReviewer.id ? { ...agent, model: reviewModel.id } : agent,
          ),
        };
        let owned: AIReqRemoteBootstrap["models"] | undefined;
        let notified = false;
        const subscription = client.services.aiReqService.onDidChange((event) => {
          if (event.type === "models") notified = true;
        });
        try {
          await client.call("models.save", [shared, original.revision]);
          owned = (await client.bootstrap()).models;
          expect(owned.settings).toEqual(shared);
          await client.call("models.save", [next, owned.revision]);
          // Bootstrap is the public post-commit verification and the only restore baseline.
          owned = (await client.bootstrap()).models;
          expect(owned.settings).toEqual(next);
          expect(owned.revision).toBeGreaterThan(original.revision);
          await waitUntil(
            "模型保存后的通知与配置重读",
            () => client.bootstrap(),
            (metadata) => notified && metadata.models.revision === owned!.revision,
          );
          await expect(
            client.call("models.save", [original.settings, original.revision]),
          ).rejects.toThrow();
          await expect(
            client.call("models.save", [
              { ...next, defaultModel: unique("不存在的模型") },
              owned.revision,
            ]),
          ).rejects.toThrow();
          expect((await client.bootstrap()).models).toEqual(owned);
          expect(
            owned.settings.agents.find((agent) => agent.id === "requirements-review-a"),
          ).toEqual(shared.agents.find((agent) => agent.id === "requirements-review-a"));

          const after = await createProposal(client);
          expect(after.remote.session?.modelConfig).toMatchObject({
            role: "requirements",
            modelKey: alternative.id,
            inherited: true,
          });
          expect((await client.read(before.selection)).session?.modelConfig).toEqual(
            originalBinding,
          );
          await completeBusinessMaterial(client, after);
          await submitReview(client, after, "original");
          const { review: requirements } = await waitForReview(client, after, "original");
          expect(requirements.agents?.[0]?.session.modelConfig).toMatchObject({
            role: "requirements-review",
            modelKey: reviewModel.id,
            inherited: false,
          });
          await approveOriginalReview(client, after);
          await completeSolutionMaterial(client, after);
          await submitReview(client, after, "full");
          const { review: solution } = await waitForReview(client, after, "full");
          for (const role of reviewers) {
            expect(
              solution.agents?.find((agent) => agent.session.modelConfig?.role === role),
            ).toMatchObject({
              session: { modelConfig: { role, modelKey: alternative.id, inherited: true } },
            });
          }
          expect(
            solution.agents?.find((agent) => agent.id === "summary")?.session.modelConfig?.role,
          ).toBe("solution-review-summary");
        } finally {
          subscription.dispose();
          await restoreModels(client, original, owned);
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "saves all Agent instructions atomically, counts UTF-8 bytes, rejects stale writes and restores only its own revision",
    async () => {
      await usingClient(async (client) => {
        const initial = await client.bootstrap();
        const original = initial.prompts;
        const role = "requirements-review";
        const before = await createProposal(client);
        await completeBusinessMaterial(client, before);
        await submitReview(client, before, "original");
        const { review: historical } = await waitForReview(client, before, "original");
        const next = { ...original.saved, [role]: unique("追加指令：必须核对验收依据") };
        let owned: AIReqRemoteBootstrap["prompts"] | undefined;
        let notified = false;
        const subscription = client.services.aiReqService.onDidChange((event) => {
          if (event.type === "prompts") notified = true;
        });
        try {
          await client.call("prompts.save", [next, original.revision]);
          owned = (await client.bootstrap()).prompts;
          expect(owned.saved).toEqual(next);
          // 草稿属于浏览器，bootstrap 只返回已保存指令及版本。
          expect(owned).not.toHaveProperty("draft");
          expect(owned.revision).toBeGreaterThan(original.revision);
          await waitUntil(
            "指令保存后的通知与重读",
            () => client.bootstrap(),
            (metadata) => notified && metadata.prompts.revision === owned!.revision,
          );
          await expect(
            client.call("prompts.save", [original.saved, original.revision]),
          ).rejects.toThrow();
          const tooManyUtf8Bytes = "需".repeat(Math.floor(USER_INSTRUCTIONS_MAX_BYTES / 3) + 1);
          expect(new TextEncoder().encode(tooManyUtf8Bytes).length).toBeGreaterThan(
            USER_INSTRUCTIONS_MAX_BYTES,
          );
          await expect(
            client.call("prompts.save", [{ ...next, [role]: tooManyUtf8Bytes }, owned.revision]),
          ).rejects.toThrow();
          await expect(
            client.call("prompts.save", [
              { ...next, [unique("非法角色")]: "不应保存" },
              owned.revision,
            ]),
          ).rejects.toThrow();
          expect((await client.bootstrap()).prompts).toEqual(owned);
          await commandAndRead(
            client,
            {
              type: "reviseProposalMaterial",
              target: "requirements",
              note: "补充对无导出权限用户的验收条件。",
            },
            before,
          );
          await submitReview(client, before, "original");
          const { remote, review: current } = await waitForReview(client, before, "original");
          expect(current.id).not.toBe(historical.id);
          expect(current.agents?.[0]).toMatchObject({
            session: { modelConfig: { role, promptSnapshot: next[role] } },
          });
          expect(current.agents?.[0]).not.toHaveProperty("promptSnapshot");
          expect(current).not.toHaveProperty("requestedBy");
          expect(getProposal(remote, before).originalReviewHistory).toContainEqual({
            ...historical,
            invalidatedReason: expect.any(String),
          });
        } finally {
          subscription.dispose();
          await restorePrompts(client, original, owned);
        }
      });
    },
    config.timeoutMs,
  );
});
