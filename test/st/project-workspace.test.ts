import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AIREQ_ROLE_ADMINISTRATOR } from "@zcode/services/aireq";
import { connectST, unique } from "./client.js";
import { config, requireConfig } from "./config.js";
import { requireTestProject, takeRequirement, withProjectRepository } from "./business.js";
import { readOccupiedRequirements, requirementKey } from "./resources.js";
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
    try {
      const first = await requireTestProject(client);
      const project =
        first.repositoryUrl && first.workDirectory
          ? first
          : await requireTestProject(client, first.id);
      requireConfig(project.repositoryUrl, "目录软链验收要求项目已有可恢复的仓库配置");
      requireConfig(project.workDirectory, "目录软链验收要求服务端与 ST 共享工作目录");
      const target = await takeRequirement(client, { projectId: project.id });
      await withProjectRepository(client, target.projectId, async (configured) => {
        const workDirectory = requireConfig(configured.workDirectory, "公开配置中的工作目录");
        expect(configured.name).toBe(project.name);
        const developer = await mkdtemp(join(tmpdir(), "aireq-developer-"));
        try {
          const sharedDirectory = join(workDirectory, "docs", "areq");
          const link = join(developer, "docs", "areq");
          await mkdir(join(developer, "docs"));
          const windows = process.platform === "win32";
          await symlink(sharedDirectory, link, windows ? "junction" : "dir");
          const irDirectory = join(link, target.irId);
          const requirements = join(irDirectory, "requirements.md");
          // IR 已经在云龙目录中，但尚未生成材料；开发端始终使用同一个共享目录链接。
          await expect(stat(requirements)).rejects.toMatchObject({ code: "ENOENT" });
          const initial = await completeBusinessMaterial(client, target);
          expect(await readFile(requirements, "utf8")).toBe(
            getMaterials(initial, target).find((file) => file.kind === "ir")?.content,
          );
          expect((await stat(irDirectory)).isDirectory()).toBe(true);
          if (!windows) {
            expect((await stat(irDirectory)).mode & 0o005).toBe(0o005);
            expect((await stat(requirements)).mode & 0o004).toBe(0o004);
          }
          const solution = await completeSolutionMaterial(client, target);
          const [srId] = getProposal(solution, target).srIds;
          expect(await readFile(join(irDirectory, srId!, "proposal.md"), "utf8")).toContain(
            "](../requirements.md)",
          );
          expect((await stat(join(irDirectory, srId!, "specs", srId!, "spec.md"))).isFile()).toBe(
            true,
          );
          expect((await stat(join(irDirectory, "sr-dependencies.json"))).isFile()).toBe(true);
          const previous = await readFile(requirements, "utf8");
          const added = unique("补充一个需即时发布的验收条件");
          await discuss(client, target, added);
          const updated = await readFile(requirements, "utf8");
          expect(updated).not.toBe(previous);
          expect(updated).toContain(added);

          // 仅对另有专用前置的项目验证新增和隔离；不创建或删除云龙 IR。
          const occupied = readOccupiedRequirements();
          if (
            config.fixtures.requirements?.some(
              (row) => row.projectId === target.projectId && !occupied.has(requirementKey(row)),
            )
          ) {
            const second = await takeRequirement(client, { projectId: target.projectId });
            expect(second.irId).not.toBe(target.irId);
            const secondRequirements = join(link, second.irId, "requirements.md");
            await expect(stat(secondRequirements)).rejects.toMatchObject({ code: "ENOENT" });
            const generated = await completeBusinessMaterial(client, second);
            expect(await readFile(secondRequirements, "utf8")).toBe(
              getMaterials(generated, second).find((file) => file.kind === "ir")?.content,
            );
            expect(await readFile(requirements, "utf8")).toBe(updated);
          }
          expect(await realpath(link)).toBe(await realpath(sharedDirectory));
        } finally {
          await rm(developer, { recursive: true, force: true });
        }
      });
    } finally {
      await client.close();
    }
  },
  config.timeoutMs,
);
