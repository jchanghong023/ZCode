// 当前 Web 的虚拟文件；Skill 文件仍从其唯一 owner 读取。
// 收口原因：移除旧 Git／监听／媒体会话及无当前消费者的文件正文、目录、索引 RPC。
import * as nodePath from "node:path";
import {
  workspaceFileSearchInputSchema,
  filePathInputSchema,
  existingFilesInputSchema,
  fileRangeInputSchema,
  requireSingleFileRequest,
  mediaTypeOf,
} from "../web-file-contract.js";

import type { WebFileService, WebWorkspaceFileEntry } from "@zcode/services";
import type { MockRuntime, VirtualFileNode } from "./runtime.js";
import { readPrototypeSkillNode } from "../aireq/contract.js";

// ── 虚拟文件系统工具 ──

function joinPath(root: string, segments: string[]): string {
  const sep = root.includes("\\") ? "\\" : "/";
  const normalized = segments.filter((segment) => segment.length > 0).join(sep);
  if (!normalized) return root;
  return root.endsWith(sep) ? root + normalized : root + sep + normalized;
}

function splitRelativePath(path: string): string[] {
  return path.split(/[\\/]+/).filter((segment) => segment.length > 0 && segment !== ".");
}

function resolveNode(root: VirtualFileNode, path: string): VirtualFileNode | null {
  let node: VirtualFileNode = root;
  for (const segment of splitRelativePath(path)) {
    if (node.kind !== "directory" || !node.children) return null;
    const next = node.children.get(segment);
    if (!next) return null;
    node = next;
  }
  return node;
}

/** 所有读取入口消费同一文件事实，二进制不能经过字符串重编码。 */
function fileBytes(node: VirtualFileNode): Buffer {
  return node.bytes ? Buffer.from(node.bytes) : Buffer.from(node.content ?? "", "utf8");
}

/** RPC 绝对路径统一映射到虚拟工作区根；Skill 私有文件事实仍走同一解析入口。 */
function toWorkspaceRelativePath(workspacePath: string, path: string): string {
  if (!path || !nodePath.isAbsolute(path)) return path;
  const root = nodePath.resolve(workspacePath);
  const resolved = nodePath.resolve(path);
  // Windows 盘符与目录大小写不敏感；POSIX 保持原样比较。
  const normalize =
    process.platform === "win32"
      ? (value: string) => value.toLowerCase()
      : (value: string) => value;
  const rootComparable = normalize(root).replace(/[\\/]+$/, "");
  const resolvedComparable = normalize(resolved);
  if (resolvedComparable === rootComparable) return "";
  const prefix = `${rootComparable}${nodePath.sep}`;
  if (!resolvedComparable.startsWith(prefix)) return path;
  return resolved.slice(root.replace(/[\\/]+$/, "").length + 1);
}

export class MockFileService implements WebFileService {
  constructor(private readonly runtime: MockRuntime) {}

  /** 统一入口：绝对路径先收敛为工作区相对路径，相对路径按原样解析。 */
  private resolveVirtual(path: string): VirtualFileNode | null {
    const relativePath = toWorkspaceRelativePath(this.runtime.workspacePath, path);
    const absolutePath = nodePath.isAbsolute(path)
      ? path
      : joinPath(this.runtime.workspacePath, splitRelativePath(path));
    // 保存与读取共用 Skill 文件 owner；目录叠加保留原虚拟树，不复制已接纳正文。
    return (
      readPrototypeSkillNode(absolutePath, resolveNode(this.runtime.virtualRoot, relativePath)) ??
      null
    );
  }

  private requireNode(path: string, kind?: VirtualFileNode["kind"]): VirtualFileNode {
    const node = this.resolveVirtual(path);
    // 缺失和类型错误不能伪装成空内容；空文件只由真实 file 节点表达。
    if (!node) throw new Error("文件或目录不存在。");
    if (kind && node.kind !== kind) {
      throw new Error(kind === "file" ? "该路径是目录，不能作为文件读取。" : "该路径不是目录。");
    }
    return node;
  }

  async searchWorkspaceFiles(
    params: Parameters<WebFileService["searchWorkspaceFiles"]>[0],
  ): Promise<WebWorkspaceFileEntry[]> {
    requireSingleFileRequest(arguments.length);
    const { rootPath, query: rawQuery, limit } = workspaceFileSearchInputSchema.parse(params);
    const query = rawQuery.trim().toLowerCase();
    const results: WebWorkspaceFileEntry[] = [];
    const root = rootPath || this.runtime.workspacePath;
    const walk = (node: VirtualFileNode, relativeSegments: string[]) => {
      if (node.kind === "directory") {
        if (!node.children) return;
        for (const child of node.children.values()) {
          walk(child, [...relativeSegments, child.name]);
        }
        return;
      }
      if (!query) return;
      const relativePath = relativeSegments.join("/");
      if (node.name.toLowerCase().includes(query) || relativePath.toLowerCase().includes(query)) {
        results.push({
          path: joinPath(root, relativeSegments),
          relativePath,
        });
      }
    };
    walk(this.requireNode(root, "directory"), []);
    return results.slice(0, limit ?? 50);
  }

  async stat(params: { path: string }) {
    requireSingleFileRequest(arguments.length);
    const { path } = filePathInputSchema.parse(params);
    const node = this.requireNode(path);
    if (node.kind === "directory") return { type: "directory" as const };
    return { type: "file" as const, size: fileBytes(node).byteLength, mtimeMs: node.mtimeMs };
  }

  async checkFilesExist(params: { paths: string[] }) {
    requireSingleFileRequest(arguments.length);
    const { paths } = existingFilesInputSchema.parse(params);
    return paths.filter((path) => this.resolveVirtual(path) !== null);
  }

  async readMediaPreview(params: { path: string }) {
    requireSingleFileRequest(arguments.length);
    const { path } = filePathInputSchema.parse(params);
    const node = this.requireNode(path, "file");
    const bytes = fileBytes(node);
    const mediaType = mediaTypeOf(bytes);
    if (!mediaType) throw new Error("文件内容不是当前可预览的媒体格式。");
    // 与 stat/range 共用已保存的原始事实；不能用假图片或占位成功代替实际媒体。
    return {
      mediaType,
      dataBase64: bytes.toString("base64"),
    };
  }

  async readFileRange(params: {
    path: string;
    offset: number;
    length: number;
  }): Promise<Uint8Array> {
    requireSingleFileRequest(arguments.length);
    const { path, offset, length } = fileRangeInputSchema.parse(params);
    const node = this.requireNode(path, "file");
    return fileBytes(node).subarray(offset, offset + length);
  }
}
