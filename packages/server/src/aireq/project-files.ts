import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import * as fs from "node:fs/promises";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
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

function directory(path: string) {
  if (!lstatSync(path).isDirectory()) throw businessRule("项目目录已被文件或软链接占用。");
  return path;
}

function* newlyCreatedDirectories(path: string, first: string) {
  // 用有界的相对路径枚举新建目录，避免路径拼写不一致时在根目录循环。
  let current = resolve(first);
  const remainder = relative(current, path);
  if (
    dirname(current) === current ||
    isAbsolute(remainder) ||
    remainder === ".." ||
    remainder.startsWith(".." + sep)
  )
    throw businessRule("无法确定新建的工作目录。");
  yield current;
  if (!remainder) return;
  for (const name of remainder.split(sep)) {
    current = join(current, name);
    yield current;
  }
}

function createSharedDirectories(path: string): void {
  const first = mkdirSync(path, { recursive: true });
  if (!first) return;
  for (const created of newlyCreatedDirectories(path, first)) chmodSync(created, 0o755);
}

async function createSharedDirectoriesAsync(path: string): Promise<void> {
  const first = await fs.mkdir(path, { recursive: true });
  if (!first) return;
  for (const created of newlyCreatedDirectories(path, first)) await fs.chmod(created, 0o755);
}

export async function resolveProjectDirectory(workDirectory: string): Promise<string> {
  try {
    return await fs.realpath(workDirectory);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "ENOENT" ||
      dirname(workDirectory) === workDirectory
    )
      throw businessRule("无法访问项目工作目录，请检查服务端路径及权限。");
    return join(await resolveProjectDirectory(dirname(workDirectory)), basename(workDirectory));
  }
}

async function ensureSharedDirectory(path: string): Promise<void> {
  try {
    await fs.mkdir(path);
    await fs.chmod(path, 0o755);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  if (!(await fs.lstat(path)).isDirectory()) throw businessRule("项目目录已被文件或软链接占用。");
}

export async function prepareProjectDocuments(
  workDirectory: string,
  storageDirectory: string,
  alreadyOwned: boolean,
): Promise<string> {
  await createSharedDirectoriesAsync(storageDirectory);
  if ((await fs.realpath(workDirectory)) !== storageDirectory)
    throw businessRule("工作目录已变化，请核对路径后重试。");
  const docs = join(storageDirectory, "docs");
  await ensureSharedDirectory(docs);
  const documents = join(docs, "areq");
  await ensureSharedDirectory(documents);
  if (!alreadyOwned && (await fs.readdir(documents)).length) {
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

interface RequirementDocuments {
  irId: string;
  files: readonly AIReqMaterialView[];
}

export interface ProjectDocumentSnapshot {
  requirements: readonly RequirementDocuments[];
  isCurrent(): boolean;
}

function publishedFiles(irId: string, files: readonly AIReqMaterialView[]) {
  const paths = new Map(files.map((file) => [file.path, publishedPath(irId, file)]));
  return files.map((file) => {
    const path = paths.get(file.path)!;
    if (file.content === undefined) throw businessRule("部分文档无法读取，请重试后再发布。");
    const content = file.path.endsWith(".md")
      ? rebaseDocumentLinks(file.content, file.path, path, paths)
      : file.content;
    return { path, content };
  });
}

/** 新项目目录尚未公开，复制当前文档时不占用 HTTP 和 WebSocket 的事件循环。 */
export async function publishInitialProjectDocuments(
  documents: string,
  requirements: readonly RequirementDocuments[],
): Promise<() => Promise<void>> {
  const created: { stage: string; link?: string }[] = [];
  const discard = async () => {
    await Promise.allSettled(
      created.map(async ({ stage, link }) => {
        if (link) await fs.unlink(link);
        await fs.rm(stage, { recursive: true, force: true });
      }),
    );
  };
  try {
    for (const { irId, files } of requirements) {
      if (!isProjectPathSegment(irId)) throw businessRule("需求文档路径无效，无法发布。");
      const stage = await fs.mkdtemp(join(documents, ".ir-"));
      const entry: (typeof created)[number] = { stage };
      created.push(entry);
      for (const { path, content } of publishedFiles(irId, files)) {
        const target = join(stage, path);
        await createSharedDirectoriesAsync(dirname(target));
        await fs.writeFile(target, content, { flag: "wx" });
        await fs.chmod(target, 0o644);
      }
      await fs.chmod(stage, 0o755);
      const link = join(documents, irId);
      await fs.symlink(basename(stage), link, "dir");
      entry.link = link;
    }
    return discard;
  } catch (error) {
    await discard();
    throw error;
  }
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
  const entries = publishedFiles(irId, files);
  const stage = mkdtempSync(join(documents, ".ir-"));
  const link = join(documents, basename(stage) + ".link");
  try {
    // mkdtemp 默认只允许进程用户访问。共享目录中的快照也要能被开发环境读取。
    chmodSync(stage, 0o755);
    for (const { path, content } of entries) {
      const output = join(stage, path);
      createSharedDirectories(dirname(output));
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
