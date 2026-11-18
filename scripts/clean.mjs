#!/usr/bin/env bun

import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const packagesDir = join(repoRoot, "packages");
const usage = `用法: bun scripts/clean.mjs [--dependencies]

默认清理根目录和各 workspace 包的 dist 与 *.tsbuildinfo。
--dependencies 同时清理 node_modules。`;

let cleanDependencies = false;
for (const arg of process.argv.slice(2)) {
  if (arg === "--dependencies") {
    cleanDependencies = true;
  } else if (arg === "--help" || arg === "-h") {
    console.log(usage);
    process.exit(0);
  } else {
    console.error(`[clean] 未知参数: ${arg}\n${usage}`);
    process.exit(1);
  }
}

const ownerDirs = [repoRoot];
if (existsSync(packagesDir)) {
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (entry.isDirectory()) ownerDirs.push(join(packagesDir, entry.name));
  }
}

function removeTarget(directory, name, { recursive = false } = {}) {
  // 目标名称来自固定目录名或 readdirSync 的直接子项。
  const target = join(directory, name);
  if (!existsSync(target)) return 0;
  rmSync(target, { force: true, recursive });
  console.log(`removed ${relative(repoRoot, target)}`);
  return 1;
}

function incrementalMetadata(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).filter(
      (entry) => entry.isFile() && entry.name.endsWith(".tsbuildinfo"),
    );
  } catch {
    return [];
  }
}

let removedBuildArtifacts = 0;
for (const directory of ownerDirs) {
  removedBuildArtifacts += removeTarget(directory, "dist", { recursive: true });
  for (const entry of incrementalMetadata(directory)) {
    removedBuildArtifacts += removeTarget(directory, entry.name);
  }
}
console.log(`clean removed ${removedBuildArtifacts} build artifact(s)`);

if (cleanDependencies) {
  let removedDependencies = 0;
  for (const directory of ownerDirs) {
    removedDependencies += removeTarget(directory, "node_modules", { recursive: true });
  }
  console.log(
    `clean removed ${removedDependencies} dependency directory(ies); 重新安装请运行 bun run bootstrap`,
  );
}
