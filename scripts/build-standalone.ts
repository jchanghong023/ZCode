import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dir, "..");
const production = process.argv[2] === "--production";
const { positionals: args, values } = parseArgs({
  args: process.argv.slice(production ? 3 : 2),
  allowPositionals: true,
  options: { "web-dist": { type: "string" } },
});
if (!production && values["web-dist"] !== undefined)
  throw new Error("--web-dist requires build:prod");
const [archiveArg, expectedHash, outputArg] = args;
const windows = process.platform === "win32";
if (
  (!windows && !(production && process.platform === "linux")) ||
  process.arch !== "x64" ||
  !archiveArg ||
  !expectedHash ||
  !/^[\da-f]{64}$/i.test(expectedHash) ||
  args.length > 3
) {
  throw new Error(
    production
      ? "Usage on Windows/Linux x64: bun run build:prod <omp-sdk.zip> <sha256> [output.zip] [--web-dist <directory>]"
      : "Usage on Windows x64: bun run build:standalone <omp-sdk.zip> <sha256> [output.exe]",
  );
}
const { version } = (await Bun.file(join(root, "package.json")).json()) as { version: string };
const defaultName = production ? `zcode-${version}-${process.platform}-x64.zip` : "zcode.exe";
const output = resolve(outputArg ?? join(root, "dist", defaultName));
const extension = production ? ".zip" : ".exe";
if (!output.toLowerCase().endsWith(extension))
  throw new Error(`The output path must end in ${extension}`);
const archivePath = resolve(archiveArg);
if (output === archivePath) throw new Error("The output path must differ from the SDK ZIP");
const archive = Bun.file(archivePath);
const hash = createHash("sha256");
for await (const bytes of archive.stream()) hash.update(bytes);
if (hash.digest("hex") !== expectedHash.toLowerCase())
  throw new Error("OMP SDK ZIP SHA-256 mismatch");

async function run(cwd: string, command: string, ...args: string[]): Promise<void> {
  const child = Bun.spawn([command, ...args], { cwd, stdout: "inherit", stderr: "inherit" });
  if ((await child.exited) !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

await mkdir(dirname(output), { recursive: true });
const stage = await mkdtemp(join(dirname(output), ".zcode-build-"));
const sdkRoot = await mkdtemp(join(tmpdir(), "zcode-sdk-"));
try {
  if (windows) await run(root, "tar.exe", "-xf", archivePath, "-C", sdkRoot);
  else await run(root, "unzip", "-q", archivePath, "-d", sdkRoot);
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
    sdk.platform !== process.platform ||
    sdk.arch !== "x64"
  ) {
    throw new Error(
      `Incompatible OMP SDK: format ${sdk.format}, Bun ${sdk.bun}, ${sdk.platform}-${sdk.arch}`,
    );
  }

  const web = resolve(values["web-dist"] ?? join(root, "packages/web/dist"));
  if (values["web-dist"] === undefined) await run(root, process.execPath, "run", "build:web");
  for (const page of ["index.html", "chat/index.html"]) {
    if (!(await Bun.file(join(web, page)).exists())) throw new Error(`Missing Web entry: ${page}`);
  }
  const release = join(stage, "release");
  await mkdir(release);
  if (production) {
    await cp(web, join(release, "web"), {
      recursive: true,
      filter: (file) => !file.endsWith(".map"),
    });
  } else {
    const files: Record<string, Uint8Array> = {};
    for await (const name of new Bun.Glob("**/*").scan({ cwd: web, onlyFiles: true })) {
      if (!name.endsWith(".map"))
        files[name.replaceAll("\\", "/")] = await Bun.file(join(web, name)).bytes();
    }
    await Bun.write(
      join(sdkRoot, "zcode-web.tar.gz"),
      await new Bun.Archive(files, { compress: "gzip" }).bytes(),
    );
  }

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
  const entrypoint = join(sdkRoot, "zcode-entry.ts");
  const server = join(root, "packages/server/src/entry-http.ts").replaceAll("\\", "/");
  const productionServer = join(root, "packages/server/src/production/server.ts").replaceAll(
    "\\",
    "/",
  );
  const offlineCli = join(root, "scripts/mock-clouddragon/cli.mjs").replaceAll("\\", "/");
  const releaseVersion = `zcode/${version} omp-sdk/${sdk.version}`;
  if (production) {
    await Bun.write(join(release, "LICENSES.txt"), notices.join("\n\n"));
    await Bun.write(
      entrypoint,
      `
import { dirname, resolve } from "node:path";
const installDir = dirname(process.execPath);
const args = process.argv.slice(2);
if (args[0] === "clouddragon") {
  process.argv.splice(2, 1);
  process.env.ZCODE_CLOUDDRAGON_MOCK_DB ??= resolve(process.env.ZCODE_DATA_DIR || ".zcode-runtime/yellow", "clouddragon.sqlite");
  await import(${JSON.stringify(offlineCli)});
} else if (args[0] === "--version") {
  process.stdout.write(${JSON.stringify(releaseVersion + "\n")});
} else if (args[0] === "--licenses") {
  process.stdout.write(await Bun.file(resolve(installDir, "LICENSES.txt")).text());
} else {
  process.env.ZCODE_EMBEDDED_CLOUDDRAGON = "1";
  const {createAgentSession} = await import("@oh-my-pi/pi-coding-agent/sdk");
  const {SessionManager} = await import("@oh-my-pi/pi-coding-agent/session/session-manager");
  const {MCPManager, readMCPConfigFile} = await import("@oh-my-pi/pi-coding-agent/mcp");
  const {getSupportedEfforts} = await import("@oh-my-pi/pi-catalog/model-thinking");
  const {getSessionsDir} = await import("@oh-my-pi/pi-utils/dirs");
  const {Settings} = await import("@oh-my-pi/pi-coding-agent/config/settings");
  const {startProduction} = await import(${JSON.stringify(productionServer)});
  await startProduction({sdk:{createAgentSession, SessionManager, MCPManager, readMCPConfigFile, getSupportedEfforts, getSessionsDir, Settings}, staticRoot:resolve(installDir, "web"), args});
}
`,
    );
  } else {
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
    console.log(${JSON.stringify(releaseVersion)});
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
  }
  const executable = join(release, windows ? "zcode.exe" : "zcode");
  await run(
    root,
    process.execPath,
    join(sdkRoot, "scripts/compile-sdk-host.ts"),
    entrypoint,
    executable,
  );
  if (production) {
    const zip = join(stage, "release.zip");
    if (windows) await run(release, "tar.exe", "-a", "-cf", zip, ".");
    else await run(release, "zip", "-q", "-r", zip, ".");
    await rename(zip, output);
  } else {
    await rename(executable, output);
  }
  console.log(output);
} finally {
  await rm(stage, { recursive: true, force: true });
  await rm(sdkRoot, { recursive: true, force: true });
}
