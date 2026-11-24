import { expect, it } from "vitest";
import { documentLinkCommand } from "../../packages/ui/src/aireq/proposals/document-link-command.js";
import { validateRepository } from "../../packages/ui/src/aireq/settings/projectValidation.js";

it("links the whole project document directory into the developer's repository", () => {
  expect(documentLinkCommand("/xxx/yyy")).toBe("ln -s /xxx/yyy/docs/areq ./docs/areq");
  expect(documentLinkCommand(undefined)).toBeUndefined();
});

it("quotes absolute paths containing shell metacharacters", () => {
  expect(documentLinkCommand("/srv/team's $(name)/")).toBe(
    "ln -s '/srv/team'\\''s $(name)/docs/areq' ./docs/areq",
  );
});
it("uses a PowerShell directory junction for a Windows working directory", () => {
  const directory = "C:/team's files/project/";
  expect(documentLinkCommand(directory)).toBe(
    "New-Item -ItemType Junction -Path '.\\docs\\areq' -Target 'C:\\team''s files\\project\\docs\\areq' -ErrorAction Stop",
  );
  expect(
    validateRepository("project", "https://example.invalid/repo.git", "main", directory),
  ).toEqual({});
});
