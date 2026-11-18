import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ZERO_SHA = /^0{40}$/;

async function gitOut(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function hasCommit(cwd, ref) {
  return (
    !!ref &&
    !ZERO_SHA.test(ref) &&
    (await gitOut(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])) !== null
  );
}

// CI 的 checkout 可能已包含全部提交，需要选择实际的对比提交。
export async function resolveDiffBase(
  cwd = process.cwd(),
  { explicit = null, env = process.env } = {},
) {
  const pick = async (ref, label, mergeBase = false) => {
    if (!(await hasCommit(cwd, ref))) return null;
    if (!mergeBase) return { base: ref, label };
    const base = await gitOut(cwd, ["merge-base", "HEAD", ref]);
    return base ? { base, label: `merge-base ${label}` } : null;
  };
  const explicitRef = explicit ?? env.ARCHITECTURE_BASE?.trim();
  if (explicitRef) {
    const chosen = await pick(explicitRef, `explicit ${explicitRef}`, true);
    if (!chosen) throw new Error(`显式 base 不存在或不是 commit: ${explicitRef}`);
    return chosen;
  }
  for (const key of [
    "CI_MERGE_REQUEST_DIFF_BASE_SHA",
    "CI_MERGE_REQUEST_TARGET_BRANCH_SHA",
    "CI_COMMIT_BEFORE_SHA",
  ]) {
    const chosen = await pick(env[key], `${key} ${env[key]}`);
    if (chosen) return chosen;
  }
  const upstream = await gitOut(cwd, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);
  const viaUpstream = upstream && (await pick(upstream, `upstream ${upstream}`, true));
  if (viaUpstream) return viaUpstream;
  const originHead = await gitOut(cwd, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  for (const ref of new Set([originHead, "origin/main", "origin/master", "main", "master"])) {
    const viaDefault = await pick(ref, ref, true);
    if (viaDefault) return viaDefault;
  }
  return { base: "HEAD", label: "HEAD (仅工作树差异；未找到远端基线)" };
}

function gitFileNames(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const files = [];
    let pending = "";
    let stderr = "";
    // CI 持久缓存曾让 execFile 的 1 MiB 输出缓冲区溢出；流式消费路径，NUL 分隔避免转义和空白损坏。
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const names = (pending + chunk).split("\0");
      pending = names.pop() ?? "";
      for (const name of names) if (name) files.push(name);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-16 * 1024);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0) {
        reject(new Error(`git ${args.join(" ")} failed (${signal ?? code}): ${stderr.trim()}`));
        return;
      }
      if (pending) files.push(pending);
      resolve(files);
    });
  });
}

export async function changedFilesFromGit(cwd = process.cwd(), { base = "HEAD" } = {}) {
  const [diff, untracked] = await Promise.all([
    gitFileNames(cwd, ["diff", "--name-only", "-z", base]),
    gitFileNames(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  return [...new Set([...diff, ...untracked])];
}
