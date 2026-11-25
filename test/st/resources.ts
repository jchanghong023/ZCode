import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const runId = process.env.ST_RUN_ID;
function resourceFile(): string {
  if (!runId) throw new Error("ST 配置错误：请通过 test:st 运行以分配本轮资源标识");
  return join(tmpdir(), `zcode-st-resources-${runId}.jsonl`);
}
type Requirement = { projectId: string; irId: string };

export function requirementKey({ projectId, irId }: Requirement): string {
  return JSON.stringify([projectId, irId]);
}

export function readOccupiedRequirements(): Set<string> {
  const file = resourceFile();
  const occupied = new Set<string>();
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line) continue;
      occupied.add(requirementKey(JSON.parse(line) as Requirement));
    }
  }
  return occupied;
}

export function occupyRequirement({ projectId, irId }: Requirement): void {
  const key = requirementKey({ projectId, irId });
  // Vitest 单 worker 串行运行，但模块随测试文件隔离；从本轮账本复查，防止重复占用。
  if (readOccupiedRequirements().has(key)) throw new Error(`ST 前置阻塞：本轮已占用 IR ${key}`);
  appendFileSync(
    resourceFile(),
    JSON.stringify({ projectId, irId, occupiedAt: new Date().toISOString() }) + "\n",
  );
}
