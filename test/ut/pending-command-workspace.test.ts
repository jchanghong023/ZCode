import { describe, expect, it } from "vitest";
import {
  isPendingCommandForWorkspace,
  resolvePendingCommandWorkspaceKey,
} from "../../packages/ui/src/v4/pendingCommandWorkspace.js";

// AGENTS.md 身份隔离规则：workspaceIdentity.trim() || workspacePath。
describe("pending message workspace ownership", () => {
  const replay = { kind: "input" as const, type: "sendText", payload: { text: "需求说明" } };

  it("uses workspace identity instead of a shared display path", () => {
    const entry = {
      replay,
      clientContext: {
        workspace: {
          workspacePath: "/same-path",
          workspaceIdentity: "  workspace-a  ",
        },
      },
    };
    expect(resolvePendingCommandWorkspaceKey(entry)).toBe("workspace-a");
    expect(isPendingCommandForWorkspace(entry, "/same-path", "workspace-a")).toBe(true);
    expect(isPendingCommandForWorkspace(entry, "/same-path", "workspace-b")).toBe(false);
    expect(isPendingCommandForWorkspace(entry, "/same-path")).toBe(false);
  });

  it("falls back to path when identity is absent or blank", () => {
    for (const workspaceIdentity of [undefined, "   "]) {
      const entry = {
        replay,
        clientContext: {
          workspace: {
            workspacePath: "/project-a",
            workspaceIdentity,
          },
        },
      };
      expect(resolvePendingCommandWorkspaceKey(entry)).toBe("/project-a");
      expect(isPendingCommandForWorkspace(entry, "/project-a", workspaceIdentity)).toBe(true);
      expect(isPendingCommandForWorkspace(entry, "/project-b")).toBe(false);
    }
  });

  it("does not infer a message owner from arbitrary payload workspace fields", () => {
    const entry = {
      replay: { ...replay, payload: { text: "需求说明", workspaceId: "workspace-a" } },
    };
    expect(resolvePendingCommandWorkspaceKey(entry)).toBeNull();
    expect(isPendingCommandForWorkspace(entry, "/same-path", "workspace-a")).toBe(false);
  });
});
