import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { config, type STFixture } from "./config.js";
import type { STClient } from "./client.js";
const allocationFile =
  process.env.ST_ALLOCATION_LOG ||
  join(
    tmpdir(),
    `zcode-st-allocations-${createHash("sha256")
      .update(config.baseUrl + (process.env.ST_FIXTURES_FILE || ""))
      .digest("hex")
      .slice(0, 16)}.jsonl`,
  );
function allocatedKeys(): Set<string> {
  if (!existsSync(allocationFile)) return new Set();
  return new Set(
    readFileSync(allocationFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const entry = JSON.parse(line) as { projectId: string; irId: string };
        return `${entry.projectId}:${entry.irId}`;
      }),
  );
}
export async function claimFixture(client: STClient, kind: string): Promise<STFixture> {
  // 只按环境明确配置的专用对象分配；不搜索或接管无关业务对象。
  const allocated = allocatedKeys();
  for (const fixture of config.fixtures[kind] ?? []) {
    const key = `${fixture.projectId}:${fixture.irId}`;
    if (allocated.has(key)) continue;
    if (!fixture.projectId || !fixture.irId)
      throw new Error(`ST 前置阻塞：${kind} 缺少 projectId/irId`);
    const remote = await client.read({ projectId: fixture.projectId, irId: fixture.irId });
    if (
      !remote.view.groups.some(
        (group) => group.projectId === fixture.projectId && group.id === fixture.irId,
      )
    )
      throw new Error(`ST 前置阻塞：${kind} 必须是专用正式 IR`);
    if (
      fixture.srId &&
      !remote.view.srs.some(
        (sr) =>
          sr.projectId === fixture.projectId && sr.irId === fixture.irId && sr.id === fixture.srId,
      )
    )
      throw new Error(`ST 前置阻塞：${kind} SR 归属不匹配`);
    allocated.add(key);
    appendFileSync(
      allocationFile,
      JSON.stringify({
        kind,
        projectId: fixture.projectId,
        irId: fixture.irId,
        srId: fixture.srId,
        allocatedAt: new Date().toISOString(),
      }) + "\n",
    );
    return fixture;
  }
  throw new Error(`ST 前置阻塞：${kind} 独立消费型前置不足，请配置 ST_FIXTURES_FILE`);
}
