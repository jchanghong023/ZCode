import { describe, expect, it } from "vitest";
import {
  IModelSelectionService,
  IProjectService,
  IProviderSettingsService,
  ISystemService,
} from "@zcode/services";
import { connectST, expectRpcUnavailable, unique } from "./client.js";
import { config, requireConfig } from "./config.js";
import { createProposal } from "./business.js";
import { openNative, requireAccepted } from "./native.js";

type STClient = Awaited<ReturnType<typeof connectST>>;

/** 通过正常设计、讨论、预览和保存准备文件，不访问任何服务端私有状态。 */
async function saveSkillFiles(c: STClient, goal: string, outputs: string) {
  const created = await createProposal(c);
  const session = requireConfig(created.remote.session, "公开提案必须提供原生会话引用");
  const skillSession = await c.call("skillDesign.session", [created.projectId]);
  expect(skillSession).toEqual({
    sessionId: expect.stringMatching(/\S/),
    workspaceIdentity: expect.stringMatching(/\S/),
    temporaryDirectory: expect.stringMatching(/\S/),
  });
  const { sessionId, workspaceIdentity, temporaryDirectory } = skillSession;
  const draft = {
    goal,
    when: "检查业务文件及配套流程说明时使用。",
    inputs: "文件路径及字节范围。",
    outputs,
    boundaries: "只读，不删除或覆盖已有文件。",
    references: "文件接口契约。",
    example: "中文验收：偏移按字节而非字符计算。",
  };
  await c.call("skillDesign.saveDraft", [sessionId, draft]);
  const prompt = await c.call("skillDesign.prompt", [sessionId, draft]);
  expect(prompt).toContain(`${temporaryDirectory}/SKILL.md`);
  const native = await openNative(c, {
    ...created.remote,
    session: { ...session, sessionId },
    workspace: { ...created.remote.workspace, identity: workspaceIdentity },
  });
  try {
    requireAccepted(await native.send("sendText", { text: prompt }));
    expect((await native.waitIdle()).control.phase).toBe("completedSuccess");
    const preview = requireConfig(
      await c.call("skillDesign.readPreview", [sessionId]),
      "技能讨论必须生成可保存的文件预览",
    );
    expect(preview).not.toHaveProperty("directory");
    const main = requireConfig(
      preview.files.find((entry) => entry.path === "SKILL.md"),
      "技能预览必须包含 SKILL.md",
    );
    const receipt = await c.call("skillDesign.savePreview", [
      sessionId,
      "project",
      preview.revision,
      unique("save-file"),
    ]);
    expect(receipt).toEqual({
      path: expect.any(String),
      revision: preview.revision,
      target: "project",
    });
    const slash = Math.max(receipt.path.lastIndexOf("/"), receipt.path.lastIndexOf("\\"));
    return {
      preview,
      main,
      receipt,
      directoryPath: receipt.path.slice(0, slash),
    };
  } finally {
    await native.close();
  }
}

async function fileFixture(c: STClient) {
  let file = config.file;
  if (!file) {
    // 预期字节取本轮已确认的预览内容，不读取后端源码或固定 AI 回复。
    const saved = await saveSkillFiles(
      c,
      "编写文件读取验收技能，说明使用中文并保留 UTF-8 多字节文本。",
      "给出字节范围和 EOF 的检查步骤。",
    );
    file = {
      // 搜索限定本次新建的技能目录，避免其他同名 SKILL.md 占用 limit=1 的结果。
      workspacePath: saved.directoryPath,
      path: saved.receipt.path,
      directoryPath: saved.directoryPath,
      missingPath: `${saved.directoryPath}/${unique("missing")}.txt`,
      bytesBase64: Buffer.from(saved.main.content, "utf8").toString("base64"),
    };
  }
  const bytes = Uint8Array.from(Buffer.from(file.bytesBase64, "base64"));
  requireConfig(
    bytes.some((value) => value > 127) ? true : undefined,
    "文件前置须包含非空多字节 UTF-8 内容；可通过 ST_FILE_JSON.bytesBase64 指定，用于验证字节偏移而非字符偏移",
  );
  return { file, bytes };
}

describe("ST auxiliary public reads", () => {
  it(
    "reads UTF-8 bytes, byte offsets, EOF and file/directory existence through RPC",
    async () => {
      const c = await connectST();
      try {
        const { file, bytes } = await fileFixture(c);
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
        let raw: Record<string, unknown> | undefined = config.fixtures.media?.[0];
        if (config.fixtures.media !== undefined)
          raw = requireConfig(raw, "显式配置的媒体前置为空，请补充实际可读媒体对象");
        if (!raw) {
          const saved = await saveSkillFiles(
            c,
            "设计接口变更评审技能，包含配套的静态 SVG 流程图说明。",
            "输出技能主文件、检查清单和无脚本、无外链的 SVG 流程说明文件，供逐一预览并保存。",
          );
          const graphic = requireConfig(
            saved.preview.files.find((file) => /\.svg$/i.test(file.path)),
            "技能设计请求必须提供配套 SVG 流程图预览",
          );
          raw = {
            path: `${saved.directoryPath}/${graphic.path}`,
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
      let created: Awaited<ReturnType<typeof createProposal>> | undefined;
      try {
        created = await createProposal(c);
        const session = requireConfig(
          created.remote.session,
          "公开提案读取必须提供当前讨论的 session 引用",
        );
        const workspacePath = requireConfig(
          created.remote.workspace.path,
          "公开提案读取必须提供讨论 workspace.path",
        );
        const ref = {
          taskId: session.sessionId,
          workspacePath,
          workspaceIdentity: created.remote.workspace.identity,
        };
        const before = await c.read(created.selection);
        const projectService = requireConfig(c.services.projectService, "公开 project service");
        expect(await projectService.resolveSessionDirectories(ref)).toEqual({
          projectId: created.projectId,
        });
        expect(
          await c.probeRpc("call", IProjectService.channelName, "resolveSessionDirectories", [
            ref,
            "local",
          ]),
        ).toMatchObject({ code: "INVALID_ARGUMENT" });
        const tree = await projectService.readTree();
        expect(tree.projects).toContainEqual(expect.objectContaining({ id: created.projectId }));
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
        const after = await c.read(created.selection);
        expect(after.session).toEqual(before.session);
        expect(after.view.sessions.filter((item) => item.projectId === created!.projectId)).toEqual(
          before.view.sessions.filter((item) => item.projectId === created!.projectId),
        );
      } finally {
        try {
          if (created)
            await c.command(
              {
                type: "deleteRequirement",
                projectId: created.projectId,
                irId: created.irId,
              },
              created.selection,
            );
        } finally {
          await c.close();
        }
      }
    },
    config.timeoutMs,
  );

  it(
    "rejects retired channels, projects Web settings, and resolves the business model",
    async () => {
      const c = await connectST();
      try {
        const created = await createProposal(c);
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
          "requirements-review-a",
          "requirements-review-b",
          "requirements-review-c",
          "solution",
          "solution-review-summary",
        ]);
        expect(workflowRoles).toEqual(expect.arrayContaining(Object.keys(bootstrap.prompts.saved)));
        const binding = requireConfig(
          created.remote.session?.modelConfig,
          "新建讨论必须提供实际 Agent 模型绑定",
        );
        expect(binding.role).toBe("requirements");
        // 业务配置键只对应 AIReq 目录；原生执行标识从 v4 快照读取，不解析 choice.id。
        const choice = bootstrap.models.choices.find((model) => model.id === binding.modelKey);
        expect(choice).toMatchObject({ name: binding.modelName });
        const modelView = await c.services.modelSelectionService.getView();
        expect(Number.isInteger(modelView.revision)).toBe(true);
        const native = await openNative(c, created.remote);
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
