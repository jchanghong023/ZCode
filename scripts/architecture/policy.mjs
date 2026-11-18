import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse as parseYaml } from "yaml";
import { SOURCE_EXTENSIONS, resolveSpecifier } from "./resolver.mjs";

export { SOURCE_EXTENSIONS };

export function posix(value) {
  return value.split(path.sep).join("/");
}

function isSourceFile(file) {
  return SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension));
}

async function walk(root, files) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (["node_modules", "dist", "out", "coverage", ".git"].includes(entry.name)) continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) await walk(target, files);
    // 契约文档也是必需产物；只枚举源码会把实际存在的 CONTRACT.md 误报为缺失。
    else if (entry.isFile() && (isSourceFile(target) || entry.name === "CONTRACT.md"))
      files.push(target);
  }
}

function validatePolicy(raw, cwd) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.modules)) {
    throw new Error("architecture-policy.yaml 必须包含 version: 1 和 modules 数组");
  }
  const ids = new Set();
  const modules = raw.modules.map((module) => {
    if (!module?.id || ids.has(module.id))
      throw new Error(`模块 id 重复或为空: ${module?.id ?? ""}`);
    ids.add(module.id);
    if (!Array.isArray(module.roots) || module.roots.length === 0) {
      throw new Error(`模块 ${module.id} 必须声明 roots`);
    }
    return {
      id: module.id,
      roots: module.roots.map((root) => path.resolve(cwd, root)),
      managed: module.managed === true,
      requires: [...new Set(module.requires ?? [])],
      publicEntrypoints: (module.publicEntrypoints ?? []).map((entry) => posix(entry)),
      layers: module.layers ?? {},
      layerOrder: module.layerOrder ?? Object.keys(module.layers ?? {}),
      owner: module.owner ?? null,
    };
  });
  const moduleIds = new Set(modules.map((module) => module.id));
  for (const module of modules) {
    for (const dependency of module.requires) {
      if (!moduleIds.has(dependency))
        throw new Error(`模块 ${module.id} 依赖未知模块 ${dependency}`);
    }
  }
  const global = {
    maxFileLines: raw.global?.maxFileLines ?? 800,
    maxContractLines: raw.global?.maxContractLines ?? 300,
    forbidCycles: raw.global?.forbidCycles !== false,
    forbidDeepImports: raw.global?.forbidDeepImports !== false,
    managedOnly: raw.global?.managedOnly !== false,
    maxPublicMethods: raw.global?.maxPublicMethods ?? 12,
    // 原因：浏览器安全面与 Node 专属面由策略统一声明，不能在检查器中另存拓扑。
    browserScopes: raw.global?.browserScopes ?? [],
    browserPackages: raw.global?.browserPackages ?? [],
    nodeEntrypoints: raw.global?.nodeEntrypoints ?? [],
    nativePackages: raw.global?.nativePackages ?? [],
  };
  const exceptions = (raw.exceptions ?? []).map((exception) => ({
    ...exception,
    paths: exception.paths ?? [],
  }));
  return { version: 1, modules, global, exceptions };
}

export function layerForFile(file, module) {
  const matches = module.roots
    .flatMap((root) =>
      Object.entries(module.layers).map(([name, directory]) => ({
        name,
        directory: path.resolve(root, directory),
      })),
    )
    .filter(({ directory }) => file === directory || file.startsWith(`${directory}${path.sep}`))
    .sort((a, b) => b.directory.length - a.directory.length);
  return matches[0]?.name ?? null;
}

export function publicEntrypointMatches(target, targetModule, cwd) {
  return targetModule.publicEntrypoints.some((entry) => {
    const candidates = [
      path.resolve(cwd, entry),
      ...targetModule.roots.map((root) => path.resolve(root, entry)),
    ];
    return candidates.includes(target);
  });
}

export function manifestRequires(source) {
  const match = source.match(/requires\s*:\s*\[([^\]]*)\]/s);
  if (!match) return null;
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
}

export function countPublicMethods(source) {
  const sourceFile = ts.createSourceFile("contract.ts", source, ts.ScriptTarget.Latest, true);
  let count = 0;
  function visit(node) {
    if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        if (
          ts.isMethodSignature(member) ||
          ts.isMethodDeclaration(member) ||
          ts.isCallSignatureDeclaration(member)
        )
          count += 1;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return count;
}

export async function loadPolicy(cwd = process.cwd()) {
  const filename = path.join(cwd, "architecture-policy.yaml");
  const content = await fs.readFile(filename, "utf8");
  return validatePolicy(parseYaml(content), cwd);
}

export async function findMissingPolicyPaths(policy, cwd = process.cwd()) {
  const missing = [];
  const exists = async (target, fileOnly = false) => {
    try {
      const stat = await fs.stat(target);
      return fileOnly ? stat.isFile() : stat.isFile() || stat.isDirectory();
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
      throw error;
    }
  };
  // 原因：裁撤模块后的失效登记不能因 unmanaged 或增量范围而被静默忽略。
  for (const module of policy.modules) {
    for (const root of module.roots) {
      if (!(await exists(path.resolve(cwd, root)))) {
        missing.push({
          kind: "root",
          path: posix(path.relative(cwd, path.resolve(cwd, root))),
          owner: module.id,
        });
      }
    }
    for (const entry of module.publicEntrypoints ?? []) {
      const candidates = [
        path.resolve(cwd, entry),
        ...module.roots.map((root) => path.resolve(cwd, root, entry)),
      ];
      let found = false;
      for (const candidate of candidates) {
        if (await exists(candidate, true)) {
          found = true;
          break;
        }
      }
      if (!found) missing.push({ kind: "publicEntrypoint", path: entry, owner: module.id });
    }
  }
  for (const exception of policy.exceptions ?? []) {
    for (const declared of exception.paths) {
      let found = false;
      if (/[*?[\]{}]/.test(declared)) {
        // 原因：通配例外必须仍命中真实文件，且不能借依赖或构建产物维持失效豁免。
        const exclude = ["node_modules", "dist"].flatMap((name) => [
          name,
          `${name}/**`,
          `**/${name}`,
          `**/${name}/**`,
        ]);
        for await (const match of fs.glob(declared, { cwd, exclude })) {
          if (await exists(path.resolve(cwd, match), true)) {
            found = true;
            break;
          }
        }
      } else {
        found = await exists(path.resolve(cwd, declared));
      }
      if (!found) missing.push({ kind: "exception", path: declared, owner: exception.id });
    }
  }
  return missing;
}

export function moduleForFile(file, policy) {
  const candidates = policy.modules
    .filter((module) =>
      module.roots.some((root) => file === root || file.startsWith(`${root}${path.sep}`)),
    )
    .sort(
      (a, b) =>
        Math.max(...b.roots.map((root) => root.length)) -
        Math.max(...a.roots.map((root) => root.length)),
    );
  return candidates[0] ?? null;
}

export async function discoverFiles(policy) {
  const files = [];
  for (const module of policy.modules) {
    for (const root of module.roots) await walk(root, files);
  }
  return [...new Set(files)].sort();
}

export function resolveImport(from, specifier, knownFiles, workspace = null) {
  return resolveSpecifier(from, specifier, knownFiles, workspace);
}

/**
 * 返回 [{ specifier, typeOnly }]。typeOnly 覆盖 `import type {}`、`export type {}` 以及
 * 所有具名成员都是 `type` 修饰的情况；它们不产生运行时依赖，domain-io 不应把
 * `import type { Stats } from "node:fs"` 当成 IO。模块边界与深导入仍然按边计算。
 */
export function importDeclarationsOf(file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const allMembersTypeOnly =
        !!clause &&
        !clause.name &&
        !!named &&
        ts.isNamedImports(named) &&
        named.elements.length > 0 &&
        named.elements.every((element) => element.isTypeOnly);
      imports.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: !!clause?.isTypeOnly || allMembersTypeOnly,
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const named = node.exportClause;
      const allMembersTypeOnly =
        !!named &&
        ts.isNamedExports(named) &&
        named.elements.length > 0 &&
        named.elements.every((element) => element.isTypeOnly);
      imports.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: !!node.isTypeOnly || allMembersTypeOnly,
      });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      imports.push({ specifier: node.moduleReference.expression.text, typeOnly: false });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      imports.push({ specifier: node.argument.literal.text, typeOnly: true });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      // 原因：字面量动态加载也会把 Node 依赖带进浏览器；计算表达式不猜测目标。
      imports.push({ specifier: node.arguments[0].text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return imports;
}

export function importsOf(file, source) {
  return importDeclarationsOf(file, source).map((item) => item.specifier);
}

export function isException(policy, rule, file, cwd) {
  const relative = posix(path.relative(cwd, file));
  return policy.exceptions.some(
    (exception) =>
      exception.rule === rule &&
      exception.paths.some(
        (pattern) => relative === pattern || relative.startsWith(pattern.replace(/\*\*$/, "")),
      ),
  );
}
