import { describe, expect, it } from "vitest";
import { appSettingsSchema } from "@zcode/shared";
import { connectST, unique } from "./client.js";
import { config, requireConfig } from "./config.js";
import { createProposal } from "./business.js";
import { openNative, requireAccepted } from "./native.js";

type STClient = Awaited<ReturnType<typeof connectST>>;

/** 通过正常设计、讨论、预览和保存准备文件，不访问任何服务端私有状态。 */
async function saveSkillFiles(c: STClient, goal: string, outputs: string) {
  const created = await createProposal(c);
  const session = requireConfig(created.remote.session, "公开提案必须提供原生会话引用");
  const workspacePath = requireConfig(created.remote.workspace.path, "公开提案必须提供工作区路径");
  const sessionId = await c.call("skillDesign.session", [created.projectId]);
  const identity = await c.call("skillDesign.workspaceIdentity", [created.projectId]);
  const draft = {
    goal,
    when: "检查业务文件及配套流程说明时使用。",
    inputs: "文件路径及字节范围。",
    outputs,
    boundaries: "只读，不删除或覆盖已有文件。",
    references: "文件接口契约。",
    example: "中文验收：偏移按字节而非字符计算。",
    notes: [],
  };
  await c.call("skillDesign.saveDraft", [sessionId, draft]);
  const prompt = await c.call("skillDesign.prompt", [sessionId, draft]);
  const native = await openNative(c, {
    ...created.remote,
    session: { ...session, sessionId },
    workspace: { ...created.remote.workspace, identity },
  });
  try {
    requireAccepted(await native.send("sendText", { text: prompt }));
    expect((await native.waitIdle()).control.phase).toBe("completedSuccess");
    const preview = requireConfig(
      await c.call("skillDesign.readPreview", [sessionId]),
      "技能讨论必须生成可保存的文件预览",
    );
    const main = requireConfig(
      preview.files.find((entry) => entry.path === "SKILL.md"),
      "技能预览必须包含 SKILL.md",
    );
    const receipt = await c.call("skillDesign.savePreview", [
      sessionId,
      workspacePath,
      preview.name,
      "project",
      preview.revision,
      unique("save-file"),
    ]);
    const slash = Math.max(receipt.path.lastIndexOf("/"), receipt.path.lastIndexOf("\\"));
    return {
      preview,
      main,
      receipt,
      directoryPath: receipt.path.slice(0, slash),
      workspaceIdentity: created.remote.workspace.identity,
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
      workspaceIdentity: saved.workspaceIdentity,
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
        expect(stat).toMatchObject({ path: file.path, type: "file", size: bytes.byteLength });
        expect((await service.stat({ path: file.directoryPath })).type).toBe("directory");
        expect(
          await service.checkFilesExist({
            paths: [file.path, file.directoryPath, file.missingPath],
          }),
        ).toEqual([
          { path: file.path, exists: true },
          { path: file.directoryPath, exists: true },
          { path: file.missingPath, exists: false },
        ]);
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
          workspaceIdentity: file.workspaceIdentity,
          query: name,
          limit: 1,
          refresh: true,
        });
        expect(matches.length).toBeLessThanOrEqual(1);
        expect(matches).toContainEqual(expect.objectContaining({ path: file.path, type: "file" }));
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
        const result = await c.services.fileService.readMediaPreview({
          path,
          maxBytes: expected.length + 1,
        });
        expect(result).toMatchObject({ path, mediaType, totalBytes: expected.length });
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
        const directories = await projectService.resolveSessionDirectories(ref);
        expect(directories).toMatchObject({
          workspacePath,
          workspaceIdentity: ref.workspaceIdentity,
          projectId: created.projectId,
        });
        expect(directories.additionalDirectories).toEqual(expect.any(Array));
        const tree = await projectService.readTree();
        expect(tree.projects).toContainEqual(expect.objectContaining({ id: created.projectId }));
        expect(new Set(tree.projects.map((project) => project.id)).size).toBe(tree.projects.length);
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
                version: 1,
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
    "reads complete settings, safe system fields, runtime agent capability and resolves the business model in native catalogs",
    async () => {
      const c = await connectST();
      try {
        // 本例只需要 subagents.list 的工作区目标；文件字节夹具与这些只读契约无关。
        // 从本例公开创建的业务对象取得目标，避免缺少 ST_FILE_JSON 时整例尚未请求就被阻塞。
        const created = await createProposal(c);
        const workspacePath = requireConfig(
          created.remote.workspace.path,
          "公开提案读取必须提供讨论 workspace.path",
        );
        const settings = await c.services.settingService.get();
        expect(appSettingsSchema.safeParse(settings).success).toBe(true);
        const system = await c.services.systemService.info();
        expect(Object.keys(system).sort()).toEqual(["homedir", "platform"]);
        expect(typeof system.homedir).toBe("string");
        expect(typeof system.platform).toBe("string");
        const agents = await c.services.subagentsService.list({
          workspacePath,
          workspaceIdentity: created.remote.workspace.identity,
        });
        expect(typeof agents.capability.userScopeAvailable).toBe("boolean");
        for (const directory of [agents.agents, agents.userAgents, agents.pluginAgents]) {
          expect(directory).toEqual(expect.any(Array));
          expect(new Set(directory.map((agent) => agent.id)).size).toBe(directory.length);
          for (const agent of directory) {
            expect(agent).toMatchObject({
              id: expect.any(String),
              name: expect.any(String),
              enabled: expect.any(Boolean),
            });
          }
        }
        const bootstrap = await c.bootstrap();
        const workflowRoles = bootstrap.models.settings.agents.map((agent) => agent.id).sort();
        expect(workflowRoles).toEqual([
          "progress-analysis",
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
        // 工作流 modelKey 与原生 providerId/modelId 是两套显式字段，不能解析 choice.id 猜测执行身份。
        // 用公开会话绑定关联配置选项及原生目录，展示名只核对展示名，不充当模型身份。
        const choice = bootstrap.models.choices.find((model) => model.id === binding.modelKey);
        expect(choice).toMatchObject({ name: binding.modelName });
        const modelView = await c.services.modelSelectionService.getView();
        expect(Number.isInteger(modelView.revision)).toBe(true);
        const provider = modelView.providers.find((item) => item.providerId === binding.providerId);
        expect(provider?.models).toContainEqual(
          expect.objectContaining({
            modelId: binding.modelId,
            config: expect.objectContaining({ enabled: true }),
          }),
        );
        const settingsView = await c.services.providerSettingsService.getView();
        const settingsProvider = settingsView.providers.find(
          (item) => item.providerId === binding.providerId,
        );
        expect(settingsProvider?.models).toContainEqual(
          expect.objectContaining({ modelId: binding.modelId, selectable: true, executable: true }),
        );
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );
});
