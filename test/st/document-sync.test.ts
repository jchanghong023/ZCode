import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AIREQ_CONFIRMED_DOCUMENTS_PATH,
  AIREQ_SYNC_SCRIPT_ROOT,
  type AIReqConfirmedDocumentBundle,
} from "@zcode/services/aireq";
import { createProposal } from "./business.js";
import { connectST, stFetch } from "./client.js";
import { config } from "./config.js";
import {
  completeBusinessMaterial,
  completeSolutionMaterial,
  discuss,
  getProposal,
} from "./proposal-flow.js";

describe("confirmed document sync", () => {
  it(
    "downloads the frozen snapshot and applies it only after local confirmation",
    async () => {
      const admin = await connectST("y00000000");
      const scratch = await mkdtemp(join(tmpdir(), "aireq-sync-st-"));
      try {
        const target = await createProposal(admin);
        const query = new URLSearchParams({
          aireqProject: target.projectId,
          aireqRelease: target.releaseId,
          aireqIr: target.irId,
        });
        const endpoint = `${AIREQ_CONFIRMED_DOCUMENTS_PATH}?${query}`;
        const link = new URL(`/?${query}`, config.baseUrl).href;
        expect((await stFetch(AIREQ_CONFIRMED_DOCUMENTS_PATH)).status).toBe(400);
        expect((await stFetch(`${endpoint}&aireqIr=duplicate`)).status).toBe(400);
        const wrongRelease = new URLSearchParams(query);
        wrongRelease.set("aireqRelease", "missing-release");
        expect((await stFetch(`${AIREQ_CONFIRMED_DOCUMENTS_PATH}?${wrongRelease}`)).status).toBe(
          404,
        );
        const unconfirmed = await stFetch(endpoint);
        expect(unconfirmed.status).toBe(409);
        expect(await unconfirmed.json()).toMatchObject({ error: { code: "NO_CONFIRMED_VERSION" } });
        if (config.token) {
          expect((await stFetch(endpoint, { headers: { Authorization: "" } })).status).toBe(401);
        }

        const { documentSync } = await admin.bootstrap();
        const scriptResponse = await stFetch(
          `${AIREQ_SYNC_SCRIPT_ROOT}/${documentSync.scriptSha256}.py`,
          {
            headers: { Authorization: "" },
          },
        );
        expect(scriptResponse.status).toBe(200);
        const script = await scriptResponse.text();
        expect(createHash("sha256").update(script).digest("hex")).toBe(documentSync.scriptSha256);
        expect((await stFetch(`${AIREQ_SYNC_SCRIPT_ROOT}/missing.py`)).status).toBe(404);
        const scriptPath = join(scratch, "aireq-sync.py");
        await writeFile(scriptPath, script);

        await completeBusinessMaterial(admin, target);
        await completeSolutionMaterial(admin, target);
        const confirm = () =>
          admin.command({ type: "confirmDocumentVersion", ...target.selection }, target.selection);
        expect((await confirm()).receipt.status).toBe("completed");
        const readBundle = async () => {
          const response = await stFetch(endpoint);
          expect(response.status).toBe(200);
          expect(response.headers.get("Cache-Control")).toBe("no-store");
          return (await response.json()) as AIReqConfirmedDocumentBundle;
        };
        const first = await readBundle();
        expect(first).toMatchObject({
          ...target.selection,
          releaseId: target.releaseId,
          version: 1,
        });
        expect(first.files.map(({ path }) => path)).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/requirements\.md$/),
            expect.stringMatching(/design\.md$/),
            expect.stringMatching(/test-plan\.md$/),
            expect.stringMatching(/sr-dependencies\.json$/),
          ]),
        );
        for (const file of first.files) {
          expect(createHash("sha256").update(file.content).digest("hex")).toBe(file.sha256);
          expect(Buffer.byteLength(file.content)).toBe(file.size);
        }

        await discuss(admin, target, "## 同步验收\n补充下一版的测试条件。");
        const pending = await admin.read(target.selection);
        expect(getProposal(pending, target).documentVersion).toEqual({ number: 2 });
        expect(await readBundle()).toEqual(first);
        expect((await admin.read(target.selection)).view.revision).toBe(pending.view.revision);

        const repo = join(scratch, "repo");
        const subdir = join(repo, "src");
        await mkdir(subdir, { recursive: true });
        const git = (...args: string[]) => {
          const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
          expect(result.status, result.stderr).toBe(0);
          return result.stdout.trim();
        };
        git("init", "-b", "feature/test-sync");
        git(
          "-c",
          "user.name=ST",
          "-c",
          "user.email=st@example.invalid",
          "commit",
          "--allow-empty",
          "-m",
          "ST base",
        );
        git("remote", "add", "origin", first.repositoryUrl);
        const baseCommit = git("rev-parse", "HEAD");
        const req = first.files.find(({ path }) => path.endsWith("/requirements.md"))!;
        const destination = join(repo, req.path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, "本地修改");
        await writeFile(join(repo, "unrelated.txt"), "保留");
        const run = (answer: string) =>
          spawnSync("python", [scriptPath, link], {
            cwd: subdir,
            input: answer,
            encoding: "utf-8",
            timeout: 35_000,
            env: { ...process.env, AIREQ_SYNC_TOKEN: config.token ?? "" },
          });
        git("remote", "set-url", "origin", "https://wrong.example.invalid/project.git");
        const wrongRepo = run("y\n");
        expect(wrongRepo.status).toBe(1);
        expect(wrongRepo.stderr).toContain("本地 Git 远端与平台项目仓库不匹配");
        expect(await readFile(destination, "utf8")).toBe("本地修改");
        git("remote", "set-url", "origin", first.repositoryUrl);
        const canceled = run("\n");
        expect(canceled.status, canceled.stderr).toBe(0);
        expect(canceled.stdout).toContain(`覆盖 ${req.path}`);
        expect(canceled.stdout).toContain("已取消");
        expect(await readFile(destination, "utf8")).toBe("本地修改");
        const missingFile = join(repo, first.files.find(({ path }) => path !== req.path)!.path);
        await expect(readFile(missingFile)).rejects.toMatchObject({ code: "ENOENT" });

        const copied = run("y\n");
        expect(copied.status, copied.stderr).toBe(0);
        expect(copied.stdout).toContain("已同步 V1 到 feature/test-sync");
        for (const file of first.files)
          expect(await readFile(join(repo, file.path), "utf8")).toBe(file.content);
        expect(await readFile(join(repo, "unrelated.txt"), "utf8")).toBe("保留");
        expect(run("\n").stdout).toContain("文档内容已一致");

        expect((await confirm()).receipt.status).toBe("completed");
        const upgraded = run("y\n");
        expect(upgraded.status, upgraded.stderr).toBe(0);
        expect(upgraded.stdout).toContain("已同步 V2 到 feature/test-sync");
        expect(await readFile(destination, "utf8")).toContain("补充下一版的测试条件");
        expect(git("rev-parse", "HEAD")).toBe(baseCommit);
        expect(git("diff", "--cached", "--name-only")).toBe("");
      } finally {
        await Promise.all([admin.close(), rm(scratch, { recursive: true, force: true })]);
      }
    },
    config.timeoutMs,
  );
});
