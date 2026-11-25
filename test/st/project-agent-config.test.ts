import { describe, expect, it } from "vitest";
import type {
  AIReqAgentModelSettings,
  AIReqRemoteArgs,
  AIReqRemoteBootstrap,
} from "@zcode/services/aireq";
import { USER_INSTRUCTIONS_MAX_BYTES } from "../../packages/shared/src/userInstructions.js";
import { connectST, unique, waitUntil, type STClient } from "./client.js";
import { config, requireConfig } from "./config.js";
import { requireTestProject, takeRequirement } from "./business.js";
import { openNative } from "./native.js";
import {
  completeBusinessMaterial,
  getMaterials,
  getProposal,
  reviewDocuments,
  reviewInvocation,
} from "./proposal-flow.js";

// Assertions come from section-navigation.md, tools-settings.md,
// connection-identity.md and the public services/aireq contract, not backend samples.
async function usingClient(run: (client: STClient) => Promise<void>) {
  const client = await connectST();
  try {
    await run(client);
  } finally {
    await client.close();
  }
}
function modelWriteInput(settings: AIReqAgentModelSettings): AIReqRemoteArgs<"models.save">[0] {
  return {
    defaultModel: settings.defaultModel,
    agents: settings.agents.map(({ id, model, reasoning }) => ({ id, model, reasoning })),
  };
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
  await client.call("models.save", [modelWriteInput(original.settings), current.revision]);
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

describe("ST project and Agent configuration", () => {
  it(
    "applies repository configuration atomically with its own CAS revision",
    async () => {
      await usingClient(async (client) => {
        const first = await requireTestProject(client);
        const project =
          first.repositoryUrl && first.workDirectory
            ? first
            : await requireTestProject(client, first.id);
        const repositoryUrl = requireConfig(
          project.repositoryUrl,
          "仓库配置 CAS 要求可回写的专用仓库",
        );
        const workDirectory = requireConfig(
          project.workDirectory,
          "仓库配置 CAS 要求已配置的工作目录",
        );
        const selection = { projectId: project.id };
        const readProject = async () =>
          requireConfig(
            (await client.read(selection)).view.projects.find((item) => item.id === project.id),
            "公开目录中的测试项目",
          );
        const save = {
          projectId: project.id,
          repositoryUrl,
          defaultBranch: unique("st-repository-cas"),
          workDirectory,
          expectedRevision: project.revision,
          operationId: unique("save-project-repository"),
        };
        const changed = {
          ...project,
          defaultBranch: save.defaultBranch,
          revision: project.revision + 1,
        };
        let saved = false;
        try {
          const result = await client.call("projects.saveRepository", [save]);
          saved = true;
          expect(result).toBeNull();
          // 项目名称由云龙持有；本地保存只改变指定项目的配置 revision 和代码入口。
          expect(await readProject()).toEqual(changed);
          // 重试可带旧的或重读后的 CAS 基线；只要设置相同，就不重复提交。
          expect(await client.call("projects.saveRepository", [save])).toBe(result);
          expect(
            await client.call("projects.saveRepository", [
              { ...save, expectedRevision: changed.revision },
            ]),
          ).toBe(result);
          await expect(
            client.call("projects.saveRepository", [
              { ...save, defaultBranch: project.defaultBranch, expectedRevision: changed.revision },
            ]),
          ).rejects.toThrow("操作编号不能复用于不同输入");
          await expect(
            client.call("projects.saveRepository", [
              { ...save, defaultBranch: project.defaultBranch, operationId: unique("stale-save") },
            ]),
          ).rejects.toThrow("项目配置已变化");
          const anotherWrite = { ...save, expectedRevision: changed.revision };
          await expect(
            client.call("projects.saveRepository", [
              {
                ...anotherWrite,
                repositoryUrl: "javascript:invalid-repository",
                operationId: unique("invalid-repository"),
              },
            ]),
          ).rejects.toThrow("请输入 Git 远程仓库地址");
          await expect(
            client.services.aiReqService.call(client.identity, "projects.saveRepository", [
              { ...anotherWrite, name: unique("forbidden-name"), operationId: unique("rename") },
            ] as never),
          ).rejects.toThrow("操作参数无效");
          expect(await readProject()).toEqual(changed);
        } finally {
          if (saved) {
            // 只按已记录的精确版本和值复原，不能把重读到的其他写入当成本例所有。
            expect(await readProject(), "项目配置被并发修改，拒绝覆盖").toEqual(changed);
            await client.call("projects.saveRepository", [
              {
                ...save,
                defaultBranch: project.defaultBranch,
                expectedRevision: changed.revision,
                operationId: unique("restore-project-repository"),
              },
            ]);
            expect(await readProject()).toEqual({ ...project, revision: changed.revision + 1 });
          }
        }
      });
    },
    config.timeoutMs,
  );

  it(
    "saves shared and independent Agent models, binds new work and retains the original discussion binding",
    async () => {
      await usingClient(async (client) => {
        const original = (await client.bootstrap()).models;
        const before = await takeRequirement(client, { unboundPhase: "requirements" });
        const originalBinding = before.remote.session?.modelConfig;
        expect(originalBinding?.role).toBe("requirements");
        const alternative = requireConfig(
          original.choices.find((choice) => choice.id !== original.settings.defaultModel),
          "模型配置测试需要至少两个可选正式模型",
        );
        const shared: AIReqAgentModelSettings = {
          defaultModel: alternative.id,
          agents: original.settings.agents.map((agent) =>
            ["requirements", "solution", "solution-review"].includes(agent.id)
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
          await client.call("models.save", [modelWriteInput(shared), original.revision]);
          owned = { ...original, revision: original.revision + 1, settings: shared };
          expect((await client.bootstrap()).models).toEqual(owned);
          await client.call("models.save", [modelWriteInput(next), owned.revision]);
          // 公共保存不返回版本；只恢复由 CAS 基线和本次写入确定的值，不认领并发写入。
          owned = { ...owned, revision: owned.revision + 1, settings: next };
          expect((await client.bootstrap()).models).toEqual(owned);
          expect(owned.revision).toBeGreaterThan(original.revision);
          await waitUntil(
            "模型保存后的通知与配置重读",
            () => client.bootstrap(),
            (metadata) => notified && metadata.models.revision === owned!.revision,
          );
          await expect(
            client.call("models.save", [modelWriteInput(original.settings), original.revision]),
          ).rejects.toThrow();
          await expect(
            client.call("models.save", [
              { ...modelWriteInput(next), defaultModel: unique("不存在的模型") },
              owned.revision,
            ]),
          ).rejects.toThrow();
          const { defaultModel, agents } = original.settings;
          for (const field of ["name", "nameEn", "description", "descriptionEn"] as const) {
            await expect(
              client.services.aiReqService.call(client.identity, "models.save", [
                {
                  defaultModel,
                  agents: agents.map(({ id, model, reasoning, [field]: display }) => ({
                    id,
                    model,
                    reasoning,
                    [field]: display,
                  })),
                },
                owned.revision,
              ] as never),
            ).rejects.toThrow("操作参数无效，请检查输入并重试。");
          }
          expect((await client.bootstrap()).models).toEqual(owned);
          // 目录读取不会绑定讨论配置，保存后才首次打开另一专用 IR 的需求阶段。
          const after = await takeRequirement(client, { unboundPhase: "requirements" });
          const requirementsAgent = next.agents.find((agent) => agent.id === "requirements")!;
          expect(after.remote.session?.modelConfig).toEqual({
            role: "requirements",
            roleName: requirementsAgent.name,
            modelKey: alternative.id,
            modelName: alternative.name,
            reasoning: requirementsAgent.reasoning,
            inherited: true,
            promptSnapshot: expect.any(String),
          });
          expect(after.remote.session).not.toHaveProperty("runtimeModel");
          const native = await openNative(client, after.remote);
          try {
            expect((await native.snapshot()).config.modelSelection).toMatchObject({
              options: { reasoningLevel: requirementsAgent.reasoning },
              modelId: alternative.name,
            });
          } finally {
            await native.close();
          }
          expect(
            (await client.read({ ...before.selection, discussionPhase: "requirements" })).session
              ?.modelConfig,
          ).toEqual(originalBinding);
          await completeBusinessMaterial(client, after);
          const { review } = await reviewDocuments(client, after, "requirements");
          expect(review.agent).toBe("requirements");
          expect(await reviewInvocation(client, after, review)).toMatchObject({
            input: { model: reviewModel.name, reasoning: originalReviewer.reasoning },
          });
          expect((await client.bootstrap()).models.settings).toEqual(next);
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
        const before = await takeRequirement(client, { unboundPhase: "requirements" });
        await completeBusinessMaterial(client, before);
        const { review: historical } = await reviewDocuments(client, before, "requirements");
        const next = { ...original.saved, [role]: unique("追加指令：必须核对验收依据") };
        let owned: AIReqRemoteBootstrap["prompts"] | undefined;
        let notified = false;
        const subscription = client.services.aiReqService.onDidChange((event) => {
          if (event.type === "prompts") notified = true;
        });
        try {
          await client.call("prompts.save", [next, original.revision]);
          owned = { ...original, revision: original.revision + 1, saved: next };
          expect((await client.bootstrap()).prompts).toEqual(owned);
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
          const previousMaterials = getMaterials(await client.read(before.selection), before);
          const { remote, review: current } = await reviewDocuments(client, before, "requirements");
          expect(current.id).not.toBe(historical.id);
          expect(current.version).toBe(historical.version);
          expect(getProposal(remote, before).documentReviews).toEqual(
            expect.arrayContaining([historical, current]),
          );
          expect(getMaterials(remote, before)).toEqual(previousMaterials);
          expect(await reviewInvocation(client, before, current)).toMatchObject({
            input: { prompt: expect.stringContaining(next[role]) },
          });
          expect(await reviewInvocation(client, before, historical)).toMatchObject({
            input: { prompt: expect.not.stringContaining(next[role]) },
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
