import { Database } from "bun:sqlite";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

async function assertSdk(root: string): Promise<void> {
  const manifest = await Bun.file(join(root, "omp-sdk.json")).json();
  if (
    manifest.format !== 1 ||
    manifest.platform !== process.platform ||
    manifest.arch !== process.arch ||
    manifest.bun !== Bun.version ||
    typeof manifest.version !== "string" ||
    !Array.isArray(manifest.addons) ||
    manifest.addons.length === 0
  ) {
    throw new Error(
      `不兼容的 OMP SDK ZIP，需要 ${process.platform}-${process.arch}、Bun ${Bun.version} 的格式 1 归档。`,
    );
  }
  for (const addon of manifest.addons) {
    if (
      typeof addon !== "string" ||
      !/^[\w.-]+\.node$/.test(addon) ||
      !(await lstat(join(root, "packages", "natives", "native", addon))).isFile()
    ) {
      throw new Error("OMP SDK ZIP 缺少清单指定的原生模块。");
    }
  }
}

async function extract(zip: string, root: string): Promise<void> {
  const windows = process.platform === "win32";
  const tool = windows ? "tar.exe" : "unzip";
  const lines = async (args: string[]) => {
    const { stdout } = await execute(tool, args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout.trimEnd().split(/\r?\n/);
  };
  const [names, details] = await Promise.all([
    lines(windows ? ["-tf", zip] : ["-Z1", zip]),
    lines(windows ? ["-tvf", zip] : ["-Z", "-l", zip]),
  ]);
  const modes = details.filter((line) => /^[-dlbcpsh?]\S{9}\s/.test(line));
  if (
    modes.length !== names.length ||
    modes.some((line) => !line.startsWith("-") && !line.startsWith("d"))
  )
    throw new Error("OMP SDK ZIP 只能包含文件及目录。");
  for (const name of names) {
    if (name === "./") continue;
    const parts = name.replace(/^\.\//, "").replace(/\/$/, "").split("/");
    if (
      /[\\:\p{Cc}]/u.test(name) ||
      parts.some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[. ]$|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
      )
    )
      throw new Error("OMP SDK ZIP 中包含无效的文件路径。");
  }
  await execute(tool, windows ? ["-xf", zip, "-C", root] : ["-oq", zip, "-d", root], {
    windowsHide: true,
  });
}

async function runBun(root: string, args: string[]): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) throw new Error(`准备 OMP SDK ZIP 失败：bun ${args.join(" ")}`);
}

/** SDK 自己的锁文件及生成器在归档内运行。正式发布包直接注入编译时嵌入的 SDK。 */
export async function prepareOmpSdkArchive(): Promise<string> {
  const cache = resolve(".zcode-runtime/sdk");
  const zip = resolve(
    process.env["OMP_SDK_ZIP"] || join(cache, `omp-sdk-${process.platform}-${process.arch}.zip`),
  );
  if (!zip.toLowerCase().endsWith(".zip") || !(await stat(zip).catch(() => undefined))?.isFile()) {
    throw new Error(`找不到 OMP SDK ZIP：${zip}。请通过 OMP_SDK_ZIP 指定本平台的归档。`);
  }
  // 同一份字节用于计算缓存键和解包，归档在启动期间被替换也不会混用两个版本。
  const bytes = await readFile(zip);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const expected = process.env["OMP_SDK_SHA256"]?.trim().toLowerCase();
  if (expected !== undefined && expected !== digest)
    throw new Error("OMP SDK ZIP 的 SHA-256 校验失败。");
  const directory = join(cache, "cache", digest);
  const runtime = join(directory, "runtime");
  await mkdir(directory, { recursive: true });
  const lock = new Database(join(directory, "preparation.sqlite"), { create: true, strict: true });
  try {
    // Bun 在 Windows 创建指向绝对路径的 workspace 联接，安装后移动目录会破坏这些联接。
    // 在最终路径安装，以 SQLite 提交作为整套 SDK 可见的时刻；进程退出时系统自动释放锁。
    lock.exec("PRAGMA busy_timeout=200");
    for (;;) {
      try {
        lock.exec("BEGIN IMMEDIATE");
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== "SQLITE_BUSY") throw error;
        await Bun.sleep(100);
      }
    }
    lock.exec("CREATE TABLE IF NOT EXISTS prepared (digest TEXT PRIMARY KEY)");
    if (!lock.query("SELECT digest FROM prepared WHERE digest=?").get(digest)) {
      if (dirname(runtime) !== directory || basename(runtime) !== "runtime")
        throw new Error("SDK 缓存路径无效。");
      await rm(runtime, { recursive: true, force: true });
      await mkdir(runtime);
      const snapshot = join(directory, "input.zip");
      try {
        await Bun.write(snapshot, bytes);
        await extract(snapshot, runtime);
        await assertSdk(runtime);
        await runBun(runtime, ["install", "--frozen-lockfile", "--ignore-scripts"]);
        await runBun(runtime, ["--cwd=packages/stats", "run", "gen:stats"]);
        await runBun(runtime, ["--cwd=packages/collab-web", "run", "gen:export-viewer"]);
      } finally {
        await rm(snapshot, { force: true });
      }
      lock.query("INSERT INTO prepared VALUES (?)").run(digest);
    } else {
      await assertSdk(runtime);
    }
    lock.exec("COMMIT");
    return runtime;
  } finally {
    lock.close();
  }
}
