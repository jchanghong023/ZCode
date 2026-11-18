import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const repositoryRoot = resolve(import.meta.dirname, "..");
export const noticesFileName = "THIRD-PARTY-NOTICES.md";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function readThirdPartyNotices(root = repositoryRoot) {
  // 开发和构建只消费已有声明；输入新鲜度由显式 license 检查负责，避免修改 skill 就阻断构建。
  return readFile(resolve(root, noticesFileName));
}

export async function readVerifiedNotices(root = repositoryRoot) {
  const manifest = JSON.parse(await readFile(resolve(root, "third-party/inventory.json"), "utf8"));
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported third-party inventory");
  const bytes = await readThirdPartyNotices(root);
  if (hash(bytes) !== manifest.noticesSha256)
    throw new Error("Third-party notices changed; regenerate the inventory");
  for (const [file, expected] of Object.entries(manifest.inputs)) {
    let text;
    try {
      text = await readFile(resolve(root, file), "utf8");
    } catch (error) {
      // 登记输入已从工作区删除时也不能当作“已退役”跳过，必须重新生成清单。
      throw new Error(
        `Third-party input is missing: ${file}. Run bun scripts/licenses.mjs notices`,
        { cause: error },
      );
    }
    // 工作区文本允许 Windows checkout 的 CRLF；原始许可和发行声明另用字节哈希校验。
    if (hash(text.replaceAll("\r\n", "\n")) !== expected) {
      throw new Error(`Third-party input changed: ${file}. Run bun scripts/licenses.mjs notices`);
    }
  }
  return bytes;
}

export function thirdPartyNoticesVitePlugin(root = repositoryRoot) {
  let base = "/";
  return {
    name: "zcode-third-party-notices",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: noticesFileName,
        source: await readThirdPartyNotices(root),
      });
    },
    transformIndexHtml: {
      order: "post",
      handler: () => [
        {
          tag: "link",
          attrs: {
            rel: "license",
            href: `${base}${noticesFileName}`,
          },
          injectTo: "head",
        },
      ],
    },
  };
}
