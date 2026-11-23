import { describe, expect, it } from "vitest";
import { documentSyncCommand } from "../../packages/ui/src/aireq/proposals/document-sync-command.js";

const digest = "a".repeat(64);
const target = { projectId: "demo", releaseId: "release", irId: 'one & "two" $value' };

describe("document sync command", () => {
  it("pins the script digest and quotes the public requirement link", () => {
    const command = documentSyncCommand(
      "https://example.test/?token=private#panel",
      target,
      digest,
    );
    expect(command).toMatch(/^python -c "/);
    expect(command).toContain(`"https://example.test/aireq-sync/${digest}.py" "${digest}"`);
    expect(command).toContain(
      '"https://example.test/?aireqProject=demo&aireqRelease=release&aireqIr=one+%26+%22two%22+%24value"',
    );
    expect(command).not.toContain("private");
  });

  it("requires a script digest from an HTTP platform", () => {
    expect(documentSyncCommand("https://example.test/", target, "missing-digest")).toBeUndefined();
    expect(documentSyncCommand("file:///app", target, digest)).toBeUndefined();
  });
});
