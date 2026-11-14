#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { runCommand, runCommandAndReadStdout } from "./spawn-command.mjs";
import { clearHoistedPatchedDependencyTargets } from "./bootstrap-patched-dependencies.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
// 保持原始命令名：scripts/spawn-command.mjs 在 Windows 上会为 pnpm/npm 加 shell，
// 交给 cmd 解析 .cmd shim；改写成 pnpm.cmd 反而会破坏 pnpm 的包上下文。
const pnpmCommand = "pnpm";
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
  // 只读取 [tools] 中的 node/pnpm 两个固定版本，供后续版本检查与提示使用。
  const node = miseConfig.match(/^\s*node\s*=\s*"([^"]+)"/m)?.[1]?.trim();
  const pnpm = miseConfig.match(/^\s*pnpm\s*=\s*"([^"]+)"/m)?.[1]?.trim();
  return { node, pnpm };
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
  const currentNode = process.versions.node;
  const nodeMajor = Number.parseInt(currentNode.split(".")[0] ?? "0", 10);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 24) {
    throw new Error(
      `需要 Node.js 24+（package.json engines 要求），当前 ${currentNode}；固定版本见 mise.toml。`,
    );
  }
  if (pinned.node && currentNode !== pinned.node) {
    // 小版本漂移不阻断安装与构建，但必须提示：工具链固定版本才是验收基准。
    console.warn(
      `[bootstrap] Node ${currentNode} 与 mise.toml 固定版本 ${pinned.node} 不一致；如需完全一致请运行 mise install。`,
    );
  }

  const expectedPnpm = pinned.pnpm ?? readPackageManagerVersion();
  if (!expectedPnpm) {
    return;
  }

  const actualPnpm = readPnpmVersion(expectedPnpm);
  if (actualPnpm !== expectedPnpm) {
    throw new Error(
      `需要 pnpm ${expectedPnpm}（mise.toml / package.json packageManager），当前 ${actualPnpm}。` +
        `请运行 mise install，或执行 corepack prepare pnpm@${expectedPnpm} --activate / npm i -g pnpm@${expectedPnpm}。`,
    );
  }
}

function readPnpmVersion(expectedPnpm) {
  try {
    return runCommandAndReadStdout(pnpmCommand, ["--version"], {
      cwd: rootDir,
      env: process.env,
    }).trim();
  } catch (error) {
    // 找不到 pnpm 时 spawnSync 只会给 ENOENT；这里换成可执行的中文提示。
    throw new Error(
      `无法运行 pnpm（需要 ${expectedPnpm}）：${error instanceof Error ? error.message : String(error)}。` +
        `请先安装固定版本，或改用 mise install。`,
    );
  }
}

function runPnpm(args) {
  runCommand(pnpmCommand, args, {
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
  assertToolchain();

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

  console.log("[bootstrap] 安装 workspace 依赖：pnpm install");
  runPnpm(["install"]);

  // 根 build 契约是串行 build:server && build:web；这里复用根脚本，不另立构建流程。
  console.log("[bootstrap] 构建 mock-server 与 web：pnpm build");
  runPnpm(["run", "build"]);

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
