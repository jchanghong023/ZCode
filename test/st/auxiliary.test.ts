import { describe, expect, it } from "vitest";
import {
  IModelSelectionService,
  IProjectService,
  IProviderSettingsService,
  ISystemService,
} from "@zcode/services";
import { connectST, expectRpcUnavailable, unique, type STClient } from "./client.js";
import { config, requireConfig } from "./config.js";
import { readRequirement, takeRequirement } from "./business.js";
import { getProposal } from "./proposal-flow.js";
import { openNative, openNativeSession, requireAccepted } from "./native.js";

async function saveSkillFiles(c: STClient) {
  // 只读前置缺失时才生成资源；Skill 写入必须占用声明为专用项目的 IR。
  const { projectId, remote } = await takeRequirement(c, { configuredProject: true });
  const workspacePath = requireConfig(remote.workspace.path, "专用项目的 Skill 工作区路径");
  const skillSession = await c.call("skillDesign.session", [projectId]);
  expect(skillSession).toEqual({
    sessionId: expect.stringMatching(/\S/),
    workspaceIdentity: expect.stringMatching(/\S/),
    temporaryDirectory: expect.stringMatching(/\S/),
  });
  const { sessionId, workspaceIdentity, temporaryDirectory } = skillSession;
  const draft = {
    goal: "编写接口变更评审技能，说明如何按字节检查 UTF-8 文件。",
    when: "检查业务文件及配套流程说明时使用。",
    inputs: "文件路径及字节范围。",
    outputs: "生成中文 SKILL.md、配套检查清单及无脚本无外链的静态 SVG 流程图，供预览并保存。",
    boundaries: "只读，不删除或覆盖已有文件。",
    references: "文件接口契约。",
    example: "中文验收：偏移按字节而非字符计算。",
  };
  await c.call("skillDesign.saveDraft", [sessionId, draft]);
  const prompt = await c.call("skillDesign.prompt", [sessionId, draft]);
  expect(prompt).toContain(`${temporaryDirectory}/SKILL.md`);
  const native = await openNativeSession(
    c.services.zcodeAgentService,
    c.identity.clientId,
    sessionId,
    { workspacePath, workspaceIdentity },
  );
  try {
    requireAccepted(await native.send("sendText", { text: prompt }));
    expect((await native.waitIdle()).control.phase).toBe("completedSuccess");
    const preview = requireConfig(
      await c.call("skillDesign.readPreview", [sessionId]),
      "技能讨论必须生成可保存的文件预览",
    );
    expect(preview).not.toHaveProperty("directory");
    const main = requireConfig(
      preview.files.find(({ path }) => path === "SKILL.md"),
      "技能预览的 SKILL.md",
    );
    const receipt = await c.call("skillDesign.savePreview", [
      sessionId,
      "project",
      preview.revision,
      unique("save-file"),
    ]);
    expect(receipt).toEqual({
      path: expect.stringMatching(/[/\\]SKILL\.md$/),
      revision: preview.revision,
      target: "project",
    });
    expect(await c.call("skillDesign.readPreview", [sessionId])).toEqual({
      ...preview,
      savedReceipt: receipt,
    });
    expect(await c.call("skillDesign.listSkills", [sessionId])).toContain(receipt.path);
    return { preview, main, receipt, directory: receipt.path.replace(/[/\\]SKILL\.md$/, "") };
  } finally {
    await native.close();
  }
}

describe("ST auxiliary public contracts", () => {
  let generatedFiles: ReturnType<typeof saveSkillFiles> | undefined;
  // 两个读取用例都可独立获取资源，不要求特定顺序，也不在同项目保存两份同名产物。
  const skillFiles = (c: STClient) => (generatedFiles ??= saveSkillFiles(c));

  it(
    "reads UTF-8 bytes, byte offsets, EOF and file/directory existence through RPC",
    async () => {
      const c = await connectST();
      try {
        let file = config.file;
        if (!file) {
          const { main, receipt, directory } = await skillFiles(c);
          file = {
            workspacePath: directory,
            path: receipt.path,
            directoryPath: directory,
            missingPath: `${directory}/${unique("missing")}.txt`,
            // 预期字节取本轮确认的预览，不读取后端源码或假定固定 AI 回复。
            bytesBase64: Buffer.from(main.content, "utf8").toString("base64"),
          };
        }
        const bytes = Uint8Array.from(Buffer.from(file.bytesBase64, "base64"));
        requireConfig(
          bytes.some((value) => value > 127) ? true : undefined,
          "ST_FILE_JSON.bytesBase64 须包含非空多字节 UTF-8 内容，用于区分字节偏移与字符偏移",
        );
        const service = c.services.fileService;
        const stat = await service.stat({ path: file.path });
        expect(stat).toMatchObject({
          type: "file",
          size: bytes.byteLength,
          mtimeMs: expect.any(Number),
        });
        expect(stat).not.toHaveProperty("path");
        expect(await service.stat({ path: file.directoryPath })).toEqual({ type: "directory" });
        expect(
          await service.checkFilesExist({
            paths: [file.path, file.directoryPath, file.missingPath],
          }),
        ).toEqual([file.path, file.directoryPath]);
        const multiByteOffset = bytes.findIndex((byte) => byte > 127);
        for (const [offset, length] of [
          [0, bytes.length + 7],
          [1, 3],
          [bytes.length - 1, 8],
          [bytes.length, 8],
          [bytes.length + 3, 8],
          [0, 0],
          [bytes.length + 3, 0],
          [multiByteOffset, 4],
          [multiByteOffset + 1, 1],
          [Number.MAX_SAFE_INTEGER, 1],
        ]) {
          const chunk = await service.readFileRange({
            path: file.path,
            offset: offset!,
            length: length!,
          });
          expect(chunk).toBeInstanceOf(Uint8Array);
          expect(Array.from(chunk)).toEqual(Array.from(bytes.slice(offset!, offset! + length!)));
        }
        await expect(
          service.readFileRange({ path: file.missingPath, offset: 0, length: 10 }),
        ).rejects.toThrow();
        await expect(
          service.readFileRange({ path: file.directoryPath, offset: 0, length: 10 }),
        ).rejects.toThrow();
        for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
          await expect(
            service.readFileRange({ path: file.path, offset: invalid, length: 10 }),
          ).rejects.toThrow();
          await expect(
            service.readFileRange({ path: file.path, offset: 0, length: invalid }),
          ).rejects.toThrow();
        }
        const name = file.path.split(/[\\/]/u).at(-1)!;
        const matches = await service.searchWorkspaceFiles({
          rootPath: file.workspacePath,
          query: name,
          limit: 1,
        });
        expect(matches).toEqual([{ path: file.path, relativePath: expect.any(String) }]);
        expect(matches[0]!.relativePath.split("/").at(-1)).toBe(name);
        const after = await service.stat({ path: file.path });
        expect(after).toEqual(stat);
        expect(
          await service.readFileRange({ path: file.path, offset: 0, length: bytes.length }),
        ).toEqual(bytes);
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "reads a saved media object's actual bytes without assuming backend-specific capability",
    async () => {
      const c = await connectST();
      try {
        let raw: Record<string, unknown>;
        if (config.fixtures.media !== undefined) {
          raw = requireConfig(config.fixtures.media[0], "fixtures.media[0] 只读媒体前置");
        } else {
          const { preview, directory } = await skillFiles(c);
          const graphic = requireConfig(
            preview.files.find(({ path }) => /\.svg$/i.test(path)),
            "技能预览的静态 SVG 流程图",
          );
          raw = {
            path: `${directory}/${graphic.path}`,
            mediaType: "image/svg+xml",
            bytesBase64: Buffer.from(graphic.content, "utf8").toString("base64"),
          };
        }
        const path = requireConfig(
          typeof raw.path === "string" && raw.path ? raw.path : undefined,
          "fixtures.media[0].path",
        );
        const mediaType = requireConfig(
          typeof raw.mediaType === "string" && raw.mediaType ? raw.mediaType : undefined,
          "fixtures.media[0].mediaType",
        );
        const bytesBase64 = requireConfig(
          typeof raw.bytesBase64 === "string" ? raw.bytesBase64 : undefined,
          "fixtures.media[0].bytesBase64",
        );
        const expected = Buffer.from(bytesBase64, "base64");
        const result = await c.services.fileService.readMediaPreview({ path });
        expect(result).toEqual({ mediaType, dataBase64: expect.any(String) });
        expect(Buffer.from(result.dataBase64, "base64")).toEqual(expected);
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "resolves an existing business session's directories without creating replacement sessions",
    async () => {
      const c = await connectST();
      try {
        const requirement = await readRequirement(c);
        const session = requireConfig(
          requirement.remote.session,
          "只读 IR 必须提供当前需求讨论的 session 引用",
        );
        const workspacePath = requireConfig(
          requirement.remote.workspace.path,
          "只读 IR 必须提供讨论 workspace.path",
        );
        const ref = {
          taskId: session.sessionId,
          workspacePath,
          workspaceIdentity: requirement.remote.workspace.identity,
        };
        const before = requirement.remote;
        const projectService = requireConfig(c.services.projectService, "公开 project service");
        expect(await projectService.resolveSessionDirectories(ref)).toEqual({
          projectId: requirement.projectId,
        });
        expect(
          await c.probeRpc("call", IProjectService.channelName, "resolveSessionDirectories", [
            ref,
            "local",
          ]),
        ).toMatchObject({ code: "INVALID_ARGUMENT" });
        const tree = await projectService.readTree();
        expect(tree.projects).toContainEqual(
          expect.objectContaining({ id: requirement.projectId }),
        );
        expect(new Set(tree.projects.map((project) => project.id)).size).toBe(tree.projects.length);
        for (const entry of [...tree.projects, ...tree.tasks]) {
          expect(entry).not.toHaveProperty("hostId");
        }
        expect(
          await c.probeRpc("call", IProjectService.channelName, "readTree", [{ hostId: "local" }]),
        ).toMatchObject({ code: "INVALID_ARGUMENT" });
        await expect(
          projectService.resolveSessionDirectories({
            ...ref,
            taskId: unique("missing-session"),
          }),
        ).rejects.toThrow();
        await expect(
          projectService.resolveSessionDirectories({
            ...ref,
            workspaceIdentity: unique("wrong-workspace"),
          }),
        ).rejects.toThrow();
        const after = await c.read(requirement.selection);
        expect(after.session).toEqual(before.session);
        expect(getProposal(after, requirement).sessions).toEqual(
          getProposal(before, requirement).sessions,
        );
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "rejects retired channels, projects Web settings, and resolves the business model",
    async () => {
      const c = await connectST();
      try {
        const requirement = await readRequirement(c);
        const settings = await c.services.settingService.get();
        expect(settings).toHaveProperty("locale");
        expect(settings).not.toHaveProperty("terminalInheritSystemProfile");
        expect(settings).not.toHaveProperty("closeToTrayOnWindows");
        expect(settings).not.toHaveProperty("sourceServers");
        expect(settings).not.toHaveProperty("recentProjects");
        await expect(
          c.services.settingService.update({
            recentProjects: [],
          } as unknown as Parameters<typeof c.services.settingService.update>[0]),
        ).rejects.toThrow();
        expect(settings).not.toHaveProperty("lastActiveWorkspace");
        expect(settings).not.toHaveProperty("lastWorkspaceSession");
        expect(settings).not.toHaveProperty("lastActiveTabIndex");
        expect(settings).not.toHaveProperty("lastActiveTaskByWorkspace");
        await expect(
          c.services.settingService.update({
            lastActiveTaskByWorkspace: { "test-workspace": "test-task" },
          } as unknown as Parameters<typeof c.services.settingService.update>[0]),
        ).rejects.toThrow();
        expect(settings).not.toHaveProperty("memoryEnabled");
        expect(settings).not.toHaveProperty("computerUseComposerEntryHidden");
        const allowedPatch = { locale: settings.locale === "en-US" ? "zh-CN" : "en-US" } as const;
        const desktopOnly = {
          providerFamilyDomain: "",
          providerFamilyConnectionSelections: {},
          providerFamilyDomainUpdatedAt: 1,
          providerFamilyDomainMigrated: true,
          askUserQuestionAutoResolutionEnabled: true,
          modelIoFullRetentionEnabled: true,
        };
        const settingsService = c.services.settingService;
        try {
          for (const [field, value] of Object.entries(desktopOnly)) {
            expect(settings).not.toHaveProperty(field);
            await expect(
              settingsService.update({ ...allowedPatch, [field]: value }),
              `Web setting.update must reject ${field}`,
            ).rejects.toThrow();
            expect(await settingsService.get()).toStrictEqual(settings);
          }
          await expect(settingsService.update(allowedPatch)).resolves.toBeUndefined();
          expect(await settingsService.get()).toStrictEqual({ ...settings, ...allowedPatch });
        } finally {
          await settingsService.update({ locale: settings.locale });
        }
        await expectRpcUnavailable(
          c.probeRpc,
          "call",
          ISystemService.channelName,
          "info",
          [],
          true,
        );
        const bootstrap = await c.bootstrap();
        const workflowRoles = bootstrap.models.settings.agents.map((agent) => agent.id).sort();
        expect(workflowRoles).toEqual([
          "requirements",
          "requirements-review",
          "solution",
          "solution-review",
        ]);
        expect(workflowRoles).toEqual(expect.arrayContaining(Object.keys(bootstrap.prompts.saved)));
        const binding = requireConfig(
          requirement.remote.session?.modelConfig,
          "只读 IR 的需求讨论必须提供实际 Agent 模型绑定",
        );
        expect(binding.role).toBe("requirements");
        // 业务配置键只对应 AIReq 目录；原生执行标识从 v4 快照读取，不解析 choice.id。
        const choice = bootstrap.models.choices.find((model) => model.id === binding.modelKey);
        expect(choice).toMatchObject({ name: binding.modelName });
        const modelView = await c.services.modelSelectionService.getView();
        expect(Number.isInteger(modelView.revision)).toBe(true);
        const native = await openNative(c, requirement.remote);
        const selection = await native
          .snapshot()
          .then((snapshot) => snapshot.config.modelSelection)
          .finally(() => native.close());
        const provider = requireConfig(
          modelView.providers.find((item) => item.providerId === selection?.providerId),
          "会话绑定供应商必须出现在原生模型目录中",
        );
        const model = requireConfig(
          provider.models.find((item) => item.modelId === selection?.modelId),
          "会话绑定模型必须出现在原生模型目录中",
        );
        for (const entry of modelView.providers) {
          expect(entry).not.toHaveProperty("templateId");
          expect(
            Object.keys(entry.config).filter((key) => !["logo", "api", "access"].includes(key)),
          ).toEqual([]);
          if (entry.config.api) {
            expect(entry.config.api).toStrictEqual({ type: entry.config.api.type });
          }
          const access = entry.config.access;
          if (access) {
            expect(access).toStrictEqual(
              access.type === "zhipu-account"
                ? {
                    type: access.type,
                    accountType: access.accountType,
                    mode: access.mode,
                    entitled: access.entitled,
                  }
                : { type: access.type },
            );
          }
          for (const { config } of entry.models) {
            expect(config.properties).toStrictEqual({
              inputFormat: { supportsImage: expect.any(Boolean) },
            });
            expect(config.optionSpecs).toStrictEqual({
              reasoningLevel: { values: expect.any(Array) },
            });
            expect(config).not.toHaveProperty("enabled");
          }
        }
        const modelSelectionChannel = IModelSelectionService.channelName;
        const emptySelection = { selection: null };
        expect(
          await c.probeRpc("call", modelSelectionChannel, "getView", [emptySelection]),
        ).toMatchObject({ type: 201 }); // PromiseSuccess
        expect(
          await c.probeRpc("call", modelSelectionChannel, "getView", [
            emptySelection,
            emptySelection,
          ]),
        ).toMatchObject({ code: "INVALID_ARGUMENT" });
        const selectionIds = { providerId: provider.providerId, modelId: model.modelId };
        for (const invalid of [
          { ...emptySelection, refresh: true },
          { selection: { ...selectionIds, baseUrl: "http://example.invalid" } },
          { selection: { ...selectionIds, options: { reasoningLevel: "default", extra: true } } },
        ]) {
          expect(
            await c.probeRpc("call", modelSelectionChannel, "getView", [invalid]),
          ).toMatchObject({ type: 202 }); // PromiseError
        }
        await expectRpcUnavailable(
          c.probeRpc,
          "call",
          IProviderSettingsService.channelName,
          "getView",
          [],
          true,
        );
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );
});
