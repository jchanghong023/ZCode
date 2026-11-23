import { AIREQ_SYNC_SCRIPT_ROOT } from "../contract.js";
import { requirementObjectLink } from "../navigationState.js";

const launcher = [
  "import hashlib, pathlib, subprocess, sys, tempfile, urllib.request",
  "url, digest, link = sys.argv[1:]",
  "message = 'AIReq script unavailable or changed. Copy the command again.'",
  "exec('try:\\n source = urllib.request.urlopen(url, timeout=30).read()\\nexcept OSError:\\n sys.exit(message)')",
  "hashlib.sha256(source).hexdigest() == digest or sys.exit(message)",
  "tmp = tempfile.TemporaryDirectory()",
  "script = pathlib.Path(tmp.name) / 'aireq-sync.py'",
  "script.write_bytes(source)",
  "status = subprocess.call([sys.executable, str(script), link])",
  "tmp.cleanup()",
  "sys.exit(status)",
].join("; ");

export function documentSyncCommand(
  base: string,
  target: { projectId: string; irId: string; releaseId: string },
  scriptSha256: string,
): string | undefined {
  const platform = new URL(base);
  if (!/^https?:$/.test(platform.protocol) || !/^[a-f0-9]{64}$/.test(scriptSha256)) return;
  // URLSearchParams 编码定位参数。链接基址只取 origin，避免把页面参数和凭据带入终端。
  const link = requirementObjectLink(platform.origin, target, target.releaseId);
  if (!link) return;
  const script = new URL(`${AIREQ_SYNC_SCRIPT_ROOT}/${scriptSha256}.py`, platform);
  return `python -c "${launcher}" "${script.href}" "${scriptSha256}" "${link}"`;
}
