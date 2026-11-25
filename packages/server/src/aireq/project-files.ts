import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import * as fs from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  toNamespacedPath,
} from "node:path";
import type { AIReqMaterialView } from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import { prototypeChangeRoot, prototypeIrRoot } from "./proposal-storage.js";
import type { ProductionStore } from "./production-store.js";

export const sharedPublicationPrefix = "shared-publication:";

export function queueSharedDocument(store: ProductionStore, projectId: string, irId: string): void {
  store.set(sharedPublicationPrefix + JSON.stringify([projectId, irId]), { projectId, irId });
}

const usePhysicalSnapshots = process.platform === "win32";
const snapshotOwnerFile = ".aireq-ir";

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
  // Bun 在 Windows 的递归 mkdir 返回扩展路径；先统一表示，再做严格的祖先判断。
  let current = toNamespacedPath(resolve(first));
  const remainder = relative(current, toNamespacedPath(path));
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
  const entries = files.map((file) => {
    const path = paths.get(file.path)!;
    if (file.content === undefined) throw businessRule("部分文档无法读取，请重试后再发布。");
    const content = file.path.endsWith(".md")
      ? rebaseDocumentLinks(file.content, file.path, path, paths)
      : file.content;
    return { path, content };
  });
  if (usePhysicalSnapshots) entries.push({ path: snapshotOwnerFile, content: irId });
  return entries;
}

/** 新项目目录尚未公开，复制当前文档时不占用 HTTP 和 WebSocket 的事件循环。 */
export async function publishInitialProjectDocuments(
  documents: string,
  requirements: readonly RequirementDocuments[],
): Promise<() => Promise<void>> {
  const created: { stage: string; published?: string }[] = [];
  const discard = async () => {
    await Promise.allSettled(
      created.map(async ({ stage, published }) => {
        if (published) {
          // 移除本次发布创建的入口。Windows 上该入口就是已经移入的实体目录。
          if (usePhysicalSnapshots) await fs.rm(published, { recursive: true, force: true });
          else await fs.unlink(published);
        }
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
      const target = join(documents, irId);
      if (usePhysicalSnapshots) await fs.rename(stage, target);
      else await fs.symlink(basename(stage), target, "dir");
      entry.published = target;
    }
    return discard;
  } catch (error) {
    await discard();
    throw error;
  }
}

async function matchesPublishedFiles(
  directoryPath: string,
  expected: Map<string, string>,
  prefix = "",
): Promise<boolean> {
  for (const entry of await fs.readdir(directoryPath, { withFileTypes: true })) {
    const path = join(directoryPath, entry.name);
    const key = posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      if (!(await matchesPublishedFiles(path, expected, key))) return false;
    } else if (
      !entry.isFile() ||
      !expected.has(key) ||
      (await fs.readFile(path, "utf8")) !== expected.get(key)
    ) {
      return false;
    } else {
      expected.delete(key);
    }
  }
  return true;
}

async function matchesSeedDocuments(
  documents: string,
  requirements: readonly RequirementDocuments[],
  entries: string[],
): Promise<boolean> {
  const visible = entries.filter((name) => !name.startsWith("."));
  if (visible.length !== requirements.length) return false;
  const names = new Set(visible);
  for (const { irId, files } of requirements) {
    if (!names.has(irId)) return false;
    let path = join(documents, irId);
    if (!usePhysicalSnapshots) {
      if (!(await fs.lstat(path)).isSymbolicLink()) return false;
      const target = await fs.readlink(path);
      if (!/^\.ir-[a-zA-Z0-9]+$/.test(target) || !entries.includes(target)) return false;
      path = join(documents, target);
    }
    if (!(await fs.lstat(path)).isDirectory()) return false;
    const expected = new Map(
      publishedFiles(irId, files).map(({ path, content }) => [path, content]),
    );
    if (!(await matchesPublishedFiles(path, expected)) || expected.size) return false;
  }
  return true;
}

/** 固定目录仅认领空目录或同一示例项目留下的输出。 */
export async function prepareSeedProjectDocuments(
  projectId: string,
  workDirectory: string,
  storageDirectory: string,
  requirements: readonly RequirementDocuments[],
): Promise<void> {
  const marker = join(storageDirectory, ".aireq-demo-project");
  const ownership = await fs.lstat(marker).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (ownership && (!ownership.isFile() || (await fs.readFile(marker, "utf8")) !== projectId))
    throw businessRule("示例工作目录已由其他项目使用。");
  const documents = await prepareProjectDocuments(
    workDirectory,
    storageDirectory,
    Boolean(ownership),
  );
  if (!ownership) await fs.writeFile(marker, projectId, { flag: "wx" });
  const entries = await fs.readdir(documents);
  if (await matchesSeedDocuments(documents, requirements, entries)) return;
  if (!entries.length) {
    await publishInitialProjectDocuments(documents, requirements);
    return;
  }

  // 原型重启后按当前样例重新发布。将上一轮不同的输出移入隐藏目录，保留原文件。
  const stage = await fs.mkdtemp(join(dirname(documents), ".areq-startup-"));
  try {
    await publishInitialProjectDocuments(stage, requirements);
    await fs.chmod(stage, 0o755);
    const archived = await fs.mkdtemp(join(dirname(documents), ".areq-previous-"));
    const previous = join(archived, "areq");
    await fs.rename(documents, previous);
    try {
      await fs.rename(stage, documents);
    } catch (error) {
      await fs.rename(previous, documents);
      throw error;
    }
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

function currentDocumentSnapshot(
  documents: string,
  irId: string,
): { path: string; kind: "directory" | "link" } | undefined {
  if (!isProjectPathSegment(irId)) throw businessRule("需求文档路径无效，无法发布。");
  const target = join(documents, irId);
  const stat = lstatSync(target, { throwIfNoEntry: false });
  if (!stat) return undefined;
  if (usePhysicalSnapshots && stat.isDirectory()) {
    const marker = join(target, snapshotOwnerFile);
    if (
      lstatSync(marker, { throwIfNoEntry: false })?.isFile() &&
      readFileSync(marker, "utf8") === irId
    ) {
      return { path: target, kind: "directory" };
    }
  }
  if (!stat.isSymbolicLink()) throw businessRule("需求文档目录已被占用。");
  const stage = readlinkSync(target);
  if (!/^\.ir-[a-zA-Z0-9]+$/.test(stage)) throw businessRule("需求文档目录已被占用。");
  return { path: join(documents, stage), kind: "link" };
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
  if (!previous) return;
  if (previous.kind === "directory") {
    const removal = mkdtempSync(join(documents, ".ir-removed-"));
    try {
      renameSync(previous.path, join(removal, "snapshot"));
    } finally {
      discardSnapshot(removal);
    }
    return;
  }
  unlinkSync(join(documents, irId));
  discardSnapshot(previous.path);
}

function publishPhysicalSnapshot(
  stage: string,
  target: string,
  previous: ReturnType<typeof currentDocumentSnapshot>,
): void {
  // Windows 标准用户可以重命名普通目录。目录替换失败时恢复上一版。
  const backup = stage + ".previous";
  if (previous) renameSync(target, backup);
  try {
    renameSync(stage, target);
  } catch (error) {
    if (previous) renameSync(backup, target);
    throw error;
  }
  if (previous) discardSnapshot(backup);
  if (previous?.kind === "link") discardSnapshot(previous.path);
}

/** Publish a complete IR snapshot at the stable path used by the developer's link. */
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
    if (usePhysicalSnapshots) {
      publishPhysicalSnapshot(stage, target, previous);
      return;
    }
    symlinkSync(basename(stage), link, "dir");
    renameSync(link, target);
  } catch (error) {
    rmSync(link, { force: true });
    discardSnapshot(stage);
    throw error;
  }
  discardSnapshot(previous?.path);
}
