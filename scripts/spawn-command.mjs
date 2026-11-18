import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

if (!process.versions.bun) throw new Error("Engineering commands must run under Bun");

const { packageManager } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
if (!/^pnpm@\d+\.\d+\.\d+$/.test(packageManager ?? "")) {
  throw new Error("package.json must pin pnpm in packageManager");
}

// 由当前 Bun 执行固定版本的 pnpm，绕开系统 shim。
export function pnpmArgs(args) {
  return ["x", "--bun", "--package", packageManager, "pnpm", ...args];
}

function checkedSpawn(command, args, options) {
  const result = spawnSync(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.signal ?? result.status})`);
  }
  return result;
}

export function runCommand(command, args, options = {}) {
  return checkedSpawn(command, args, { stdio: "inherit", ...options });
}

export function runCommandAndReadStdout(command, args, options = {}) {
  return checkedSpawn(command, args, { encoding: "utf8", ...options }).stdout;
}
