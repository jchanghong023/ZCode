#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { runCommand, runCommandAndReadStdout } from "./spawn-command.mjs";
import { clearHoistedPatchedDependencyTargets } from "./bootstrap-patched-dependencies.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
// 显式选择 pnpm 包并强制用 Bun 执行，绕开系统 Corepack / pnpm shim。
const bunCommand = "bun";
const packageJsonPath = resolve(rootDir, "package.json");
// bootstrap 只准备纯 Web 形态的两端：浏览器前端与内存态 mock-server。
// 桌面 runtime、远程资源发行链、apps/zcode-cli 子模块都已随桌面端裁撤，不再属于首装链。
const expectedArtifacts = ["packages/server/dist/entry-http.js", "packages/web/dist/index.html"];

function readPinnedToolVersions() {
  const miseConfigPath = resolve(rootDir, "mise.toml");
  if (!existsSync(miseConfigPath)) {
    return {};
  }

  const miseConfig = readFileSync(miseConfigPath, "utf8");
  // Bun 固定版本从 mise.toml 读取；pnpm 固定版本归 packageManager 所有。
  const bun = miseConfig.match(/^\s*bun\s*=\s*"([^"]+)"/m)?.[1]?.trim();
  return { bun };
}

function readPackageManagerVersion() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const packageManager =
    typeof packageJson.packageManager === "string" ? packageJson.packageManager : "";
  const match = packageManager.match(/^pnpm@(.+)$/u);
  return match?.[1]?.trim();
}

function assertToolchain() {
  const pinned = readPinnedToolVersions();
  const expectedBun = pinned.bun;
  if (!expectedBun) {
    throw new Error("mise.toml 缺少固定 Bun 版本；请恢复 [tools] bun 配置后重试。");
  }
  const bunInstallHint = `请运行 mise install，或按 https://bun.sh/docs/installation 安装 Bun ${expectedBun} 并加入 PATH。`;
  if (!process.versions.bun) {
    throw new Error(
      `bootstrap 必须由 Bun ${expectedBun} 执行：bun scripts/bootstrap.mjs。${bunInstallHint}`,
    );
  }
  let actualBun;
  try {
    actualBun = runCommandAndReadStdout(bunCommand, ["--version"], {
      cwd: rootDir,
      env: process.env,
    }).trim();
  } catch (error) {
    throw new Error(
      `无法运行 Bun（需要 ${expectedBun}）：${error instanceof Error ? error.message : String(error)}。${bunInstallHint}`,
    );
  }
  if (actualBun !== expectedBun || process.versions.bun !== expectedBun) {
    throw new Error(
      `需要 Bun ${expectedBun}（mise.toml），当前进程 ${process.versions.bun}，PATH 中 ${actualBun}。${bunInstallHint}`,
    );
  }

  const expectedPnpm = readPackageManagerVersion();
  if (!expectedPnpm) {
    throw new Error("package.json 缺少固定 packageManager（需要 pnpm@<版本>）。");
  }

  const actualPnpm = readPnpmVersion(expectedPnpm);
  if (actualPnpm !== expectedPnpm) {
    throw new Error(
      `需要 pnpm ${expectedPnpm}（package.json packageManager），当前 ${actualPnpm}。` +
        `请检查 Bun 包缓存与 registry，并重试 bun x --bun --package pnpm@${expectedPnpm} pnpm --version。`,
    );
  }
  return expectedPnpm;
}

function readPnpmVersion(expectedPnpm) {
  try {
    return runCommandAndReadStdout(
      bunCommand,
      ["x", "--bun", "--package", `pnpm@${expectedPnpm}`, "pnpm", "--version"],
      { cwd: rootDir, env: process.env },
    ).trim();
  } catch (error) {
    // 不尝试全局 pnpm shim；缓存缺失或 registry 不可达时明确失败。
    throw new Error(
      `无法通过 Bun 获取或运行 pnpm ${expectedPnpm}：${error instanceof Error ? error.message : String(error)}。` +
        `请检查 registry 网络与 Bun 缓存，重试 bun x --bun --package pnpm@${expectedPnpm} pnpm --version。`,
    );
  }
}

function runPnpm(version, args) {
  runCommand(bunCommand, ["x", "--bun", "--package", `pnpm@${version}`, "pnpm", ...args], {
    cwd: rootDir,
    env: process.env,
  });
}

function assertExpectedArtifacts() {
  const missing = expectedArtifacts.filter((artifact) => !existsSync(resolve(rootDir, artifact)));
  if (missing.length > 0) {
    const relativePaths = missing.map((artifact) => relative(rootDir, resolve(rootDir, artifact)));
    throw new Error(`构建结束但产物缺失：${relativePaths.join(", ")}`);
  }
}

async function main() {
  const pnpmVersion = assertToolchain();

  const clearedPatchedDependencies = await clearHoistedPatchedDependencyTargets({
    rootDir,
    packageJsonPath,
  });
  if (clearedPatchedDependencies.length > 0) {
    // pnpm 10 + hoisted node-linker 会把 patch 直接应用到目标目录，重复 install 会再次
    // 应用同一 diff 并稳定失败；这里只清理可重建的依赖目标，让本次 install 重新打 patch。
    console.log(
      `[bootstrap] refreshed hoisted patched dependencies: ${clearedPatchedDependencies.join(", ")}`,
    );
  }

  console.log(
    `[bootstrap] 安装 workspace 依赖：bun x --bun --package pnpm@${pnpmVersion} pnpm install`,
  );
  runPnpm(pnpmVersion, ["install"]);

  // 根 build 契约是串行 build:server && build:web；这里复用根脚本，不另立构建流程。
  console.log("[bootstrap] 构建 mock-server 与 web：bun run build");
  runCommand(bunCommand, ["run", "build"], { cwd: rootDir, env: process.env });

  assertExpectedArtifacts();
  console.log("[bootstrap] 完成：packages/server/dist 与 packages/web/dist 已就绪。");
}

const unsupportedArgs = process.argv.slice(2);
if (unsupportedArgs.length > 0) {
  console.error(
    `[bootstrap] 不支持的参数：${unsupportedArgs.join(" ")}\n` +
      "bootstrap 只安装依赖并构建 Web + mock-server；--with-remote 等桌面/远程发行入口已移除。",
  );
  process.exit(1);
}

try {
  await main();
} catch (error) {
  console.error(`[bootstrap] 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
