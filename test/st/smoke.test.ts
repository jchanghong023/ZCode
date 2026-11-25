import { describe, expect, it } from "vitest";
import { AIREQ_CONTRACT_VERSION, IAIReqService } from "@zcode/services/aireq";
import { connectST, stFetch, unique, waitUntil, wsUrl } from "./client.js";
import { config } from "./config.js";

// 对接规格：contract-design / connection-identity；这些断言不依赖后端实现种类。
describe("ST service readiness and connection boundary", () => {
  it(
    "reads configs and the current workflow through the configured HTTP and binary RPC entry",
    async () => {
      const response = await stFetch("/api/v1/client/configs");
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const body = await response.json();
      expect(body).toMatchObject({ code: 0, data: { configs: expect.any(Object) } });
      const c = await connectST();
      try {
        const bootstrap = await c.bootstrap();
        expect(bootstrap.contractVersion).toBe(AIREQ_CONTRACT_VERSION);
        expect(bootstrap.backend.id).toEqual(expect.any(String));
        expect(bootstrap.backend.id.trim()).not.toBe("");
        expect(bootstrap.models.revision).toBeGreaterThanOrEqual(0);
        expect(bootstrap.models.choices).toEqual(expect.any(Array));
        const remote = await c.read();
        expect(bootstrap).not.toHaveProperty("initialSelection");
        for (const projectId of Object.keys(bootstrap.projects.workspaces)) {
          expect((await c.read({ projectId })).workspace).toEqual(
            bootstrap.projects.workspaces[projectId],
          );
        }
        expect(Object.keys(bootstrap.projects.workspaces).sort()).toEqual(
          remote.view.projects.map(({ id }) => id).sort(),
        );
        expect(bootstrap.projects).not.toHaveProperty("developmentRoots");
        for (const project of remote.view.projects) {
          expect(Object.keys(project).sort()).toEqual(
            [
              "id",
              "name",
              "revision",
              "defaultBranch",
              ...(project.repositoryUrl === undefined ? [] : ["repositoryUrl"]),
              ...(project.workDirectory === undefined ? [] : ["workDirectory"]),
            ].sort(),
          );
        }
        for (const field of [
          "currentProjectId",
          "repositoryHeads",
          "projectDocuments",
          "availableReleases",
          "version",
        ]) {
          expect(remote.view).not.toHaveProperty(field);
        }
        expect(remote.view).not.toHaveProperty("ompWebId");
        expect(remote.view).not.toHaveProperty("changes");
        expect(Number.isSafeInteger(remote.view.revision)).toBe(true);
        for (const sr of remote.view.srs) expect(sr).not.toHaveProperty("dependencySrIds");
        expect(remote.view).not.toHaveProperty("operations");
        expect(remote.view.projects).toEqual(expect.any(Array));
        expect(remote.view.releases).toEqual(expect.any(Array));
        expect(remote.workspace.identity.trim()).not.toBe("");
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "rejects a mismatched body identity, unknown paths, malformed tuples and extra RPC arguments",
    async () => {
      const c = await connectST();
      try {
        await expect(
          c.services.aiReqService.bootstrap({ ...c.identity, clientId: unique("wrong-client") }),
        ).rejects.toThrow();
        await expect(
          c.services.aiReqService.bootstrap({
            ...c.identity,
            employeeId: `${c.identity.employeeId[0] === "a" ? "b" : "a"}${c.identity.employeeId.slice(1)}`,
          }),
        ).rejects.toThrow();
        await expect(
          c.services.aiReqService.call(c.identity, "st.unknown-operation" as never, [] as never),
        ).rejects.toThrow();
        await expect(
          c.services.aiReqService.call(c.identity, "readWorkflow", [{}, "extra"] as never),
        ).rejects.toThrow();
        expect(
          await c.probeRpc("call", IAIReqService.channelName, "call", [
            c.identity,
            "readWorkflow",
            [{}],
            {},
          ]),
        ).toMatchObject({ code: "INVALID_ARGUMENT" });
        const retiredRead = [{ projectId: "p", irId: "ir" }];
        expect(
          await c.probeRpc("call", IAIReqService.channelName, "call", [
            c.identity,
            "readPrHandoff",
            retiredRead,
          ]),
        ).toMatchObject({ code: "UNKNOWN_PATH" });
        await expect(
          c.services.aiReqService.call(c.identity, "readPrHandoff" as never, retiredRead as never),
        ).rejects.toHaveProperty("message", "此操作不可用，请刷新页面后重试。");
        const { view: before } = await c.read();
        const revision = before.revision;
        // 使用仍合法的动作，保证拒绝来自非法导航目标，而非动作已经退役。
        const navigationTargetAction = {
          type: "saveDocumentFormats",
          operationId: unique("legacy-navigation"),
          documentFormats: before.documentFormats,
        };
        const navigationTargets = [
          { reviewAgent: "a" },
          { proposalStep: "requirements" },
          { discussionPhase: "solution" },
        ];
        const retiredTarget = { projectId: "p", irId: "ir" };
        const reviewAction = {
          type: "reviewDocuments",
          ...retiredTarget,
          operationId: unique("legacy-review"),
          agent: "requirements",
        };
        // 这些动作退役前均可以通过公开 wire 校验。
        const retiredActions = [
          { type: "publishProposal", candidate: "old" },
          { type: "closeProposalPr", candidate: "old" },
          { type: "acceptProposal", reviewId: "review", snapshotDigest: "digest" },
          {
            type: "confirmAlignment",
            perspective: "business",
            version: "1",
            reviewId: "review",
            snapshotDigest: "digest",
          },
          { type: "submitProposalReview", kind: "full", snapshotDigest: "digest" },
          { type: "returnProposal", reason: "old", target: "requirements" },
          { type: "createIdea", originalText: "Retired standalone idea" },
          { type: "importIdeas", originalTexts: ["Retired import"] },
          { type: "updateIdea", ideaId: "idea-id", ideaRevision: 1, originalText: "Retired edit" },
          {
            type: "transferIdea",
            ideaId: "idea-id",
            ideaRevision: 1,
            targets: [{ projectId: "p", releaseId: "r" }],
          },
        ];
        const legacyRequests = [
          ["readWorkflow", [{ discussionPhase: "review" }]],
          ["readWorkflow", [{ ...retiredTarget, srId: "sr" }]],
          ["readWorkflow", [{ proposalStep: "solution" }]],
          ["readWorkflow", [{ reviewAgent: "a" }]],
          ["readWorkflow", [{ materialPath: "requirements.md" }]],
          ["readWorkflow", [{ proposalDraftId: "local-draft" }]],
          ["validateDocumentVersion", [{ projectId: "p", irId: "ir", version: 1 }]],
          ["retrySession", [{ freeSessionId: "retired" }, "absent-session"]],
          ["retrySession", [{ ...retiredTarget, srId: "sr" }, "session"]],
          [
            "retryMaterial",
            [{ ...retiredTarget, releaseId: "r", path: "a.md", sha256: "a".repeat(64), round: 1 }],
          ],
          ["command", [navigationTargetAction, { ...retiredTarget, srId: "sr" }, revision]],
          ["command", [{ ...reviewAction, srId: "sr" }, retiredTarget, revision]],
          [
            "command",
            [{ ...navigationTargetAction, expectedRevision: revision }, {}, revision + 1],
          ],
          ...retiredActions.map((action) => [
            "command",
            [{ ...action, ...retiredTarget, operationId: unique() }, retiredTarget, revision],
          ]),
          [
            "command",
            [
              {
                type: "confirmDocumentVersion",
                projectId: "p",
                irId: "ir",
                operationId: unique(),
                version: 1,
              },
              {},
              revision,
            ],
          ],
          ["command", [{ ...reviewAction, agent: "review" }, {}, revision]],
          ...navigationTargets.map((target) => [
            "command",
            [navigationTargetAction, target, revision],
          ]),
        ];
        for (const [path, args] of legacyRequests) {
          await expect(
            c.services.aiReqService.call(c.identity, path as never, args as never),
          ).rejects.toThrow("操作参数无效，请检查输入并重试。");
        }
        // 拒绝后连接仍能读取正式契约，不以 socket open 代替 RPC 可用性。
        expect((await c.bootstrap()).contractVersion).toBe(AIREQ_CONTRACT_VERSION);
        const { view } = await c.read();
        expect(view.revision).toBe(revision);
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "rejects retired catalogue writes and legacy repository inputs without changing state",
    async () => {
      const c = await connectST();
      try {
        const before = await c.read();
        const projectId = unique("retired-project");
        const releaseId = unique("retired-release");
        const irId = unique("retired-ir");
        const { revision } = before.view;
        const rejected = "操作参数无效，请检查输入并重试。";
        // 用不存在的业务键探测 wire 拒绝，不把共享目录里的真实 IR 交给旧删除命令。
        for (const [action, target] of [
          [{ type: "createRelease", projectId, title: releaseId }, { projectId }],
          [{ type: "createProposal", projectId, releaseId, originalText: irId }, { projectId }],
          [
            { type: "deleteRequirement", projectId, irId },
            { projectId, irId },
          ],
        ]) {
          await expect(
            c.services.aiReqService.call(c.identity, "command", [
              { ...action, operationId: unique("retired-command") },
              target,
              revision,
            ] as never),
          ).rejects.toHaveProperty("message", rejected);
        }
        const repository = {
          repositoryUrl: config.repositoryUrl,
          defaultBranch: config.branch,
          workDirectory: `${config.workDirectoryRoot}/${projectId}`,
          expectedRevision: 0,
        };
        for (const legacy of [
          repository,
          { ...repository, name: projectId },
          { ...repository, projectId, name: projectId },
        ]) {
          await expect(
            c.services.aiReqService.call(c.identity, "projects.saveRepository", [
              { ...legacy, operationId: unique("retired-repository") },
            ] as never),
          ).rejects.toHaveProperty("message", rejected);
        }
        expect(await c.read()).toEqual(before);
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "rejects malformed connection identities before a WebSocket upgrade",
    async () => {
      const pageId = crypto.randomUUID();
      const healthy = await connectST(config.employeeId, unique("upgrade"), pageId);
      try {
        expect((await healthy.bootstrap()).contractVersion).toBe(AIREQ_CONTRACT_VERSION);
        const url = wsUrl(
          { employeeId: "INVALID", clientId: unique("invalid-upgrade") },
          config.token,
          pageId,
        );
        const outcome = await new Promise<"opened" | "rejected">((resolve, reject) => {
          const socket = new WebSocket(url);
          const timer = setTimeout(
            () => {
              socket.close();
              reject(new Error("ST连接身份拒绝超时"));
            },
            Math.min(config.timeoutMs, 10_000),
          );
          const finish = (value: "opened" | "rejected") => {
            clearTimeout(timer);
            socket.close();
            resolve(value);
          };
          socket.addEventListener("open", () => finish("opened"), { once: true });
          socket.addEventListener("error", () => finish("rejected"), { once: true });
          socket.addEventListener("close", () => finish("rejected"), { once: true });
        });
        expect(outcome).toBe("rejected");
      } finally {
        await healthy.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "settles a read already in flight when the client disconnects",
    async () => {
      const c = await connectST();
      let outcome: "pending" | "read" | "closed" = "pending";
      const read = c.read().then(
        () => {
          outcome = "read";
        },
        (error: unknown) => {
          expect(error).toBeInstanceOf(Error);
          outcome = "closed";
        },
      );
      try {
        await c.close();
        await waitUntil(
          "断开前读取已完成或被明确拒绝",
          async () => outcome,
          (value) => value !== "pending",
        );
        await read;
        expect(["read", "closed"]).toContain(outcome);
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );
});
