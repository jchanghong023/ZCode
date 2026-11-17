import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const runId = process.env.ST_RUN_ID;
function resourceFile(): string {
  if (!runId) throw new Error("ST 配置错误：请通过 test:st 运行以分配本轮资源标识");
  return join(tmpdir(), `zcode-st-resources-${runId}.jsonl`);
}
export function recordCreated(projectId: string, irId?: string): void {
  appendFileSync(
    resourceFile(),
    JSON.stringify({ projectId, irId, createdAt: new Date().toISOString() }) + "\n",
  );
}
export function requireCreatedThisRun(projectId: string, irId?: string): void {
  const file = resourceFile();
  const rows = existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { projectId: string; irId?: string })
    : [];
  if (!rows.some((row) => row.projectId === projectId && row.irId === irId))
    throw new Error("ST 前置阻塞：不得删除已有数据；目标必须由本轮测试通过公开接口创建");
}
