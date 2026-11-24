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
        const revision = (await c.read()).view.revision;
        const navigationTargetAction = {
          type: "createIdea",
          operationId: unique("legacy-navigation"),
          originalText: unique("rejected-idea"),
        };
        const navigationTargets = [
          { reviewAgent: "a" },
          { proposalStep: "requirements" },
          { discussionPhase: "solution" },
        ];
        const retiredTarget = { projectId: "p", irId: "ir" };
        // Each action below satisfied the public wire schema before it was retired.
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
          ["command", [{ ...navigationTargetAction, srId: "sr" }, {}, revision]],
          [
            "command",
            [
              {
                type: "createIdea",
                operationId: unique(),
                originalText: "invalid",
                expectedRevision: revision,
              },
              {},
              revision + 1,
            ],
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
          [
            "command",
            [
              {
                type: "reviewDocuments",
                projectId: "p",
                irId: "ir",
                operationId: unique(),
                agent: "review",
              },
              {},
              revision,
            ],
          ],
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
        expect(
          view.ideas.some(
            ({ originalText }) => originalText === navigationTargetAction.originalText,
          ),
        ).toBe(false);
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "rejects malformed connection identities before a WebSocket upgrade",
    async () => {
      const healthy = await connectST();
      try {
        expect((await healthy.bootstrap()).contractVersion).toBe(AIREQ_CONTRACT_VERSION);
        const url = wsUrl(
          { employeeId: "INVALID", clientId: unique("invalid-upgrade") },
          config.token,
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
