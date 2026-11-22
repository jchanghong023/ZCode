import { describe, expect, it, vi } from "vitest";
import type { IServiceAccessor } from "../../packages/services/src/index.js";
import {
  AIREQ_CONTRACT_VERSION,
  type AIReqIdentity,
  type AIReqRemoteBootstrap,
  type AIReqRemoteEvent,
  type AIReqRemoteWorkflow,
  type AIReqSelection,
  type AIReqWorkflowResult,
  type IAIReqService,
} from "../../packages/services/src/aireq/index.js";
import { createRemoteAIReqDataSource } from "../../packages/ui/src/aireq/shell/remote-data-source.js";

// Expectations follow connection-identity.md §4–5: explicit targets, invalidation,
// unsaved edits and disposal belong to the frontend independently of the backend.
const identity: AIReqIdentity = { employeeId: "a12345678", clientId: "browser-a" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function bootstrap(revision = 1): AIReqRemoteBootstrap {
  return {
    contractVersion: AIREQ_CONTRACT_VERSION,
    backend: { id: "backend-a" },
    capabilities: {
      workflowCommands: ["createIdea"],
      requirementManagement: true,
    },
    initialProjectId: "project-a",
    models: { choices: [], settings: { defaultModel: `model-${revision}`, agents: [] }, revision },
    prompts: {
      saved: { requirements: `saved-${revision}` },
      revision,
    },
    projects: { developmentRoots: { "project-a": "/project-a" } },
  };
}

function workflow(projectId: string, revision = 1): AIReqRemoteWorkflow {
  return {
    workspace: { identity: `workspace:${projectId}`, path: `/${projectId}`, kind: "reference" },
    view: {
      version: 1,
      revision,
      documentFormats: {
        "requirements.md": [],
        "proposal.md": [],
        "design.md": [],
        "tasks.md": [],
        "test-plan.md": [],
        "spec.md": [],
      },
      currentProjectId: projectId,
      ideas: [],
      availableReleases: [],
      projects: [],
      releases: [],
      groups: [],
      drafts: [],
      srs: [],
      materials: [],
      operations: [],
      sessions: [],
      running: [],
    },
  };
}

function requestedWorkflow(args: unknown[]) {
  return workflow((args[0] as AIReqSelection | undefined)?.projectId ?? "project-a");
}

function serviceDouble() {
  const listeners = new Set<(event: AIReqRemoteEvent) => void>();
  const metadata = { current: bootstrap() };
  const readBootstrap = vi.fn(async (_identity: AIReqIdentity) => metadata.current);
  const call = vi.fn(
    async (_identity: AIReqIdentity, path: string, args: unknown[]): Promise<unknown> => {
      if (path === "readWorkflow") return requestedWorkflow(args);
      return null;
    },
  );
  const service: IAIReqService = {
    bootstrap: readBootstrap,
    call: call as IAIReqService["call"],
    onDidChange: (listener) => {
      listeners.add(listener);
      return {
        dispose: () => {
          listeners.delete(listener);
        },
      };
    },
  };
  // This adapter only consumes aiReqService. Keep the substitute to that port;
  // other services are deliberately absent rather than simulated backend logic.
  const services = { aiReqService: service } as IServiceAccessor;
  return {
    metadata,
    readBootstrap,
    call,
    services,
    emit: (event: AIReqRemoteEvent) => {
      for (const listener of listeners) listener(event);
    },
    listenerCount: () => listeners.size,
  };
}

describe("AIReq frontend data source", () => {
  it("delivers presence without invalidating workflow or metadata and unsubscribes on disposal", async () => {
    const remote = serviceDouble();
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    const workflowChanged = vi.fn();
    const presenceChanged = vi.fn();
    source.subscribeWorkflow(workflowChanged);
    const stop = source.presence!.subscribe(presenceChanged);
    const baselineReads = remote.readBootstrap.mock.calls.length;
    const snapshot = {
      revision: 1,
      rows: [{ employeeId: identity.employeeId, ip: "192.0.2.1" }],
    };
    remote.emit({ type: "presence", snapshot });
    expect(presenceChanged).toHaveBeenCalledWith(snapshot);
    expect(workflowChanged).not.toHaveBeenCalled();
    expect(remote.readBootstrap).toHaveBeenCalledTimes(baselineReads);
    stop();
    remote.emit({ type: "presence", snapshot: { ...snapshot, revision: 2 } });
    expect(presenceChanged).toHaveBeenCalledTimes(1);
    source.presence!.subscribe(presenceChanged);
    await source.dispose();
    expect(remote.listenerCount()).toBe(0);
  });

  it("discards bootstrap invalidated during initialization and exposes fresh metadata and workspace", async () => {
    const remote = serviceDouble();
    const oldRead = deferred<AIReqRemoteBootstrap>();
    remote.readBootstrap.mockImplementationOnce(() => oldRead.promise);
    const creating = createRemoteAIReqDataSource(remote.services, identity);
    expect(remote.listenerCount()).toBe(1);
    remote.metadata.current = {
      ...bootstrap(2),
      projects: { developmentRoots: { "project-b": "/project-b" } },
    };
    remote.emit({ type: "models" });
    oldRead.resolve(bootstrap(1));
    const source = await creating;
    try {
      expect(source.models?.read().defaultModel).toBe("model-2");
      expect(source.prompts?.read().saved).toEqual({ requirements: "saved-2" });
      expect(source.resolveWorkspace(undefined, { projectId: "project-b" })).toEqual({
        identity: "workspace:project-b",
        path: "/project-b",
        kind: "reference",
      });
      expect(source.projects!.readDevelopmentRoot("project-a")).toBeUndefined();
      expect(source.projects!.readDevelopmentRoot("project-b")).toBe("/project-b");
      expect(remote.call.mock.calls.filter(([, path]) => path === "command")).toEqual([]);
    } finally {
      await source.dispose();
    }
  });

  it("releases the event subscription when bootstrap fails", async () => {
    const remote = serviceDouble();
    const failure = new Error("service unavailable");
    remote.readBootstrap.mockRejectedValueOnce(failure);
    await expect(createRemoteAIReqDataSource(remote.services, identity)).rejects.toBe(failure);
    expect(remote.listenerCount()).toBe(0);
  });

  it("refuses an incompatible contract without leaving a subscribed source", async () => {
    const remote = serviceDouble();
    remote.metadata.current = {
      ...bootstrap(),
      contractVersion: 999 as typeof AIREQ_CONTRACT_VERSION,
    };
    await expect(createRemoteAIReqDataSource(remote.services, identity)).rejects.toThrow(
      "版本不兼容",
    );
    expect(remote.listenerCount()).toBe(0);
    expect(remote.call).not.toHaveBeenCalled();
  });

  it("reads the requested project and saves shared models without a project argument", async () => {
    const remote = serviceDouble();
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    try {
      const target = { projectId: "project-b", irId: "ir-b", formalView: "detail" as const };
      const view = await source.readWorkflow(target);
      expect(view.currentProjectId).toBe("project-b");
      expect(source.resolveWorkspace(view, target).identity).toBe("workspace:project-b");
      await source.models!.save({ defaultModel: "model-new", agents: [] }, 1);
      const save = remote.call.mock.calls.find(([, path]) => path === "models.save");
      expect(save).toEqual([
        identity,
        "models.save",
        [{ defaultModel: "model-new", agents: [] }, 1],
      ]);
    } finally {
      await source.dispose();
    }
  });

  it("keeps explicit retry identity and original expected revision instead of allocating a new operation", async () => {
    const remote = serviceDouble();
    const receipt: AIReqWorkflowResult = {
      projectId: "project-a",
      ideaId: "idea-8",
      receipt: {
        operationId: "create-idea-1",
        type: "createIdea",
        status: "completed",
        startedAt: "2026-11-17T00:00:00Z",
        revision: 8,
        steps: [],
      },
    };
    remote.call.mockImplementation(async (_identity, path, args) =>
      path === "command" ? receipt : requestedWorkflow(args),
    );
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    try {
      const action = {
        type: "createIdea" as const,
        originalText: "Export reports",
        operationId: "create-idea-1",
        expectedRevision: 7,
      };
      const target = { projectId: "project-a" };
      expect(await source.command(action, target, 7)).toEqual(receipt);
      expect(await source.command(action, target, 20)).toEqual(receipt);
      expect(
        remote.call.mock.calls
          .filter(([, path]) => path === "command")
          .map(([, , args]) => args[0]),
      ).toEqual([action, action]);
      expect(action).toEqual({
        type: "createIdea",
        originalText: "Export reports",
        operationId: "create-idea-1",
        expectedRevision: 7,
      });
    } finally {
      await source.dispose();
    }
  });

  it("assigns an operation identity and current revision to a new user action without mutating it", async () => {
    const remote = serviceDouble();
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    try {
      const action = { type: "createIdea" as const, originalText: "Export reports" };
      await source.command(action, { projectId: "project-b" }, 31);
      const command = remote.call.mock.calls.find(([, path]) => path === "command");
      expect(command).toEqual([
        identity,
        "command",
        [
          { ...action, operationId: expect.any(String), expectedRevision: 31 },
          { projectId: "project-b" },
          31,
        ],
      ]);
      expect((command![2][0] as { operationId: string }).operationId.trim()).not.toBe("");
      expect(action).toEqual({ type: "createIdea", originalText: "Export reports" });
    } finally {
      await source.dispose();
    }
  });

  it("refreshes shared settings without replacing the user's unsaved prompt", async () => {
    const remote = serviceDouble();
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    try {
      source.prompts!.updateDraft({ requirements: "my unsaved instructions" });
      remote.metadata.current = bootstrap(2);
      await source.refreshIdentity!();
      expect(source.prompts!.read()).toEqual({
        saved: { requirements: "saved-2" },
        draft: { requirements: "my unsaved instructions" },
        revision: 2,
      });
    } finally {
      await source.dispose();
    }
  });

  it("a save acknowledgement cannot erase edits made while that save was pending", async () => {
    const remote = serviceDouble();
    const save = deferred<unknown>();
    remote.call.mockImplementation(async (_identity, path, args) =>
      path === "prompts.save" ? save.promise : requestedWorkflow(args),
    );
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    try {
      source.prompts!.updateDraft({ requirements: "submitted" });
      const pending = source.prompts!.save({ requirements: "submitted" }, 1);
      source.prompts!.updateDraft({ requirements: "newer edit" });
      remote.metadata.current = {
        ...bootstrap(2),
        prompts: {
          saved: { requirements: "submitted" },
          revision: 2,
        },
      };
      save.resolve(null);
      await pending;
      expect(source.prompts!.read()).toEqual({
        saved: { requirements: "submitted" },
        draft: { requirements: "newer edit" },
        revision: 2,
      });
    } finally {
      await source.dispose();
    }
  });

  it("disposing during a refresh prevents late settings from becoming visible or notifying subscribers", async () => {
    const remote = serviceDouble();
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    const refresh = deferred<AIReqRemoteBootstrap>();
    remote.readBootstrap.mockImplementationOnce(() => refresh.promise);
    const changed = vi.fn();
    source.subscribeWorkflow(changed);
    const pending = source.refreshIdentity!();
    const rejected = expect(pending).rejects.toThrow("连接已关闭");
    await source.dispose();
    refresh.resolve(bootstrap(2));
    await rejected;
    expect(source.models!.read().defaultModel).toBe("model-1");
    expect(changed).not.toHaveBeenCalled();
    expect(remote.listenerCount()).toBe(0);
    remote.emit({ type: "workflow" });
    const callsBeforeWrite = remote.call.mock.calls.length;
    await expect(
      source.command({ type: "createIdea", originalText: "must not send" }, {}, 1),
    ).rejects.toThrow("连接已关闭");
    expect(remote.call.mock.calls).toHaveLength(callsBeforeWrite);
  });
});
