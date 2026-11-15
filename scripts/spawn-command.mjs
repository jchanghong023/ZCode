import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

if (!process.versions.bun) throw new Error("Engineering commands must run under Bun");

const { packageManager } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
if (!/^pnpm@\d+\.\d+\.\d+$/.test(packageManager ?? "")) {
  throw new Error("package.json must pin pnpm in packageManager");
}

const windowsShellCommandPattern = /\.(cmd|bat)$/i;
const packageManagerCommandPattern = /^(?:pnpm|npm)(?:\.cmd)?$/i;

// Bun 强制执行 JS bin，不经过 Corepack / Windows shim（它们可能解析到其他管理器）。
// pnpm 的唯一版本来源为 package.json；解析器不会再次重写当前 Bun 可执行文件。
export function resolveSpawnCommand(command, args, platform = process.platform) {
  if (packageManagerCommandPattern.test(command)) {
    const name = command.replace(/\.cmd$/i, "").toLowerCase();
    return {
      command: process.execPath,
      args:
        name === "pnpm"
          ? ["x", "--bun", "--package", packageManager, "pnpm", ...args]
          : ["--bun", "run", "npm", ...args],
      options: { shell: false },
    };
  }
  if (platform === "win32" && windowsShellCommandPattern.test(command)) {
    return {
      command,
      args: args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)),
      options: { shell: true },
    };
  }
  return { command, args, options: { shell: false } };
}

export function runCommand(command, args, options = {}) {
  const resolved = resolveSpawnCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    stdio: "inherit",
    ...options,
    ...resolved.options,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }

  return result;
}

export function runCommandAndReadStdout(command, args, options = {}) {
  const resolved = resolveSpawnCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    encoding: "utf8",
    ...options,
    ...resolved.options,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }

  return result.stdout;
}
