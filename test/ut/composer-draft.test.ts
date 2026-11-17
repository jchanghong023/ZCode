import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearV4ComposerDraft,
  clearV4ComposerDraftTaskGroup,
  getV4ComposerDraftStorageKey,
  persistV4ComposerDraft,
  readV4ComposerDraft,
  V4_DRAFT_SCOPE_ROOT,
  type ComposerScope,
} from "../../packages/ui/src/v4/composer/composerDraftStore.js";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    if (this.failWrites) throw new Error("Storage quota exhausted");
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("Storage quota exhausted");
    this.values.set(key, value);
  }
}

// conversation.md：私有草稿不跨身份接管，编辑与导航不得清空其他草稿。
// 只替换浏览器存储端口，不替换被测 store，也不创建原型服务。
describe("composer draft persistence", () => {
  let storage: MemoryStorage;
  const path = "/projects/requirements";
  const identity = "workspace-a";
  const scope: ComposerScope = {
    clientNamespace: "j00000001:client-1",
    hostId: "workspace-a",
    projectId: "project-a",
  };

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores the unsent text and composer choices through the public read API", () => {
    const draft = {
      text: "补充需求：保留换行\n和中文内容",
      editorStateJson: '{"root":{"children":[]}}',
      mode: "build" as const,
      planEnabled: true,
      modelSelection: { providerId: "provider-a", modelId: "model-a" },
      projectId: "project-a",
      taskGroupId: "group-a",
    };
    expect(persistV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, draft, scope)).toBe(true);
    expect(readV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, scope)).toMatchObject(draft);
  });

  it("isolates private drafts by client namespace and project on the same directory", () => {
    const alternatives: ComposerScope[] = [
      { ...scope, clientNamespace: "j00000002:client-1" },
      { ...scope, clientNamespace: "j00000001:client-2" },
      { ...scope, projectId: "project-b" },
      { ...scope, hostId: "workspace-b" },
    ];
    persistV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, { text: "我的草稿" }, scope);
    for (const other of alternatives) {
      expect(readV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, other)).toBeNull();
      persistV4ComposerDraft(
        path,
        identity,
        V4_DRAFT_SCOPE_ROOT,
        { text: other.clientNamespace + other.projectId + other.hostId },
        other,
      );
    }
    expect(readV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, scope)?.text).toBe("我的草稿");
  });

  it("isolates session drafts by workspace identity and session, even when paths are equal", () => {
    persistV4ComposerDraft(path, identity, "session-a", { text: "会话 A" });
    persistV4ComposerDraft(path, identity, "session-b", { text: "会话 B" });
    persistV4ComposerDraft(path, "workspace-b", "session-a", { text: "另一工作区" });
    expect(readV4ComposerDraft(path, identity, "session-a")?.text).toBe("会话 A");
    expect(readV4ComposerDraft(path, identity, "session-b")?.text).toBe("会话 B");
    expect(readV4ComposerDraft(path, "workspace-b", "session-a")?.text).toBe("另一工作区");
    expect(readV4ComposerDraft(path, "workspace-c", "session-a")).toBeNull();
  });

  it("uses stable workspace identity when the display path changes", () => {
    persistV4ComposerDraft(path, identity, "session-a", { text: "按身份恢复" });
    expect(readV4ComposerDraft("/renamed/path", identity, "session-a")?.text).toBe("按身份恢复");
  });

  it("preserves project and group intent when only the text changes, and honors explicit clearing", () => {
    persistV4ComposerDraft(
      path,
      identity,
      V4_DRAFT_SCOPE_ROOT,
      {
        text: "原文",
        projectId: "project-a",
        taskGroupId: "group-a",
      },
      scope,
    );
    persistV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, { text: "修改后的原文" }, scope);
    expect(readV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, scope)).toMatchObject({
      text: "修改后的原文",
      projectId: "project-a",
      taskGroupId: "group-a",
    });
    persistV4ComposerDraft(
      path,
      identity,
      V4_DRAFT_SCOPE_ROOT,
      {
        text: "仍保留正文",
        projectId: null,
        taskGroupId: null,
      },
      scope,
    );
    expect(readV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, scope)).toMatchObject({
      text: "仍保留正文",
      projectId: null,
      taskGroupId: null,
    });
  });

  it("clears only the requested session draft", () => {
    persistV4ComposerDraft(path, identity, "session-a", { text: "已发送正文" });
    persistV4ComposerDraft(path, identity, "session-b", { text: "其他未发送正文" });
    persistV4ComposerDraft(path, "workspace-b", "session-a", { text: "其他工作区正文" });
    expect(clearV4ComposerDraft(path, identity, "session-a")).toBe(true);
    expect(readV4ComposerDraft(path, identity, "session-a")).toBeNull();
    expect(readV4ComposerDraft(path, identity, "session-b")?.text).toBe("其他未发送正文");
    expect(readV4ComposerDraft(path, "workspace-b", "session-a")?.text).toBe("其他工作区正文");
  });

  it("deleting text does not resurrect the old draft or erase another project", () => {
    const other = { ...scope, projectId: "project-b" };
    persistV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, { text: "即将删除" }, scope);
    persistV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, { text: "其他项目" }, other);
    expect(
      persistV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, { text: " \n\t" }, scope),
    ).toBe(true);
    expect(readV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, scope)).toBeNull();
    expect(readV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, other)?.text).toBe("其他项目");
  });

  it("removing a group placement preserves the project and text and leaves other projects intact", () => {
    const other = { ...scope, projectId: "project-b" };
    for (const target of [scope, other]) {
      persistV4ComposerDraft(
        path,
        identity,
        V4_DRAFT_SCOPE_ROOT,
        {
          text: target.projectId!,
          projectId: target.projectId,
          taskGroupId: "group-a",
        },
        target,
      );
    }
    expect(clearV4ComposerDraftTaskGroup(path, identity, scope)).toBe(true);
    const retained = readV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, scope);
    expect(retained).toMatchObject({ text: "project-a", projectId: "project-a" });
    expect(retained?.taskGroupId).toBeUndefined();
    expect(readV4ComposerDraft(path, identity, V4_DRAFT_SCOPE_ROOT, other)).toMatchObject({
      text: "project-b",
      taskGroupId: "group-a",
    });
  });

  it("reports an unavailable browser store rather than a successful save", () => {
    vi.stubGlobal("window", {});
    expect(persistV4ComposerDraft(path, identity, "session-a", { text: "不能假报已保存" })).toBe(
      false,
    );
    expect(readV4ComposerDraft(path, identity, "session-a")).toBeNull();
  });

  it("reports failed saves and clears without losing the last persisted text", () => {
    persistV4ComposerDraft(path, identity, "quota-case", { text: "最后一次保存" });
    storage.failWrites = true;
    expect(persistV4ComposerDraft(path, identity, "quota-case", { text: "保存失败的新输入" })).toBe(
      false,
    );
    expect(clearV4ComposerDraft(path, identity, "quota-case")).toBe(false);
    expect(readV4ComposerDraft(path, identity, "quota-case")?.text).toBe("最后一次保存");
  });

  it("ignores corrupt saved data without erasing it during a read or affecting other workspaces", () => {
    persistV4ComposerDraft(path, identity, "session-a", { text: "损坏前" });
    persistV4ComposerDraft(path, "workspace-b", "session-a", { text: "可恢复正文" });
    const key = getV4ComposerDraftStorageKey(path, identity);
    storage.setItem(key, "{broken-json");
    expect(readV4ComposerDraft(path, identity, "session-a")).toBeNull();
    expect(storage.getItem(key)).toBe("{broken-json");
    expect(readV4ComposerDraft(path, "workspace-b", "session-a")?.text).toBe("可恢复正文");
  });
});
