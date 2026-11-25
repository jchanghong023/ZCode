import { describe, expect, it, vi } from "vitest";
import type { IServiceAccessor } from "../../packages/services/src/index.js";
import {
  AIREQ_CONTRACT_VERSION,
  AIREQ_ROLE_ADMINISTRATOR,
  type AIReqAgentModelSettings,
  type AIReqIdentity,
  type AIReqRemoteBootstrap,
  type AIReqRemoteEvent,
  type AIReqRemoteWorkflow,
  type AIReqWorkflowResult,
  type AIReqWorkflowTarget,
  type IAIReqService,
} from "../../packages/services/src/aireq/index.js";
import type { AIReqSelection } from "../../packages/ui/src/aireq/contract.js";
import { createRemoteAIReqDataSource } from "../../packages/ui/src/aireq/shell/remote-data-source.js";

// Expectations follow connection-identity.md §4–5: explicit targets, invalidation,
// unsaved edits and disposal belong to the frontend independently of the backend.
const identity: AIReqIdentity = { employeeId: "a12345678", clientId: "browser-a" };
const admin = { ...identity, employeeId: AIREQ_ROLE_ADMINISTRATOR };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function workspace(projectId: string): AIReqRemoteWorkflow["workspace"] {
  return { identity: `workspace:${projectId}`, path: `/${projectId}`, kind: "proposal" };
}

function bootstrap(revision = 1): AIReqRemoteBootstrap {
  return {
    contractVersion: AIREQ_CONTRACT_VERSION,
    backend: { id: "backend-a" },
    capabilities: {
      workflowCommands: ["addProjectRoleMember"],
    },
    initialProjectId: "project-a",
    models: { choices: [], settings: { defaultModel: `model-${revision}`, agents: [] }, revision },
    prompts: {
      saved: { requirements: `saved-${revision}` },
      revision,
    },
    projects: { workspaces: { "project-a": workspace("project-a") } },
  };
}

function workflow(projectId: string, revision = 1): AIReqRemoteWorkflow {
  return {
    workspace: workspace(projectId),
    view: {
      revision,
      documentFormats: {
        "requirements.md": [],
        "proposal.md": [],
        "design.md": [],
        "tasks.md": [],
        "test-plan.md": [],
        "spec.md": [],
      },
      projectRoleMembers: [],
      projects: [],
      releases: [],
      requirements: [],
      srs: [],
      materials: [],
    },
  };
}

function requestedWorkflow(args: unknown[], revision = 1) {
  return workflow((args[0] as AIReqWorkflowTarget | undefined)?.projectId ?? "project-a", revision);
}

function addTestingMember(projectId: string) {
  return {
    type: "addProjectRoleMember",
    projectId,
    employeeId: "b12345678",
    role: "testing",
  } as const;
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
      projects: { workspaces: { "project-b": workspace("project-b") } },
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
        kind: "proposal",
      });
      expect(source.projects!.readDevelopmentRoot("project-a")).toBeUndefined();
      expect(source.projects!.readDevelopmentRoot("project-b")).toBe("/project-b");
      expect(remote.readBootstrap).toHaveBeenCalledTimes(2);
      expect(remote.call).not.toHaveBeenCalled();
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

  it("keeps local SR selection while reading and retrying its IR-level Agent session", async () => {
    const remote = serviceDouble();
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    try {
      const sessionTarget = {
        projectId: "project-b",
        irId: "ir-b",
        discussionPhase: "solution",
      } as const;
      const target: AIReqSelection = { ...sessionTarget, srId: "sr-b" };
      const view = await source.readWorkflow(target);
      expect(remote.call).toHaveBeenCalledWith(identity, "readWorkflow", [sessionTarget]);
      expect(source.resolveWorkspace(view, target).identity).toBe("workspace:project-b");
      await source.retrySession(target, "session-b");
      expect(remote.call).toHaveBeenCalledWith(identity, "retrySession", [
        sessionTarget,
        "session-b",
      ]);
      expect(target).toEqual({ ...sessionTarget, srId: "sr-b" });
    } finally {
      await source.dispose();
    }
  });

  it("sends only role configuration when saving models while preserving the read DTO", async () => {
    const remote = serviceDouble();
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    try {
      const settings: AIReqAgentModelSettings = {
        defaultModel: "model-new",
        agents: [
          {
            id: "requirements",
            name: "需求",
            nameEn: "Requirements",
            description: "编写需求",
            descriptionEn: "Write requirements",
            model: "inherit",
            reasoning: "high",
          },
        ],
      };
      const metadata = bootstrap(2);
      remote.metadata.current = { ...metadata, models: { ...metadata.models, settings } };

      await source.models!.save(settings, 1);
      expect(remote.call.mock.calls.find(([, path]) => path === "models.save")).toStrictEqual([
        identity,
        "models.save",
        [
          {
            defaultModel: "model-new",
            agents: [{ id: "requirements", model: "inherit", reasoning: "high" }],
          },
          1,
        ],
      ]);
      expect(source.models!.read()).toStrictEqual(settings);
    } finally {
      await source.dispose();
    }
  });

  it("requires a fresh workspace read when switching requirements or projects", async () => {
    const remote = serviceDouble();
    remote.metadata.current.projects.workspaces["project-b"] = workspace("project-b");
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    const first = { projectId: "project-a", irId: "ir-1" };
    const second = { ...first, irId: "ir-2" };
    const otherProject = { ...second, projectId: "project-b" };
    const unavailable = { identity: `aireq-remote:${identity.clientId}`, kind: "unavailable" };
    try {
      const firstView = await source.readWorkflow(first);
      expect(source.resolveWorkspace(firstView, first)).toEqual(workspace("project-a"));
      expect(source.resolveWorkspace(firstView, second)).toEqual(unavailable);

      const secondView = await source.readWorkflow(second);
      expect(source.resolveWorkspace(secondView, second)).toEqual(workspace("project-a"));
      expect(source.resolveWorkspace(secondView, otherProject)).toEqual(unavailable);

      const otherView = await source.readWorkflow(otherProject);
      expect(source.resolveWorkspace(otherView, otherProject)).toEqual(workspace("project-b"));
    } finally {
      await source.dispose();
    }
  });

  it("reads the committed catalogue for notifications and project switches without holding an older read", async () => {
    const remote = serviceDouble();
    const oldWorkflow = deferred<AIReqRemoteWorkflow>();
    const wireRefresh = deferred<AIReqRemoteWorkflow>();
    const refreshStarted = deferred<void>();
    const notified = deferred<AIReqRemoteWorkflow["view"]>();
    const original = { projectId: "project-a" };
    const other = { projectId: "project-b" };
    let selected = original;
    let catalogueRevision = 1;
    remote.call.mockImplementation(async (_identity, path, args) => {
      if (path === "projects.refreshSnapshot") {
        refreshStarted.resolve();
        return wireRefresh.promise;
      }
      const { projectId } = args[0] as AIReqWorkflowTarget;
      return projectId === original.projectId
        ? oldWorkflow.promise
        : requestedWorkflow(args, catalogueRevision);
    });
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    const stop = source.subscribeWorkflow(() => {
      void source.readWorkflow(selected).then(notified.resolve, notified.reject);
    });
    try {
      const oldRead = source.readWorkflow(original);
      const refresh = source.refreshProjects(original);
      await refreshStarted.promise;
      remote.emit({ type: "workflow" });
      selected = other;
      const switched = source.readWorkflow(other);

      oldWorkflow.resolve(workflow(original.projectId));
      expect((await oldRead).revision).toBe(1);
      expect(remote.readBootstrap).toHaveBeenCalledTimes(1);
      expect(remote.call.mock.calls.filter(([, path]) => path === "readWorkflow")).toHaveLength(1);

      catalogueRevision = 2;
      remote.metadata.current = {
        ...bootstrap(2),
        projects: { workspaces: { [other.projectId]: workspace(other.projectId) } },
      };
      wireRefresh.resolve(workflow(original.projectId, catalogueRevision));
      const [refreshView, switchedView, notifiedView] = await Promise.all([
        refresh,
        switched,
        notified.promise,
      ]);
      expect(refreshView.revision).toBe(2);
      for (const view of [switchedView, notifiedView]) {
        expect(view.revision).toBe(2);
        expect(source.resolveWorkspace(view, other)).toEqual(workspace(other.projectId));
      }
      expect(source.projects!.readDevelopmentRoot(other.projectId)).toBe("/project-b");
      expect(
        remote.call.mock.calls.filter(([, path]) => path === "projects.refreshSnapshot"),
      ).toHaveLength(1);
    } finally {
      stop();
      await source.dispose();
    }
  });

  it("keeps ordinary reads on the previous catalogue when the explicit refresh is rejected", async () => {
    const remote = serviceDouble();
    const wireRefresh = deferred<AIReqRemoteWorkflow>();
    const refreshStarted = deferred<void>();
    remote.call.mockImplementation(async (_identity, path, args) => {
      if (path === "projects.refreshSnapshot") {
        refreshStarted.resolve();
        return wireRefresh.promise;
      }
      return requestedWorkflow(args);
    });
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    try {
      const failure = new Error("cloud catalogue unavailable");
      const rejected = expect(source.refreshProjects({ projectId: "project-a" })).rejects.toBe(
        failure,
      );
      await refreshStarted.promise;
      const switched = source.readWorkflow({ projectId: "project-b" });
      expect(remote.call.mock.calls.filter(([, path]) => path === "readWorkflow")).toHaveLength(0);
      wireRefresh.reject(failure);
      await rejected;
      expect((await switched).revision).toBe(1);
      expect(source.projects!.readDevelopmentRoot("project-a")).toBe("/project-a");
    } finally {
      await source.dispose();
    }
  });

  it("reports a committed refresh with failed metadata and retries reads without resending the write", async () => {
    const remote = serviceDouble();
    const wireRefresh = deferred<AIReqRemoteWorkflow>();
    const metadataRead = deferred<AIReqRemoteBootstrap>();
    const metadataStarted = deferred<void>();
    const target = { projectId: "project-a" };
    let catalogueRevision = 1;
    remote.call.mockImplementation(async (_identity, path, args) =>
      path === "projects.refreshSnapshot"
        ? wireRefresh.promise
        : requestedWorkflow(args, catalogueRevision),
    );
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    try {
      const oldView = await source.readWorkflow(target);
      remote.readBootstrap.mockImplementationOnce(() => {
        metadataStarted.resolve();
        return metadataRead.promise;
      });
      const failure = new Error("bootstrap unavailable");
      const metadataFailure = {
        message: "项目目录已刷新，但页面配置读取失败，请重试读取。",
        code: "BUSINESS_RULE_VIOLATION",
        cause: failure,
      };
      const refreshing = expect(source.refreshProjects(target)).rejects.toMatchObject(
        metadataFailure,
      );
      catalogueRevision = 2;
      wireRefresh.resolve(workflow(target.projectId, catalogueRevision));
      await metadataStarted.promise;
      const switched = expect(
        source.readWorkflow({ projectId: "project-b" }),
      ).rejects.toMatchObject(metadataFailure);
      metadataRead.reject(failure);
      await Promise.all([refreshing, switched]);
      expect(oldView.revision).toBe(1);
      expect(source.projects!.readDevelopmentRoot("project-a")).toBe("/project-a");
      expect(remote.call.mock.calls.filter(([, path]) => path === "readWorkflow")).toHaveLength(1);

      remote.metadata.current = {
        ...bootstrap(2),
        projects: { workspaces: { "project-b": workspace("project-b") } },
      };
      const retried = await source.readWorkflow({ projectId: "project-b" });
      expect(retried.revision).toBe(2);
      expect(source.projects!.readDevelopmentRoot("project-b")).toBe("/project-b");
      expect(source.projects!.readDevelopmentRoot("project-a")).toBeUndefined();
      expect(
        remote.call.mock.calls.filter(([, path]) => path === "projects.refreshSnapshot"),
      ).toHaveLength(1);
    } finally {
      await source.dispose();
    }
  });

  it("keeps the command target, operation ID and CAS baseline when only navigation changes", async () => {
    const remote = serviceDouble();
    const receipt: AIReqWorkflowResult = {
      projectId: "project-a",
      receipt: {
        operationId: "add-testing-member-1",
        actorEmployeeId: admin.employeeId,
        type: "addProjectRoleMember",
        status: "completed",
        startedAt: "2026-11-17T00:00:00Z",
        revision: 8,
      },
    };
    remote.call.mockImplementation(async (_identity, path, args) =>
      path === "command" ? receipt : requestedWorkflow(args),
    );
    const source = await createRemoteAIReqDataSource(remote.services, admin);
    try {
      const action = {
        ...addTestingMember("project-a"),
        operationId: "add-testing-member-1",
        expectedRevision: 7,
      };
      const ids = { projectId: "project-a", irId: "ir-a" };
      const target: AIReqSelection = {
        ...ids,
        srId: "sr-a",
        discussionPhase: "requirements",
      };
      expect(await source.command(action, target, 7)).toEqual(receipt);
      expect(
        await source.command(
          action,
          {
            ...target,
            discussionPhase: "solution",
          },
          20,
        ),
      ).toEqual(receipt);
      expect(
        remote.call.mock.calls.filter(([, path]) => path === "command").map(([, , args]) => args),
      ).toStrictEqual(
        Array.from({ length: 2 }, () => [
          {
            ...addTestingMember("project-a"),
            operationId: "add-testing-member-1",
          },
          ids,
          7,
        ]),
      );
      expect(action).toEqual({
        ...addTestingMember("project-a"),
        operationId: "add-testing-member-1",
        expectedRevision: 7,
      });
    } finally {
      await source.dispose();
    }
  });

  it("assigns an operation identity and current revision to a new user action without mutating it", async () => {
    const remote = serviceDouble();
    const source = await createRemoteAIReqDataSource(remote.services, admin);
    try {
      const action = addTestingMember("project-b");
      await source.command(action, { projectId: "project-b" }, 31);
      const command = remote.call.mock.calls.find(([, path]) => path === "command");
      expect(command).toEqual([
        admin,
        "command",
        [{ ...action, operationId: expect.any(String) }, { projectId: "project-b" }, 31],
      ]);
      expect((command![2][0] as { operationId: string }).operationId.trim()).not.toBe("");
      expect(action).toEqual(addTestingMember("project-b"));
    } finally {
      await source.dispose();
    }
  });

  it("refreshes shared settings and project workspaces without workflow fan-out or losing a draft", async () => {
    const remote = serviceDouble();
    const source = await createRemoteAIReqDataSource(remote.services, identity);
    try {
      source.prompts!.updateDraft({ requirements: "my unsaved instructions" });
      remote.metadata.current = {
        ...bootstrap(2),
        projects: { workspaces: { "project-b": workspace("project-b") } },
      };
      const invalidated = new Promise<void>((resolve) => source.subscribeWorkflow(resolve));
      remote.emit({ type: "workflow" });
      await invalidated;
      expect(source.resolveWorkspace(undefined, { projectId: "project-b" })).toEqual(
        workspace("project-b"),
      );
      expect(source.resolveWorkspace(undefined, { projectId: "project-a" }).kind).toBe(
        "unavailable",
      );
      expect(remote.call).not.toHaveBeenCalled();
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
      source.command(addTestingMember("project-a"), { projectId: "project-a" }, 1),
    ).rejects.toThrow("连接已关闭");
    expect(remote.call.mock.calls).toHaveLength(callsBeforeWrite);
  });
});
