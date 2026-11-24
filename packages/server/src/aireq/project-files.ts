import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, posix } from "node:path";
import type { AIReqMaterialView } from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import { prototypeChangeRoot, prototypeIrRoot } from "./proposal-storage.js";

export function isProjectPathSegment(value: string): boolean {
  return Boolean(
    value &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !/\p{Cc}/u.test(value),
  );
}

function directory(path: string, create = false) {
  if (create) {
    try {
      mkdirSync(path);
      chmodSync(path, 0o755);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  if (!lstatSync(path).isDirectory()) throw businessRule("项目目录已被文件或软链接占用。");
  return path;
}

export function createSharedDirectories(path: string): void {
  const first = mkdirSync(path, { recursive: true });
  if (!first) return;
  // 仅调整服务本次创建的目录。已有共享目录继续沿用部署者配置的文件权限。
  for (let current = path; current !== first; current = dirname(current)) {
    chmodSync(current, 0o755);
  }
  chmodSync(first, 0o755);
}

async function runGit(args: string[], cwd: string): Promise<string | undefined> {
  // Git receives validated arguments directly. Never run repository hooks or local transport helpers.
  const process = Bun.spawn(
    [
      "git",
      "-c",
      "protocol.file.allow=never",
      "-c",
      "protocol.ext.allow=never",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    {
      cwd,
      env: { ...Bun.env, GIT_TERMINAL_PROMPT: "0" },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      signal: AbortSignal.timeout(45_000),
    },
  );
  const [output, status] = await Promise.all([new Response(process.stdout).text(), process.exited]);
  return status === 0 ? output.trim() : undefined;
}

export function resolveProjectDirectory(workDirectory: string): string {
  try {
    return realpathSync(workDirectory);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "ENOENT" ||
      dirname(workDirectory) === workDirectory
    )
      throw businessRule("无法访问项目工作目录，请检查服务端路径及权限。");
    return join(resolveProjectDirectory(dirname(workDirectory)), basename(workDirectory));
  }
}

export async function prepareProjectClone(
  root: string,
  name: string,
  remote: string,
  branch: string,
  ownedBranch?: string,
): Promise<void> {
  const code = directory(join(root, "code"), true);
  const checkout = join(code, name);
  const existing = lstatSync(checkout, { throwIfNoEntry: false });
  if (existing) {
    if (
      !existing.isDirectory() ||
      !lstatSync(join(checkout, ".git"), { throwIfNoEntry: false })?.isDirectory() ||
      (await runGit(["config", "--local", "--get", "remote.origin.url"], checkout)) !== remote
    )
      throw businessRule("代码目录已被占用，请使用新的工作目录或项目名称。");
    const currentBranch = await runGit(["symbolic-ref", "--short", "HEAD"], checkout);
    if (currentBranch === branch) return;
    if (
      !ownedBranch ||
      currentBranch !== ownedBranch ||
      (await runGit(["status", "--porcelain"], checkout)) !== "" ||
      (await runGit(["switch", "--", branch], checkout)) === undefined
    )
      throw businessRule("无法安全切换代码目录的默认分支，请检查工作树或选用新的工作目录。");
    return;
  }

  const stage = mkdtempSync(join(code, ".clone-"));
  try {
    const result = await runGit(["clone", "--branch", branch, "--", remote, stage], code);
    if (
      result === undefined ||
      (await runGit(["symbolic-ref", "--short", "HEAD"], stage)) !== branch
    ) {
      throw businessRule("仓库克隆失败，请确认服务端可访问仓库且默认分支存在。");
    }
    if (lstatSync(checkout, { throwIfNoEntry: false }))
      throw businessRule("代码目录已被占用，请使用新的工作目录或项目名称。");
    renameSync(stage, checkout);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

export function prepareProjectDocuments(root: string, alreadyOwned: boolean): string {
  const docs = directory(join(root, "docs"), true);
  const documents = directory(join(docs, "areq"), true);
  if (!alreadyOwned && readdirSync(documents).length) {
    throw businessRule("共享文档目录已有内容，请为项目选择独立工作目录。");
  }
  return documents;
}

export function projectDocumentDirectory(storageDirectory: string): string {
  return directory(join(directory(join(storageDirectory, "docs")), "areq"));
}

function publishedPath(irId: string, file: AIReqMaterialView): string {
  const source = file.srId ? prototypeChangeRoot(file.srId) : prototypeIrRoot(irId);
  const parts = file.path.slice(source.length + 1).split("/");
  if (
    !file.path.startsWith(source + "/") ||
    !parts.every(isProjectPathSegment) ||
    (file.srId && !isProjectPathSegment(file.srId))
  )
    throw businessRule("需求文档路径无效，无法发布。");
  return file.srId ? [file.srId, ...parts].join("/") : parts.join("/");
}

/** Rebase links between exported files onto the shared IR/SR directory layout. */
function rebaseDocumentLinks(
  content: string,
  sourcePath: string,
  destination: string,
  paths: ReadonlyMap<string, string>,
) {
  return content.replace(/\]\(([^\s)#]+)(#[^\s)]*)?\)/g, (link, href: string, hash?: string) => {
    const target = paths.get(posix.normalize(posix.join(posix.dirname(sourcePath), href)));
    if (!target) return link;
    return `](${posix.relative(posix.dirname(destination), target)}${hash ?? ""})`;
  });
}

function currentDocumentSnapshot(documents: string, irId: string): string | undefined {
  if (!isProjectPathSegment(irId)) throw businessRule("需求文档路径无效，无法发布。");
  const target = join(documents, irId);
  const stat = lstatSync(target, { throwIfNoEntry: false });
  if (!stat) return undefined;
  if (!stat.isSymbolicLink()) throw businessRule("需求文档目录已被占用。");
  const stage = readlinkSync(target);
  if (!/^\.ir-[a-zA-Z0-9]+$/.test(stage)) throw businessRule("需求文档目录已被占用。");
  return join(documents, stage);
}

function discardSnapshot(path: string | undefined) {
  if (!path) return;
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // 已发布的目录不因清理旧版本失败而回滚。
  }
}

export function removeRequirementDocuments(documents: string, irId: string): void {
  const previous = currentDocumentSnapshot(documents, irId);
  if (previous) unlinkSync(join(documents, irId));
  discardSnapshot(previous);
}

/** Publish a full IR in one rename so existing developer links always resolve to one snapshot. */
export function publishRequirementDocuments(
  documents: string,
  irId: string,
  files: readonly AIReqMaterialView[],
): void {
  const previous = currentDocumentSnapshot(documents, irId);
  const target = join(documents, irId);
  const paths = new Map(files.map((file) => [file.path, publishedPath(irId, file)]));
  const stage = mkdtempSync(join(documents, ".ir-"));
  const link = join(documents, basename(stage) + ".link");
  try {
    // mkdtemp 默认只允许进程用户访问。共享目录中的快照也要能被开发环境读取。
    chmodSync(stage, 0o755);
    for (const file of files) {
      const destination = paths.get(file.path)!;
      const output = join(stage, destination);
      createSharedDirectories(dirname(output));
      if (file.content === undefined) throw businessRule("部分文档无法读取，请重试后再发布。");
      const content = file.path.endsWith(".md")
        ? rebaseDocumentLinks(file.content, file.path, destination, paths)
        : file.content;
      writeFileSync(output, content, { flag: "wx" });
      chmodSync(output, 0o644);
    }
    symlinkSync(basename(stage), link, "dir");
    renameSync(link, target);
  } catch (error) {
    rmSync(link, { force: true });
    discardSnapshot(stage);
    throw error;
  }
  discardSnapshot(previous);
}
