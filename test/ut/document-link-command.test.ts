import { expect, it } from "vitest";
import { documentLinkCommand } from "../../packages/ui/src/aireq/proposals/document-link-command.js";

it("links the whole project document directory into the developer's repository", () => {
  expect(documentLinkCommand("/xxx/yyy")).toBe("ln -s /xxx/yyy/docs/areq ./docs/areq");
  expect(documentLinkCommand(undefined)).toBeUndefined();
});

it("quotes absolute paths containing shell metacharacters", () => {
  expect(documentLinkCommand("/srv/team's $(name)/")).toBe(
    "ln -s '/srv/team'\\''s $(name)/docs/areq' ./docs/areq",
  );
});
