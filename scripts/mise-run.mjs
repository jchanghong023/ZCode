import { spawn } from "node:child_process";

import { withPinnedBunPath } from "./mise-toolchain-env.mjs";
import { resolveSpawnCommand } from "./spawn-command.mjs";

const [requestedCommand, ...args] = process.argv.slice(2);
if (!requestedCommand) {
  console.error("Usage: bun scripts/mise-run.mjs <command> [...args]");
  process.exit(1);
}

const { command, args: spawnArgs, options } = resolveSpawnCommand(requestedCommand, args);
const child = spawn(command, spawnArgs, {
  ...options,
  cwd: process.cwd(),
  env: withPinnedBunPath(process.env, process.execPath),
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`[mise-run] failed to start ${requestedCommand}: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
