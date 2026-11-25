import { z } from "zod";

export const workspaceFileSearchInputSchema = z.strictObject({
  rootPath: z.string(),
  query: z.string(),
  limit: z.number().optional(),
});
export const filePathInputSchema = z.strictObject({ path: z.string() });
export const existingFilesInputSchema = z.strictObject({ paths: z.array(z.string()) });
export const fileRangeInputSchema = z.strictObject({
  ...filePathInputSchema.shape,
  offset: z.int().nonnegative(),
  length: z.int().nonnegative(),
});

export function requireSingleFileRequest(argumentCount: number): void {
  if (argumentCount !== 1) {
    throw Object.assign(new Error("文件操作必须接收一个请求对象。"), {
      code: "INVALID_ARGUMENT",
      publicMessage: true,
    });
  }
}

/** MIME 取实际容器签名，不用扩展名将普通文本伪装成图片或媒体。 */
export function mediaTypeOf(bytes: Buffer): string | undefined {
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
