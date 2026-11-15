#!/usr/bin/env bun

import { readFileSync } from "node:fs";

const toolchain = readFileSync(new URL("../mise.toml", import.meta.url), "utf8");
const tools = toolchain.split(/^\[tools\]\s*$/m)[1]?.split(/^\[/m)[0];
const expected = /^bun\s*=\s*"([^"]+)"\s*$/m.exec(tools ?? "")?.[1];
const actual = process.versions.bun;

if (!expected) {
  console.error("[ci] mise.toml must pin a Bun version in [tools]");
  process.exit(1);
}
if (!actual || actual !== expected) {
  console.error(
    `[ci] Bun ${expected} is the only supported runtime, current=${actual ?? "not Bun"}`,
  );
  process.exit(1);
}

console.log(`[ci] Bun version OK: ${actual}`);
