import { promises as fs } from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import ts from "typescript";

function inside(root, file) {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function patternExpression(pattern) {
  const pieces = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(
    `^${pieces[0]}${pieces
      .slice(1)
      .map((piece, index) => `${index === 0 ? "(.*)" : "\\1"}${piece}`)
      .join("")}$`,
  );
}

async function actualFiles(dir) {
  const files = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if ((entry.isFile() || entry.isSymbolicLink()) && (await regularFile(dir, file)))
        files.push(file);
    }
  }
  await visit(dir);
  return files;
}

async function regularFile(dir, file) {
  try {
    // 修复原因：目录和指向包外的符号链接都不是有效公共文件入口。
    return (
      (await fs.stat(file)).isFile() && inside(await fs.realpath(dir), await fs.realpath(file))
    );
  } catch {
    return false;
  }
}

async function emittedFiles(dir) {
  const outputs = new Set();
  const configs = (await fs.readdir(dir)).filter((name) => /^tsconfig(?:\..+)?\.json$/.test(name));
  for (const name of configs) {
    const configFile = path.join(dir, name);
    // 修复原因：dist 入口只有在真实配置及其继承链允许 emit 时才成立，不能用 dist→src 猜测替代构建契约。
    const parsed = ts.getParsedCommandLineOfConfigFile(
      configFile,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic() {},
      },
    );
    if (!parsed || parsed.errors.length || parsed.options.noEmit) continue;
    for (const source of parsed.fileNames) {
      if (!inside(dir, source) || !(await regularFile(dir, source))) continue;
      if (parsed.options.rootDir && !inside(parsed.options.rootDir, source)) continue;
      // 声明输入本身不会再次生成声明；getOutputFileNames 处理 rootDir/outDir/declarationDir、JSX 和 .mts/.cts。
      if (/\.d\.[cm]?ts$/i.test(source)) continue;
      try {
        for (const output of ts.getOutputFileNames(
          parsed,
          source,
          !ts.sys.useCaseSensitiveFileNames,
        )) {
          if (inside(dir, output) && path.resolve(output) !== path.resolve(source))
            outputs.add(path.resolve(output));
        }
      } catch {
        // 无法由 TypeScript 建立输出映射的配置不能作为未构建入口的证据。
      }
    }
  }
  return outputs;
}

function entries(value, location = []) {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [{ target: value, location }];
  if (Array.isArray(value))
    return value.flatMap((item, index) => entries(item, [...location, `[${index}]`]));
  if (typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) => entries(item, [...location, key]));
  return [{ target: value, location }];
}

function publicTarget(pkg, specifier) {
  const subpath = specifier === pkg.name ? "." : `./${specifier.slice(pkg.name.length + 1)}`;
  const map = pkg.exports;
  if (
    typeof map === "string" ||
    Array.isArray(map) ||
    (map && !Object.keys(map).some((key) => key.startsWith(".")))
  ) {
    return subpath === "." ? entries(map) : [];
  }
  if (!map || typeof map !== "object") return [];
  if (Object.hasOwn(map, subpath)) return entries(map[subpath]);
  const patterns = Object.keys(map)
    .filter((key) => key.includes("*"))
    .sort((a, b) => b.indexOf("*") - a.indexOf("*") || b.length - a.length);
  for (const key of patterns) {
    const match = patternExpression(key).exec(subpath);
    if (match)
      return entries(map[key]).map((entry) => ({
        ...entry,
        target:
          typeof entry.target === "string" ? entry.target.replaceAll("*", match[1]) : entry.target,
      }));
  }
  return [];
}

/** 检查所有实际 workspace 包，增量检查时也覆盖所有入口。 */
export async function findMissingPackageEntrypoints(workspace) {
  const failures = [];
  const states = new Map();
  const packages = workspace.packages.map((pkg) => ({
    ...pkg,
    dir: path.resolve(workspace.cwd, pkg.dir),
  }));
  async function state(pkg) {
    if (!states.has(pkg.dir)) states.set(pkg.dir, { files: null, outputs: null });
    return states.get(pkg.dir);
  }
  async function validTarget(pkg, kind, target, seen = new Set()) {
    if (typeof target !== "string") return "target must be a string or null";
    if (!target.startsWith("./")) {
      if (kind !== "imports")
        return "exports target must start with ./ and stay inside the package";
      if (isBuiltin(target)) return null;
      const owner = packages.find(
        (item) => item.name && (target === item.name || target.startsWith(`${item.name}/`)),
      );
      if (!owner)
        return "external imports target is not a Node builtin or an existing workspace package";
      const identity = `${owner.dir}:${target}`;
      if (seen.has(identity)) return "cyclic workspace imports target";
      const nextSeen = new Set([...seen, identity]);
      const targets = publicTarget(owner, target);
      if (!targets.length) return "workspace imports target has no public export";
      for (const entry of targets) {
        const error = await validTarget(owner, "exports", entry.target, nextSeen);
        if (error) return `workspace imports target: ${error}`;
      }
      return null;
    }
    // 修复原因：path.resolve 会吞掉 ../，必须先按 Node 包目标规则拒绝越界及编码路径绕过。
    let decoded;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      return "target contains invalid URL encoding";
    }
    if (
      decoded.includes("\\") ||
      /%2f|%5c/i.test(target) ||
      decoded
        .slice(2)
        .split("/")
        .some((part) => part === ".." || part === "." || part.toLowerCase() === "node_modules")
    ) {
      return "target escapes the package or contains a forbidden path segment";
    }
    const absolute = path.resolve(pkg.dir, decoded);
    if (!inside(pkg.dir, absolute)) return "target escapes the package";
    if (!decoded.includes("*") && (await regularFile(pkg.dir, absolute))) return null;
    const cached = await state(pkg);
    if (decoded.includes("*")) {
      cached.files ??= await actualFiles(pkg.dir);
      const pattern = patternExpression(absolute);
      if (cached.files.some((file) => pattern.test(file))) return null;
    }
    cached.outputs ??= await emittedFiles(pkg.dir);
    const pattern = patternExpression(absolute);
    if ([...cached.outputs].some((file) => pattern.test(file))) return null;
    return decoded.includes("*")
      ? "wildcard matches no file or supported TypeScript output"
      : "target is not a file or supported TypeScript output";
  }
  for (const pkg of packages) {
    for (const kind of ["exports", "imports"]) {
      // 修复原因：逐一检查条件和数组分支，不能因 default 存在就隐藏 types/browser 等悬空入口。
      for (const { target, location } of entries(pkg[kind])) {
        const error = await validTarget(pkg, kind, target);
        if (!error) continue;
        const key = location.length ? location.join(" > ") : ".";
        const detail = `${kind} ${key} -> ${JSON.stringify(target)}`;
        failures.push({
          file: path.join(pkg.dir, "package.json"),
          detail,
          message: `${detail}: ${error}`,
        });
      }
    }
  }
  return failures;
}
