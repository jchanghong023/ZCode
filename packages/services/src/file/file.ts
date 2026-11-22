import type { FileMediaPreview, WorkspaceFileEntry } from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

export type WebFileMediaPreview = Pick<FileMediaPreview, "mediaType" | "dataBase64">;
export type WebWorkspaceFileEntry = Pick<WorkspaceFileEntry, "path" | "relativePath">;

// 只发布当前 mention、消息预览和下载读取；隐藏 Skill 文件事实由后端内部 owner 合并。
export interface WebFileService {
  /** Host 匹配并返回有界候选，避免 Renderer 下载完整文件索引。 */
  searchWorkspaceFiles(params: {
    rootPath: string;
    query: string;
    limit?: number;
  }): Promise<WebWorkspaceFileEntry[]>;
  stat(params: { path: string }): Promise<
    { type: "directory" } | { type: "file"; size: number; mtimeMs: number }
  >;
  checkFilesExist(params: { paths: string[] }): Promise<string[]>;
  readMediaPreview(params: { path: string }): Promise<WebFileMediaPreview>;
  /**
   * 按偏移读取文件的一段原始字节，供大二进制文件（如 PDF）按需分段加载。
   * 返回值必须保持顶层 Uint8Array：RPC 序列化只对顶层二进制走原始字节通道，
   * 嵌套在对象字段里会退化成 JSON+base64。EOF 时返回短数组。
   */
  readFileRange(params: { path: string; offset: number; length: number }): Promise<Uint8Array>;
}

// 修复：descriptor 必须描述实际 Web 返回值，不能沿用要求宿主路径的旧 stat 类型。
export const IFileService = createServiceDescriptor<WebFileService>(ServiceChannels.File);
