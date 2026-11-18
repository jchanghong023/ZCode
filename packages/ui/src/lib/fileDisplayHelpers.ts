export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function trimTrailingSeparator(path: string): string {
  return path.replace(/\/+$/, "");
}

export function resolveIconName(fileName: string) {
  if (/\.(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/i.test(fileName)) return "image";
  if (
    /\.(?:[cm]?[jt]sx?|py|rs|go|java|c|cpp|h|cs|css|html?|jsonl?|php|rb|sh|bash|zsh|sql|vue|svelte|ya?ml|toml)$/i.test(
      fileName,
    )
  )
    return "code";
  return "document";
}
