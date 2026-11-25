import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { SkillSummary } from "@zcode/shared";
import { PROTOTYPE_BACKEND } from "./backend.js";
import { businessRule } from "./errors.js";
import { readPrototypeProjectSettings } from "./project-settings.js";
import type { ProductionStore } from "./production-store.js";

export function productionSkillRoots(store: ProductionStore, workspacePath?: string) {
  const roots = [
    {
      logicalPath: PROTOTYPE_BACKEND.userSkillsDirectory,
      directory: join(store.root, "skills", "shared"),
    },
  ];
  for (const project of readPrototypeProjectSettings().projects) {
    if (workspacePath !== undefined && workspacePath !== project.root) continue;
    roots.push({
      logicalPath: project.root + "/.omp/skills",
      directory: join(store.root, "projects", project.id, ".omp", "skills"),
    });
  }
  return roots;
}

/** A skill is published as a directory on the server-owned volume. Never follow links out of it. */
function directoryPath(root: string, path: string, create: boolean): string | undefined {
  const tail = relative(resolve(root), path);
  if (tail === ".." || tail.startsWith(".." + sep) || isAbsolute(tail))
    throw businessRule("技能目录超出部署范围。");
  let directory = realpathSync(root);
  for (const component of tail.split(sep).filter(Boolean)) {
    directory = join(directory, component);
    if (create) {
      try {
        mkdirSync(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    const stat = lstatSync(directory, { throwIfNoEntry: false });
    if (!stat) return undefined;
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw businessRule("技能目录必须位于当前部署的数据目录内。");
  }
  return directory;
}

export function skillMetadata(body: string, expectedName: string) {
  const frontmatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body)?.[1];
  let parsed: unknown;
  try {
    if (frontmatter !== undefined) parsed = Bun.YAML.parse(frontmatter);
  } catch {
    throw businessRule("SKILL.md 的 YAML 元数据无效。");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("name" in parsed) ||
    parsed.name !== expectedName ||
    !("description" in parsed) ||
    typeof parsed.description !== "string" ||
    !parsed.description.trim()
  ) {
    throw businessRule("SKILL.md 须包含与候选标识相同的 name 和非空 description。");
  }
  return { name: expectedName, description: parsed.description.trim() };
}

export function readPublishedSkills(
  store: ProductionStore,
  workspacePath?: string,
): SkillSummary[] {
  const roots = productionSkillRoots(store, workspacePath ?? "");
  const skills: SkillSummary[] = [];
  for (const root of roots) {
    const directory = directoryPath(store.root, root.directory, false);
    if (!directory) continue;
    for (const child of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (!child.isDirectory() || child.name.startsWith(".")) continue;
      const main = join(directory, child.name, "SKILL.md");
      if (!lstatSync(main, { throwIfNoEntry: false })?.isFile()) continue;
      const body = readFileSync(main, "utf8");
      const { name, description } = skillMetadata(body, child.name);
      const logical = root.logicalPath + "/" + name;
      skills.push({
        id: "skill:" + logical,
        name,
        description,
        body,
        path: logical + "/SKILL.md",
        scope: root.logicalPath === PROTOTYPE_BACKEND.userSkillsDirectory ? "user" : "workspace",
        enabled: true,
      });
    }
  }
  return skills;
}

type PreparedPublication = { directory: string; inode: string; staging: string; digest: string };
function fileIdentity(path: string): string | undefined {
  const info = lstatSync(path, { bigint: true, throwIfNoEntry: false });
  return info?.isDirectory() ? String(info.dev) + ":" + String(info.ino) : undefined;
}

export function publishSkillFiles(
  store: ProductionStore,
  workspacePath: string,
  name: string,
  files: { path: string; content: string }[],
  scope: "user" | "workspace",
  operation: string,
  digest: string,
): string {
  const logicalRoot =
    scope === "user" ? PROTOTYPE_BACKEND.userSkillsDirectory : workspacePath + "/.omp/skills";
  const root = productionSkillRoots(store, workspacePath).find(
    (item) => item.logicalPath === logicalRoot,
  );
  if (!root) throw businessRule("技能保存范围无效。");
  const directory = directoryPath(store.root, root.directory, true)!;
  const target = join(directory, name);
  const key = "skill-publication:" + createHash("sha256").update(operation).digest("hex");
  const previous = store.get<PreparedPublication>(key);
  const logicalPath = logicalRoot + "/" + name + "/SKILL.md";
  if (previous && (previous.directory !== target || previous.digest !== digest))
    throw businessRule("保存操作已有不同的目标或预览版本。");
  // 数据目录整体重启时，目录可能已发布而 RPC 收据尚未提交。只认本次暂存目录的文件系统身份。
  if (previous && fileIdentity(target) === previous.inode) return logicalPath;
  if (lstatSync(target, { throwIfNoEntry: false }))
    throw businessRule("目标目录已有同名技能，请修改保存标识。");
  if (previous && fileIdentity(previous.staging) === previous.inode) {
    renameSync(previous.staging, target);
    return logicalPath;
  }
  const staging = mkdtempSync(join(directory, ".aireq-staging-"));
  try {
    for (const file of files) {
      const dest = join(staging, ...file.path.split("/"));
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, file.content, { encoding: "utf8", flag: "wx", flush: true });
    }
    const inode = fileIdentity(staging)!;
    store.set(key, { directory: target, staging, inode, digest });
    renameSync(staging, target);
  } finally {
    // 仅清理本次在技能根下创建的临时目录，发布完成后该路径已经不存在。
    if (dirname(staging) === directory && basename(staging).startsWith(".aireq-staging-"))
      rmSync(staging, { recursive: true, force: true });
  }
  return logicalPath;
}
