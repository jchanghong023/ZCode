#!/usr/bin/env bun

import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const packagesDir = join(repoRoot, "packages");
// 只认这两个构建产物名：dist 目录与 TS 增量元数据；依赖目录必须显式 --dependencies。
const buildDirNames = new Set(["dist"]);
const incrementalMetadataSuffix = ".tsbuildinfo";
const dependenciesDirName = "node_modules";
const usage = `用法: bun scripts/clean.mjs [--dependencies]

默认只删除构建产物：根与 packages/* 下的 dist 目录，以及对应目录里的 *.tsbuildinfo 增量元数据。
--dependencies 额外删除根与 packages/* 的 node_modules（之后需要重新安装依赖）。
不会删除源码、用户数据或其它目录。`;

function parseOptions(argv) {
  const options = { dependencies: false };
  for (const arg of argv) {
    if (arg === "--dependencies") {
      options.dependencies = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    }
    console.error(`[clean] 未知参数: ${arg}\n${usage}`);
    process.exit(1);
  }
  return options;
}

function collectPackageDirs() {
  if (!existsSync(packagesDir)) {
    return [];
  }

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDir, entry.name));
}

function isAllowedBuildEntry(name) {
  return buildDirNames.has(name) || name.endsWith(incrementalMetadataSuffix);
}

function assertSafeTarget(targetPath, ownerDir, isAllowedName) {
  // 路径保护：目标必须是 ownerDir 的直接子项，且名字落在受控集合内。
  // 这样即使 ownerDir 传错、或目标名被改成 `..`/绝对路径，也不会递归删除任意目录。
  const parentDir = resolve(dirname(targetPath));
  if (parentDir !== resolve(ownerDir) || !isAllowedName(basename(targetPath))) {
    throw new Error(`Refuse to remove unexpected path: ${targetPath}`);
  }
}

function removeTarget(targetPath, ownerDir, isAllowedName) {
  assertSafeTarget(targetPath, ownerDir, isAllowedName);

  if (!existsSync(targetPath)) {
    return false;
  }

  rmSync(targetPath, { force: true, recursive: true });
  console.log(`removed ${relative(repoRoot, targetPath)}`);
  return true;
}

function listIncrementalMetadataFiles(ownerDir) {
  try {
    return readdirSync(ownerDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(incrementalMetadataSuffix))
      .map((entry) => join(ownerDir, entry.name));
  } catch {
    return [];
  }
}

function removeBuildArtifacts(ownerDirs) {
  let removedCount = 0;
  for (const ownerDir of ownerDirs) {
    for (const dirName of buildDirNames) {
      if (removeTarget(join(ownerDir, dirName), ownerDir, (name) => buildDirNames.has(name))) {
        removedCount += 1;
      }
    }
    for (const metadataPath of listIncrementalMetadataFiles(ownerDir)) {
      if (removeTarget(metadataPath, ownerDir, isAllowedBuildEntry)) {
        removedCount += 1;
      }
    }
  }
  return removedCount;
}

function removeDependencyDirectories(ownerDirs) {
  let removedCount = 0;
  for (const ownerDir of ownerDirs) {
    if (
      removeTarget(
        join(ownerDir, dependenciesDirName),
        ownerDir,
        (name) => name === dependenciesDirName,
      )
    ) {
      removedCount += 1;
    }
  }
  return removedCount;
}

const options = parseOptions(process.argv.slice(2));
const ownerDirs = [repoRoot, ...collectPackageDirs()];

const removedBuildArtifacts = removeBuildArtifacts(ownerDirs);
console.log(
  `clean removed ${removedBuildArtifacts} build artifact${removedBuildArtifacts === 1 ? "" : "s"}`,
);

if (options.dependencies) {
  const removedDependencyDirs = removeDependencyDirectories(ownerDirs);
  console.log(
    `clean removed ${removedDependencyDirs} dependency director${removedDependencyDirs === 1 ? "y" : "ies"}; 重新安装请运行 pnpm bootstrap`,
  );
}
