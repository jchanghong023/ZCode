import { type ReactElement } from "react";
import { getPathLeaf, isAbsoluteFilePath } from "@/lib/path.js";
import { normalizePath, trimTrailingSeparator, resolveIconName } from "@/lib/fileDisplayHelpers.js";

function fileIconUrl(path: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8493a7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const fileIcons = {
  document: fileIconUrl("M6 3h8l4 4v14H6z M14 3v5h4 M9 13h6 M9 17h5"),
  folder: fileIconUrl("M3 6h7l2 3h9v11H3z"),
  image: fileIconUrl("M3 4h18v16H3z M4 18l6-7 4 5 3-3 4 5 M16 8h.01"),
  code: fileIconUrl("M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16"),
};

export const FOLDER_FILE_ICON_SRC = fileIcons.folder;
let defaultFileDisplayBasePath: string | null = null;

export interface FileDisplayDescriptor {
  fileIcon: string;
  fileIconSrc: string;
  fileName: string;
  filePath: string | null;
  normalizedPath: string;
}

export interface FileDisplayOptions {
  basePath?: string;
  kind?: "file" | "directory";
  showIcon?: boolean;
  showFilePath?: boolean;
  iconSize?: number;
  className?: string;
  fileNameClassName?: string;
  filePathClassName?: string;
}

export function setDefaultFileDisplayBasePath(basePath: string | null) {
  defaultFileDisplayBasePath = basePath;
}

function stripBasePath(path: string, basePath?: string): string {
  if (!basePath) {
    return path;
  }

  const normalizedPath = trimTrailingSeparator(normalizePath(path));
  const normalizedBasePath = trimTrailingSeparator(normalizePath(basePath));

  if (normalizedPath === normalizedBasePath) {
    return "";
  }

  if (normalizedPath.startsWith(`${normalizedBasePath}/`)) {
    return normalizedPath.slice(normalizedBasePath.length + 1);
  }

  return path;
}

function buildFilePath(path: string, fileName: string): string | null {
  const normalizedPath = normalizePath(path);

  if (!normalizedPath || normalizedPath === fileName) {
    return null;
  }

  const fileNameIndex = normalizedPath.lastIndexOf(`/${fileName}`);
  if (fileNameIndex === -1) {
    return null;
  }

  const directoryPath = normalizedPath.slice(0, fileNameIndex + 1);
  return directoryPath.length > 0 ? directoryPath : null;
}

export function resolveFileDisplayDescriptor(
  filePath: string,
  options: Pick<FileDisplayOptions, "basePath" | "kind"> = {},
): FileDisplayDescriptor {
  const normalizedPath = normalizePath(filePath);
  const fileName = getPathLeaf(normalizedPath);
  const effectiveBasePath = options.basePath ?? defaultFileDisplayBasePath ?? undefined;
  const relativePath = stripBasePath(normalizedPath, effectiveBasePath);
  const resolvedFilePath = buildFilePath(relativePath, fileName);
  const fileIcon = options.kind === "directory" ? "folder" : resolveIconName(fileName);

  return {
    fileIcon,
    fileIconSrc: fileIcons[fileIcon],
    fileName,
    filePath: resolvedFilePath,
    normalizedPath,
  };
}

export function createFileDisplayDom(
  filePath: string,
  options: FileDisplayOptions = {},
): HTMLSpanElement {
  const descriptor = resolveFileDisplayDescriptor(filePath, {
    basePath: options.basePath,
    kind: options.kind,
  });
  const container = document.createElement("span");
  container.className =
    options.className ?? "inline-flex max-w-full items-center gap-1.5 align-middle";

  if (options.showIcon !== false) {
    const icon = document.createElement("img");
    icon.src = descriptor.fileIconSrc;
    icon.alt = "";
    icon.width = options.iconSize ?? 14;
    icon.height = options.iconSize ?? 14;
    icon.className = "shrink-0";
    icon.setAttribute("aria-hidden", "true");
    container.append(icon);
  }

  const primary = document.createElement("span");
  primary.className = options.fileNameClassName ?? "truncate text-[0.95em] leading-[1.6]";
  primary.textContent = descriptor.fileName;
  container.append(primary);

  if (options.showFilePath && descriptor.filePath) {
    const secondary = document.createElement("span");
    secondary.className =
      options.filePathClassName ?? "truncate text-[0.85em] text-muted-foreground";
    secondary.textContent = descriptor.filePath;
    container.append(secondary);
  }

  return container;
}

export function FileDisplayInline({
  path,
  options,
}: {
  path: string;
  options?: FileDisplayOptions;
}): ReactElement {
  const descriptor = resolveFileDisplayDescriptor(path, {
    basePath: options?.basePath,
    kind: options?.kind,
  });
  return (
    <span className={options?.className ?? "inline-flex max-w-full items-center gap-1 "}>
      {options?.showIcon !== false ? (
        <img
          src={descriptor.fileIconSrc}
          alt=""
          width={options?.iconSize ?? 16}
          height={options?.iconSize ?? 16}
          className="shrink-0"
          aria-hidden="true"
        />
      ) : null}
      <span
        className={
          options?.fileNameClassName ?? "truncate text-ui-base font-medium text-foreground"
        }
      >
        {descriptor.fileName}
      </span>
      {options?.showFilePath && descriptor.filePath ? (
        <span
          className={options.filePathClassName ?? "truncate text-ui-base text-foreground-subtlest"}
        >
          {descriptor.filePath}
        </span>
      ) : null}
    </span>
  );
}

export function FileDisplayIcon({
  src,
  size = 16,
  className,
}: {
  src: string;
  size?: number;
  className?: string;
}): ReactElement {
  return (
    <img src={src} alt="" width={size} height={size} className={className} aria-hidden="true" />
  );
}

export function getFileDisplayPath(filePath: string, basePath?: string): string {
  const normalizedPath = normalizePath(filePath);
  const pathWithoutBase = stripBasePath(normalizedPath, basePath);

  if (!pathWithoutBase) {
    return getPathLeaf(normalizedPath);
  }

  if (basePath || !isAbsoluteFilePath(pathWithoutBase)) {
    return pathWithoutBase;
  }

  return normalizedPath;
}
