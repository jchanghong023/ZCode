import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CommandAck,
  CommandEnvelope,
} from "../../packages/shared/src/zcode-protocol-v4/index.js";
import {
  PendingCommandRegistry,
  PENDING_COMMAND_TTL_MS,
} from "../../packages/ui/src/v4/pendingCommandRegistry.js";
import { pendingCommandReplayFor } from "../../packages/ui/src/v4/pendingCommandReplay.js";
import {
  ensurePendingTaskDraft,
  persistV4ComposerDraft,
  readPendingTaskDraft,
  readV4ComposerDraft,
  V4_DRAFT_SCOPE_ROOT,
  type ComposerScope,
} from "../../packages/ui/src/v4/composer/composerDraftStore.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const scope: ComposerScope = {
  clientNamespace: "employee-a:browser-a",
  hostId: "host-a",
  projectId: "project-a",
};
const workspace = { workspacePath: "/requirements", workspaceIdentity: "workspace-a" };
function command(commandId = "message-a", sessionId = "session-a"): CommandEnvelope {
  return {
    commandId,
    sessionId,
    clientId: "browser-a",
    type: "sendText",
    payload: { text: "请补充验收标准", attachments: [] },
    issuedAt: 1_700_000_000_000,
    baseRevision: 4,
  };
}
function ack(envelope: CommandEnvelope, status: CommandAck["status"]): CommandAck {
  return {
    commandId: envelope.commandId,
    status,
    revisionAtDecision: 5,
    ...(status === "rejected" ? { reasonCode: "guard.readOnly" } : {}),
  };
}

// 规则依据：conversation.md 的回执不明保留输入、显式重试及迟到结果；
// command.ts 的 queryUnavailable 契约；TTL 仅是客户端恢复线索的保留期。
describe("frontend pending message recovery", () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("retains the original submitted payload when the editor changes its object later", () => {
    const envelope = command();
    const payload = { text: "已发送正文", attachments: [{ ref: "attachment-a" }] };
    envelope.payload = payload;
    const replay = pendingCommandReplayFor(envelope);
    payload.text = "正在编辑的新正文";
    payload.attachments[0]!.ref = "attachment-b";
    expect(replay).toEqual({
      kind: "input",
      type: "sendText",
      payload: { text: "已发送正文", attachments: [{ ref: "attachment-a" }] },
      baseRevision: 4,
    });
  });

  it.each(["unknown", "unavailable"] as const)(
    "%s command query keeps recovery identity and does not report rejection or replay",
    async (queryState) => {
      const envelope = command();
      const registry = new PendingCommandRegistry({ storage });
      registry.record(envelope, { workspace });
      const resolution = vi.fn();
      registry.subscribeResolution(envelope.commandId, resolution);
      const query = vi.fn(async () => ({
        results: [
          {
            key: { sessionId: envelope.sessionId, commandId: envelope.commandId },
            result:
              queryState === "unknown"
                ? ("unknown" as const)
                : {
                    ...ack(envelope, "failed"),
                    reasonCode: "fault.command.queryUnavailable",
                  },
          },
        ],
      }));
      await registry.reconcileSession(envelope.sessionId, query, "workspace-a");
      expect(query).toHaveBeenCalledWith({
        commands: [{ sessionId: "session-a", commandId: "message-a" }],
      });
      expect(registry.list("session-a")).toMatchObject([
        {
          commandId: "message-a",
          replay: {
            kind: "input",
            payload: { text: "请补充验收标准" },
          },
        },
      ]);
      expect(registry.listRecoverable("session-a")).toEqual([]);
      expect(resolution).not.toHaveBeenCalled();
      registry.applyAck(envelope, ack(envelope, "accepted"));
      expect(resolution).toHaveBeenCalledExactlyOnceWith("accepted");
    },
  );

  it("keeps the original expiry after reload and repeated reconciliation", async () => {
    let now = 10_000;
    const envelope = command();
    const first = new PendingCommandRegistry({ storage, now: () => now });
    first.record(envelope, { workspace });
    now += PENDING_COMMAND_TTL_MS - 1;
    const reloaded = new PendingCommandRegistry({ storage, now: () => now });
    await reloaded.reconcileSession("session-a", async () => ({
      results: [
        {
          key: { sessionId: "session-a", commandId: "message-a" },
          result: "unknown",
        },
      ],
    }));
    expect(reloaded.list("session-a").map((entry) => entry.commandId)).toEqual(["message-a"]);
    now++;
    expect(reloaded.list("session-a")).toEqual([]);
    expect(new PendingCommandRegistry({ storage, now: () => now }).list("session-a")).toEqual([]);
  });

  it("reconciles only commands belonging to the requested workspace", async () => {
    const registry = new PendingCommandRegistry({ storage });
    registry.record(command("a"), { workspace });
    registry.record(command("b"), {
      workspace: { ...workspace, workspaceIdentity: "workspace-b" },
    });
    const query = vi.fn(async () => ({
      results: [
        {
          key: { sessionId: "session-a", commandId: "a" },
          result: "unknown" as const,
        },
      ],
    }));
    await registry.reconcileSession("session-a", query, "workspace-a");
    expect(query).toHaveBeenCalledExactlyOnceWith({
      commands: [{ sessionId: "session-a", commandId: "a" }],
    });
    expect(registry.list("session-a").map((entry) => entry.commandId)).toEqual(["a", "b"]);
  });

  function recordDraft(registry: PendingCommandRegistry, envelope: CommandEnvelope) {
    const pending = ensurePendingTaskDraft(scope);
    persistV4ComposerDraft(
      workspace.workspacePath,
      workspace.workspaceIdentity,
      V4_DRAFT_SCOPE_ROOT,
      { text: "请补充验收标准" },
      scope,
    );
    registry.record(envelope, {
      workspace,
      composer: {
        scope,
        draftId: pending.draftId,
        submittedText: "请补充验收标准",
        order: 1,
        selection: {
          modelSelection: { providerId: "provider-a", modelId: "model-a" },
          mode: "build",
        },
      },
    });
    return pending;
  }

  it("a rejected submission preserves its input and releases it for explicit retry", () => {
    const registry = new PendingCommandRegistry({ storage });
    const envelope = command();
    const pending = recordDraft(registry, envelope);
    const resolution = vi.fn();
    registry.subscribeResolution(envelope.commandId, resolution);
    registry.applyAck(envelope, ack(envelope, "rejected"));
    expect(
      readV4ComposerDraft(
        workspace.workspacePath,
        workspace.workspaceIdentity,
        V4_DRAFT_SCOPE_ROOT,
        scope,
      )?.text,
    ).toBe("请补充验收标准");
    expect(readPendingTaskDraft(scope)).toEqual({ draftId: pending.draftId });
    expect(registry.list("session-a")).toEqual([]);
    expect(resolution).toHaveBeenCalledExactlyOnceWith("failed");
  });

  it("an accepted submission clears its matching original input", () => {
    const registry = new PendingCommandRegistry({ storage });
    const envelope = command();
    recordDraft(registry, envelope);
    registry.applyAck(envelope, ack(envelope, "accepted"));
    expect(
      readV4ComposerDraft(
        workspace.workspacePath,
        workspace.workspaceIdentity,
        V4_DRAFT_SCOPE_ROOT,
        scope,
      ),
    ).toBeNull();
    expect(readPendingTaskDraft(scope)).toBeNull();
    expect(registry.listRecoverable("session-a")).toEqual([]);
  });

  it("a delayed accepted receipt preserves text edited after submission", () => {
    const registry = new PendingCommandRegistry({ storage });
    const envelope = command();
    recordDraft(registry, envelope);
    persistV4ComposerDraft(
      workspace.workspacePath,
      workspace.workspaceIdentity,
      V4_DRAFT_SCOPE_ROOT,
      { text: "用户随后输入的新问题" },
      scope,
    );
    registry.applyAck(envelope, ack(envelope, "accepted"));
    expect(
      readV4ComposerDraft(workspace.workspacePath, workspace.workspaceIdentity, "session-a", scope)
        ?.text,
    ).toBe("用户随后输入的新问题");
    expect(
      readV4ComposerDraft(
        workspace.workspacePath,
        workspace.workspaceIdentity,
        V4_DRAFT_SCOPE_ROOT,
        scope,
      ),
    ).toBeNull();
  });

  it("a delayed receipt for an older draft cannot clear a replacement draft", () => {
    const registry = new PendingCommandRegistry({ storage });
    const envelope = command();
    recordDraft(registry, envelope);
    // The original pending task is completed through its public lifecycle before a new draft starts.
    registry.applyAck(envelope, ack(envelope, "accepted"));
    const replacement = ensurePendingTaskDraft(scope);
    persistV4ComposerDraft(
      workspace.workspacePath,
      workspace.workspaceIdentity,
      V4_DRAFT_SCOPE_ROOT,
      { text: "另一份尚未发送的草稿" },
      scope,
    );
    registry.applyAck(envelope, ack(envelope, "duplicate"));
    expect(readPendingTaskDraft(scope)?.draftId).toBe(replacement.draftId);
    expect(
      readV4ComposerDraft(
        workspace.workspacePath,
        workspace.workspaceIdentity,
        V4_DRAFT_SCOPE_ROOT,
        scope,
      )?.text,
    ).toBe("另一份尚未发送的草稿");
  });
});
