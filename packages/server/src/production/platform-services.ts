import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, stat, type FileHandle } from "node:fs/promises";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import {
  IFileService,
  IProjectService,
  ISettingService,
  type ServiceCollection,
  type WebAppSettings,
  type WebFileService,
  type WebWorkspaceFileEntry,
} from "@zcode/services";
import { productionSkillRoots, type ProductionStore } from "../aireq/contract.js";
import { ProjectDirectoryService } from "../project-directory.js";
import type { MockRuntime } from "../mock/runtime.js";
import {
  existingFilesInputSchema,
  filePathInputSchema,
  fileRangeInputSchema,
  mediaTypeOf,
  requireSingleFileRequest,
  workspaceFileSearchInputSchema,
} from "../web-file-contract.js";
import { WebSettings } from "../web-settings.js";

type Mount = { logicalPath: string; directory: string };
type FileNode =
  | { type: "directory" }
  | { type: "file"; physical: string; size: number; mtimeMs: number };
const notFound = () => new Error("文件或目录不存在。");

function within(root: string, path: string): boolean {
  const distance = relative(root, path);
  return !isAbsolute(distance) && distance !== ".." && !distance.startsWith(".." + sep);
}
function matches(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith("/") ? root : root + "/");
}
function validSegment(name: string): boolean {
  return (
    name !== ".." && !/\p{Cc}|:/u.test(name) && !name.toLowerCase().startsWith(".aireq-staging-")
  );
}
function absent(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** 浏览器只能访问正式服务发布的文件。OMP 工作目录、数据库和收发目录均属于其他 owner。 */
export class PublishedFileService implements WebFileService {
  private readonly files: string;
  constructor(private readonly store: ProductionStore) {
    this.files = join(store.root, "files");
  }

  private mounts(): Mount[] {
    return [...productionSkillRoots(this.store), { logicalPath: "/", directory: this.files }].sort(
      (a, b) => b.logicalPath.length - a.logicalPath.length,
    );
  }

  private logicalPath(input: string): string | undefined {
    const name = input.replaceAll("\\", "/");
    if (name.startsWith("//") || name.split("/").includes("..")) return undefined;
    let path = input;
    if (isAbsolute(input) && within(this.files, resolve(input))) path = relative(this.files, input);
    const parts = path
      .replaceAll("\\", "/")
      .split("/")
      .filter((p) => p && p !== ".");
    return parts.every(validSegment) ? "/" + parts.join("/") : undefined;
  }

  private async physical(logical: string, mounts: Mount[]): Promise<string | undefined> {
    const mount = mounts.find((item) => matches(logical, item.logicalPath));
    if (!mount || !within(this.store.root, mount.directory)) return;
    const path = join(mount.directory, ...logical.slice(mount.logicalPath.length).split("/"));
    if (!within(mount.directory, path)) return;
    try {
      const root = await realpath(this.store.root);
      const expected = resolve(root, relative(this.store.root, path));
      const actual = await realpath(path);
      if (relative(expected, actual) !== "" || !within(root, actual)) return;
      return actual;
    } catch (error) {
      if (!absent(error)) throw error;
    }
  }

  private async lookup(logical: string, mounts: Mount[]): Promise<FileNode | undefined> {
    const physical = await this.physical(logical, mounts);
    if (physical) {
      try {
        const entry = await lstat(physical);
        if (entry.isDirectory()) return { type: "directory" };
        if (entry.isFile())
          return { type: "file", physical, size: entry.size, mtimeMs: entry.mtimeMs };
      } catch (error) {
        if (!absent(error)) throw error;
      }
    }
    // 只有目录确已发布时，才向其逻辑祖先提供可遍历的目录投影。
    for (const mount of mounts) {
      if (
        mount.logicalPath !== logical &&
        matches(mount.logicalPath, logical) &&
        (await this.physical(mount.logicalPath, mounts))
      ) {
        return { type: "directory" };
      }
    }
    return undefined;
  }

  private async children(logical: string, mounts: Mount[]): Promise<string[]> {
    const names = new Set<string>();
    const physical = await this.physical(logical, mounts);
    if (physical) {
      for (const entry of await readdir(physical, { withFileTypes: true })) {
        if ((entry.isDirectory() || entry.isFile()) && validSegment(entry.name))
          names.add(entry.name);
      }
    }
    for (const mount of mounts) {
      if (mount.logicalPath === logical || !matches(mount.logicalPath, logical)) continue;
      const first = posix.relative(logical, mount.logicalPath).split("/")[0];
      if (first && (await this.physical(mount.logicalPath, mounts))) names.add(first);
    }
    return [...names].sort();
  }

  async searchWorkspaceFiles(
    params: Parameters<WebFileService["searchWorkspaceFiles"]>[0],
  ): Promise<WebWorkspaceFileEntry[]> {
    requireSingleFileRequest(arguments.length);
    const { rootPath, query, limit = 50 } = workspaceFileSearchInputSchema.parse(params);
    const root = this.logicalPath(rootPath),
      mounts = this.mounts();
    if (!root || (await this.lookup(root, mounts))?.type !== "directory") throw notFound();
    const result: WebWorkspaceFileEntry[] = [],
      needle = query.trim().toLowerCase();
    if (!needle || limit <= 0) return result;
    const visit = async (directory: string): Promise<void> => {
      for (const name of await this.children(directory, mounts)) {
        const child = posix.join(directory, name);
        const node = await this.lookup(child, mounts);
        if (node?.type === "directory") await visit(child);
        else if (node?.type === "file") {
          const relativePath = posix.relative(root, child);
          if (relativePath.toLowerCase().includes(needle)) {
            const path = rootPath
              ? posix.join(rootPath.replaceAll("\\", "/"), relativePath)
              : child;
            result.push({ path, relativePath });
          }
        }
        if (result.length >= limit) return;
      }
    };
    await visit(root);
    return result;
  }

  async stat(params: { path: string }) {
    requireSingleFileRequest(arguments.length);
    const logical = this.logicalPath(filePathInputSchema.parse(params).path);
    const entry = logical && (await this.lookup(logical, this.mounts()));
    if (!entry) throw notFound();
    if (entry.type === "directory") return entry;
    return { type: entry.type, size: entry.size, mtimeMs: entry.mtimeMs };
  }

  async checkFilesExist(params: { paths: string[] }) {
    requireSingleFileRequest(arguments.length);
    const mounts = this.mounts(),
      found: string[] = [];
    for (const path of existingFilesInputSchema.parse(params).paths) {
      const logical = this.logicalPath(path);
      if (logical && (await this.lookup(logical, mounts))) found.push(path);
    }
    return found;
  }

  private async withFile<T>(
    path: string,
    read: (file: FileHandle, size: number) => Promise<T>,
  ): Promise<T> {
    const logical = this.logicalPath(path),
      mounts = this.mounts();
    const node = logical && (await this.lookup(logical, mounts));
    if (!logical || !node || node.type !== "file") throw notFound();
    const file = await open(
      node.physical,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
    );
    try {
      const opened = await file.stat();
      const bound = await this.physical(logical, mounts);
      if (!bound || !opened.isFile()) throw notFound();
      const current = await stat(bound);
      if (current.dev !== opened.dev || current.ino !== opened.ino) throw notFound();
      return await read(file, opened.size);
    } finally {
      await file.close();
    }
  }

  async readMediaPreview(params: { path: string }) {
    requireSingleFileRequest(arguments.length);
    return this.withFile(filePathInputSchema.parse(params).path, async (file) => {
      const bytes = await file.readFile();
      const mediaType = mediaTypeOf(bytes);
      if (!mediaType) throw new Error("文件内容不是当前可预览的媒体格式。");
      return { mediaType, dataBase64: bytes.toString("base64") };
    });
  }

  async readFileRange(params: {
    path: string;
    offset: number;
    length: number;
  }): Promise<Uint8Array> {
    requireSingleFileRequest(arguments.length);
    const { path, offset, length } = fileRangeInputSchema.parse(params);
    return this.withFile(path, async (file, size) => {
      const bytes = Buffer.alloc(Math.min(length, Math.max(0, size - offset)));
      let consumed = 0;
      while (consumed < bytes.length) {
        const { bytesRead } = await file.read(
          bytes,
          consumed,
          bytes.length - consumed,
          offset + consumed,
        );
        if (!bytesRead) break;
        consumed += bytesRead;
      }
      return bytes.subarray(0, consumed);
    });
  }
}

export async function registerProductionPlatformServices(
  services: ServiceCollection,
  runtime: MockRuntime,
  store: ProductionStore,
): Promise<void> {
  await mkdir(join(store.root, "files"), { recursive: true });
  services.register(IFileService, new PublishedFileService(store));
  services.register(IProjectService, new ProjectDirectoryService(runtime));
  services.register(
    ISettingService,
    new WebSettings(store.get<WebAppSettings>("web-settings"), (settings) =>
      store.set("web-settings", settings),
    ),
  );
}
