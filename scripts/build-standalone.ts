import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const [archiveArg, expectedHash, outputArg] = process.argv.slice(2);
if (
  process.platform !== "win32" ||
  process.arch !== "x64" ||
  !archiveArg ||
  !expectedHash ||
  !/^[\da-f]{64}$/i.test(expectedHash) ||
  process.argv.length > 5
) {
  throw new Error(
    "Usage on Windows x64: bun run build:standalone <omp-sdk.zip> <sha256> [output.exe]",
  );
}
const output = resolve(outputArg ?? join(root, "dist/zcode.exe"));
if (!output.toLowerCase().endsWith(".exe")) throw new Error("The output path must end in .exe");
const archivePath = resolve(archiveArg);
const archive = Bun.file(archivePath);
const hash = createHash("sha256");
for await (const bytes of archive.stream()) hash.update(bytes);
if (hash.digest("hex") !== expectedHash.toLowerCase())
  throw new Error("OMP SDK ZIP SHA-256 mismatch");

async function run(command: string, ...args: string[]): Promise<void> {
  const child = Bun.spawn([command, ...args], { cwd: root, stdout: "inherit", stderr: "inherit" });
  if ((await child.exited) !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

await mkdir(dirname(output), { recursive: true });
const stage = await mkdtemp(join(dirname(output), ".zcode-build-"));
try {
  const sdkRoot = join(stage, "sdk");
  await mkdir(sdkRoot);
  await run("tar.exe", "-xf", archivePath, "-C", sdkRoot);
  const sdk = (await Bun.file(join(sdkRoot, "omp-sdk.json")).json()) as {
    format: number;
    version: string;
    bun: string;
    platform: string;
    arch: string;
  };
  if (
    sdk.format !== 1 ||
    sdk.bun !== Bun.version ||
    sdk.platform !== "win32" ||
    sdk.arch !== "x64"
  ) {
    throw new Error(
      `Incompatible OMP SDK: format ${sdk.format}, Bun ${sdk.bun}, ${sdk.platform}-${sdk.arch}`,
    );
  }

  await run(process.execPath, "run", "build:web");
  const web = join(root, "packages/web/dist");
  const files: Record<string, Uint8Array> = {};
  for await (const name of new Bun.Glob("**/*").scan({ cwd: web, onlyFiles: true })) {
    if (!name.endsWith(".map"))
      files[name.replaceAll("\\", "/")] = await Bun.file(join(web, name)).bytes();
  }
  if (!files["index.html"] || !files["chat/index.html"])
    throw new Error("Vite did not build both Web entrypoints");
  await Bun.write(
    join(sdkRoot, "zcode-web.tar.gz"),
    await new Bun.Archive(files, { compress: "gzip" }).bytes(),
  );

  const licenses = [
    ["ZCode LICENSE", join(root, "LICENSE")],
    ["ZCode NOTICE", join(root, "NOTICE.md")],
    ["ZCode third-party notices", join(root, "THIRD-PARTY-NOTICES.md")],
    ["OMP LICENSE", join(sdkRoot, "LICENSE")],
    ["OMP third-party notices", join(sdkRoot, "packages/coding-agent/THIRD-PARTY-NOTICES.txt")],
    ["OMP native notices", join(sdkRoot, "packages/natives/THIRD-PARTY-NOTICES.txt")],
  ] as const;
  const notices = await Promise.all(
    licenses.map(async ([label, path]) => `--- ${label} ---\n${await Bun.file(path).text()}`),
  );
  await Bun.write(join(sdkRoot, "zcode-licenses.txt"), notices.join("\n\n"));
  const version = (await Bun.file(join(root, "package.json")).json()) as { version: string };
  const entrypoint = join(sdkRoot, "zcode-entry.ts");
  const server = join(root, "packages/server/src/entry-http.ts").replaceAll("\\", "/");
  // Packaging entry only: keep the existing HTTP server and don't initialize OMP in the prototype.
  await Bun.write(
    entrypoint,
    `
import { mkdtemp, rm } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import web from "./zcode-web.tar.gz" with { type: "file" };
import licenses from "./zcode-licenses.txt" with { type: "file" };

switch (process.argv[2]) {
  case "--version": {
    const { createAgentSession } = await import("@oh-my-pi/pi-coding-agent/sdk");
    if (typeof createAgentSession !== "function") throw new Error("OMP SDK is missing");
    console.log(${JSON.stringify(`zcode/${version.version} omp-sdk/${sdk.version}`)});
    break;
  }
  case "--licenses":
    console.log(await Bun.file(licenses).text());
    break;
  default: {
    const staticRoot = await mkdtemp(join(tmpdir(), "zcode-web-"));
    try {
      await new Bun.Archive(Bun.file(web)).extract(staticRoot);
      process.once("exit", () => rmSync(staticRoot, { recursive: true, force: true }));
      process.env.ZCODE_WEB_STATIC_ROOT = staticRoot;
      await import(${JSON.stringify(server)});
    } catch (error) {
      await rm(staticRoot, { recursive: true, force: true });
      throw error;
    }
  }
}
`,
  );
  const executable = join(stage, "zcode.exe");
  await run(process.execPath, join(sdkRoot, "scripts/compile-sdk-host.ts"), entrypoint, executable);
  await rename(executable, output);
  console.log(output);
} finally {
  await rm(stage, { recursive: true, force: true });
}
