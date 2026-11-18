import { createHash } from "node:crypto";
import path from "node:path";

import { posix } from "./policy.mjs";

function fingerprint(rule, file, detail = "") {
  return createHash("sha256").update(`${rule}\0${file}\0${detail}`).digest("hex").slice(0, 16);
}

/**
 * 违规文件路径统一为相对 cwd 的 posix 路径。修复原因：首版写入绝对路径，fingerprint 随之含机器
 * 路径，baseline 在 CI 与不同开发机之间永远对不上（首版 baseline 为空所以没暴露）。
 */
export function violation({
  rule,
  file,
  detail,
  message,
  module,
  global = false,
  cwd = process.cwd(),
}) {
  const relative = path.isAbsolute(file) ? posix(path.relative(cwd, file)) : posix(file);
  const relativeDetail =
    typeof detail === "string" && path.isAbsolute(detail) && detail.startsWith(cwd)
      ? posix(path.relative(cwd, detail))
      : detail;
  return {
    rule,
    file: relative,
    module: module?.id ?? null,
    detail: relativeDetail,
    message,
    fingerprint: fingerprint(rule, relative, relativeDetail),
    global,
  };
}

export function cycleViolations(edges, policy, modulesByFile, cwd) {
  const state = new Map();
  const stack = [];
  const cycles = [];
  function visit(node) {
    state.set(node, 1);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if (!modulesByFile.get(next)?.managed && policy.global.managedOnly) continue;
      if (state.get(next) === 1) {
        const index = stack.indexOf(next);
        cycles.push(stack.slice(index).concat(next));
      } else if (!state.get(next)) visit(next);
    }
    stack.pop();
    state.set(node, 2);
  }
  for (const node of edges.keys()) if (!state.get(node)) visit(node);
  const unique = new Map();
  for (const cycle of cycles) {
    const detail = [...new Set(cycle)]
      .map((item) => posix(path.relative(cwd, item)))
      .sort()
      .join(" -> ");
    const file = cycle[0];
    unique.set(
      detail,
      violation({
        rule: "cycle",
        file,
        detail,
        module: modulesByFile.get(file),
        message: `检测到循环依赖：${cycle.map((item) => posix(path.relative(cwd, item))).join(" -> ")}`,
        global: true,
        cwd,
      }),
    );
  }
  return [...unique.values()];
}
