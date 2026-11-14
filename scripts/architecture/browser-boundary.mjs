import { isBuiltin } from "node:module";
import path from "node:path";

import { posix } from "./policy.mjs";
import { mappedImportTargets, resolveSpecifier, targetsOf } from "./resolver.mjs";
import { violation } from "./violations.mjs";

const BROWSER_CONDITIONS = ["browser", "import", "default"];

function matchesPackage(specifier, entrypoint) {
  return specifier === entrypoint || specifier.startsWith(`${entrypoint}/`);
}

function exportEntries(pkg) {
  if (!pkg.exports) return [];
  const entries = Object.entries(pkg.exports);
  return entries.some(([key]) => key.startsWith(".")) ? entries : [[".", pkg.exports]];
}

/** 浏览器边界独立于 managed 状态及增量范围；所有边仍复用同一个导入解析器。 */
export function browserBoundaryViolations({ cwd, policy, workspace, files, declarationsByFile }) {
  const config = policy.global;
  const knownFiles = new Set(files);
  const issues = [];
  const roots = new Set();
  const resolve = (from, specifier) =>
    resolveSpecifier(from, specifier, knownFiles, workspace, BROWSER_CONDITIONS);
  const report = (rule, file, detail, message) =>
    issues.push(
      violation({
        cwd,
        rule,
        file,
        detail,
        message,
        global: true,
      }),
    );
  const nodeEntrypointFiles = new Set();
  for (const specifier of config.nodeEntrypoints) {
    const file = resolve(path.join(cwd, "package.json"), specifier);
    if (!file) {
      report(
        "browser-policy",
        "architecture-policy.yaml",
        specifier,
        `Node 专用入口无法解析：${specifier}`,
      );
    } else {
      nodeEntrypointFiles.add(file);
    }
  }
  for (const scope of config.browserScopes) {
    const absolute = path.resolve(cwd, scope);
    const scoped = files.filter(
      (file) => file === absolute || file.startsWith(`${absolute}${path.sep}`),
    );
    if (!scoped.length)
      report(
        "browser-policy",
        "architecture-policy.yaml",
        scope,
        `浏览器源码范围没有文件：${scope}`,
      );
    for (const file of scoped) roots.add(file);
  }
  for (const name of config.browserPackages) {
    const pkg = workspace.byName.get(name);
    if (!pkg) {
      report("browser-policy", "architecture-policy.yaml", name, `浏览器公共包不存在：${name}`);
      continue;
    }
    for (const [key, value] of exportEntries(pkg)) {
      const specifier = key === "." ? name : `${name}/${key.slice(2)}`;
      if (config.nodeEntrypoints.some((entry) => matchesPackage(specifier, entry))) continue;
      if (!key.includes("*")) {
        const file = resolve(path.join(pkg.dir, "package.json"), specifier);
        if (file) roots.add(file);
      } else {
        // 通配公共面也必须治理；不能只检查当前调用方碰巧用到的子入口。
        for (const target of targetsOf(value, BROWSER_CONDITIONS)) {
          const pattern = path.resolve(pkg.dir, target);
          for (const file of files) if (path.matchesGlob(file, pattern)) roots.add(file);
        }
      }
    }
  }

  const forbidden = (file, specifier, seen = new Set()) => {
    if (
      isBuiltin(specifier) ||
      config.nativePackages.some((name) => matchesPackage(specifier, name))
    )
      return true;
    if (config.nodeEntrypoints.some((entry) => matchesPackage(specifier, entry))) return true;
    if (seen.has(specifier)) return false;
    seen.add(specifier);
    return mappedImportTargets(file, specifier, workspace, BROWSER_CONDITIONS).some((target) =>
      forbidden(file, target, seen),
    );
  };
  const edges = new Map();
  const reverseRuntime = new Map();
  const nodeOnly = new Set(nodeEntrypointFiles);
  for (const file of files) {
    const imports = (declarationsByFile.get(file) ?? []).map((declaration) => ({
      ...declaration,
      target: resolve(file, declaration.specifier),
      forbidden: forbidden(file, declaration.specifier),
    }));
    edges.set(file, imports);
    for (const entry of imports) {
      if (entry.typeOnly) continue;
      if (entry.forbidden) nodeOnly.add(file);
      if (entry.target) {
        if (!reverseRuntime.has(entry.target)) reverseRuntime.set(entry.target, []);
        reverseRuntime.get(entry.target).push(file);
      }
    }
  }
  const nodeQueue = [...nodeOnly];
  for (let i = 0; i < nodeQueue.length; i++) {
    for (const importer of reverseRuntime.get(nodeQueue[i]) ?? []) {
      if (!nodeOnly.has(importer)) {
        nodeOnly.add(importer);
        nodeQueue.push(importer);
      }
    }
  }

  const queue = [...roots];
  const reached = new Set(roots);
  for (let i = 0; i < queue.length; i++) {
    const file = queue[i];
    for (const entry of edges.get(file) ?? []) {
      const nodeTarget = entry.target && nodeOnly.has(entry.target);
      // 修复原因：type-only 不产生运行时依赖，但浏览器 DTO 也不能定义在 Node 实现里。
      const forbiddenType =
        entry.typeOnly &&
        (nodeTarget ||
          config.nodeEntrypoints.some((name) => matchesPackage(entry.specifier, name)));
      if (forbiddenType || (!entry.typeOnly && entry.forbidden)) {
        report(
          forbiddenType ? "browser-node-contract" : "browser-node-import",
          file,
          entry.specifier,
          forbiddenType
            ? `浏览器契约依赖 Node 专用实现：${entry.specifier}；提取浏览器安全 DTO/schema`
            : `浏览器运行时依赖 Node/原生入口：${entry.specifier}`,
        );
        continue;
      }
      if (entry.target && !reached.has(entry.target)) {
        reached.add(entry.target);
        queue.push(entry.target);
      }
    }
  }
  // 路径形式绕过 Node 子入口同样阻断；诊断使用仓库相对路径，保持跨机器指纹稳定。
  for (const file of nodeEntrypointFiles) {
    if (reached.has(file))
      report(
        "browser-node-entrypoint",
        file,
        posix(path.relative(cwd, file)),
        "浏览器依赖了 Node 专用入口文件",
      );
  }
  return issues;
}
