import { mkdir, mkdtemp, readFile, readlink, readdir, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AIREQ_ROLE_ADMINISTRATOR } from "@zcode/services/aireq";
import { connectST, unique } from "./client.js";
import { config } from "./config.js";
import { createProject, createProposalIn } from "./business.js";
import {
  completeBusinessMaterial,
  completeSolutionMaterial,
  discuss,
  getMaterials,
  getProposal,
} from "./proposal-flow.js";

it(
  "saves project settings and publishes current IR and SR documents through one directory link",
  async () => {
    const client = await connectST(AIREQ_ROLE_ADMINISTRATOR);
    const developer = await mkdtemp(join(tmpdir(), "aireq-developer-"));
    try {
      const project = await createProject(client);
      const { workDirectory } = project;
      const sharedDirectory = join(workDirectory, "docs", "areq");
      const link = join(developer, "docs", "areq");
      await mkdir(join(developer, "docs"));
      await symlink(sharedDirectory, link, "dir");
      const target = await createProposalIn(client, project);
      const irDirectory = join(link, target.irId);
      expect((await stat(irDirectory)).isDirectory()).toBe(true);
      expect(await readdir(irDirectory)).toEqual([]);
      const initial = await completeBusinessMaterial(client, target);
      const requirements = join(irDirectory, "requirements.md");
      expect(await readFile(requirements, "utf8")).toBe(
        getMaterials(initial, target).find((file) => file.kind === "ir")?.content,
      );
      expect((await stat(irDirectory)).mode & 0o005).toBe(0o005);
      expect((await stat(requirements)).mode & 0o004).toBe(0o004);
      const solution = await completeSolutionMaterial(client, target);
      const [srId] = getProposal(solution, target).srIds;
      expect(await readFile(join(irDirectory, srId!, "proposal.md"), "utf8")).toContain(
        "](../requirements.md)",
      );
      expect((await stat(join(irDirectory, srId!, "specs", srId!, "spec.md"))).isFile()).toBe(true);
      expect((await stat(join(irDirectory, "sr-dependencies.json"))).isFile()).toBe(true);
      const added = unique("补充一个需即时发布的验收条件");
      await discuss(client, target, added);
      expect(await readFile(requirements, "utf8")).toContain(added);
      expect(await readlink(link)).toBe(sharedDirectory);

      const second = await createProposalIn(client, project);
      expect((await stat(join(link, second.irId))).isDirectory()).toBe(true);
      await client.command(
        { type: "deleteRequirement", projectId: second.projectId, irId: second.irId },
        second.selection,
      );
      await expect(stat(join(link, second.irId))).rejects.toMatchObject({ code: "ENOENT" });
      expect((await stat(requirements)).isFile()).toBe(true);
    } finally {
      await rm(developer, { recursive: true, force: true });
      await client.close();
    }
  },
  config.timeoutMs,
);
