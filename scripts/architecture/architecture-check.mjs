#!/usr/bin/env bun
import { checkArchitecture } from "./index.mjs";
import { changedFilesFromGit, resolveDiffBase } from "./git-base.mjs";
import { generateContext } from "./context.mjs";

const [command = "check", ...args] = process.argv.slice(2);
const cwd = process.cwd();

if (command === "context") {
  const moduleId = args[0];
  if (!moduleId) throw new Error("用法: bun run architecture:context <module-id>");
  console.log(await generateContext({ cwd, moduleId, full: args.includes("--full") }));
  process.exit(0);
}
if (command !== "check") throw new Error(`未知架构命令: ${command}`);

let changedFiles = null;
let baseLabel = null;
if (args.includes("--changed")) {
  const baseIndex = args.indexOf("--base");
  const explicit = baseIndex >= 0 ? args[baseIndex + 1] : null;
  const { base, label } = await resolveDiffBase(cwd, { explicit });
  baseLabel = label;
  changedFiles = await changedFilesFromGit(cwd, { base });
}

const violations = await checkArchitecture({ cwd, changedFiles });
const lines = [
  `architecture: ${violations.length === 0 ? "OK" : "FAILED"}`,
  ...(baseLabel ? [`base: ${baseLabel}`] : []),
  `violations: ${violations.length}`,
];
for (const item of violations) lines.push(`- ${item.rule} ${item.file}: ${item.message}`);
console.log(lines.join("\n"));
process.exit(violations.length === 0 ? 0 : 1);
