// 当前 Web 的虚拟文件；Skill 文件仍从其唯一 owner 读取。
// 收口原因：移除旧 Git／监听／媒体会话及无当前消费者的文件正文、目录、索引 RPC。
import * as nodePath from "node:path";
import { z } from "zod";

import type { WebFileService, WebWorkspaceFileEntry } from "@zcode/services";
import type { MockRuntime, VirtualFileNode } from "./runtime.js";
import { readPrototypeSkillNode } from "../aireq/contract.js";

const workspaceFileSearchInputSchema = z.strictObject({
  rootPath: z.string(),
  query: z.string(),
  limit: z.number().optional(),
});
const filePathInputSchema = z.strictObject({ path: z.string() });
const existingFilesInputSchema = z.strictObject({ paths: z.array(z.string()) });
const fileRangeInputSchema = z.strictObject({
  ...filePathInputSchema.shape,
  offset: z.int().nonnegative(),
  length: z.int().nonnegative(),
});

function requireSingleFileRequest(argumentCount: number): void {
  if (argumentCount !== 1) {
    throw Object.assign(new Error("文件操作必须接收一个请求对象。"), {
      code: "INVALID_ARGUMENT",
      publicMessage: true,
    });
  }
}

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

/** MIME 取实际容器签名，不用扩展名将普通文本伪装成图片或媒体。 */
function mediaTypeOf(bytes: Buffer): string | undefined {
  const starts = (signature: readonly number[]) =>
    bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  const ascii = (offset: number, length: number) =>
    bytes.toString("latin1", offset, offset + length);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (bytes.length >= 14 && ascii(0, 2) === "BM") return "image/bmp";
  if (starts([0x49, 0x49, 0x2a, 0]) || starts([0x4d, 0x4d, 0, 0x2a])) return "image/tiff";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "AVI ") return "video/x-msvideo";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (
    ascii(0, 3) === "ID3" ||
    (bytes.length >= 3 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 6) !== 0)
  )
    return "audio/mpeg";
  if (starts([0x1a, 0x45, 0xdf, 0xa3]) && bytes.subarray(0, 4096).includes(Buffer.from("webm")))
    return "video/webm";
  if (bytes.length >= 12 && ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (["avif", "avis"].includes(brand)) return "image/avif";
    if (["heic", "heix"].includes(brand)) return "image/heic";
    if (["M4A ", "M4B "].includes(brand)) return "audio/mp4";
    if (brand === "M4V ") return "video/x-m4v";
    if (brand === "qt  ") return "video/quicktime";
    if (["isom", "iso2", "mp41", "mp42", "avc1", "dash", "MSNV"].includes(brand))
      return "video/mp4";
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (
      /^\s*(?:<\?xml[^?]*\?>\s*)?<svg\b[^>]*\sxmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["'][^>]*>[\s\S]*<\/svg>\s*$/i.test(
        text,
      )
    )
      return "image/svg+xml";
  } catch {
    // 未识别的二进制不是 SVG；不要用 UTF-8 replacement 字符返回损坏的媒体。
  }
  return undefined;
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
