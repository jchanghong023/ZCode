import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface STRequirementFixture extends Record<string, unknown> {
  projectId: string;
  irId: string;
  releaseId?: string;
}
interface STProjectFixture extends Record<string, unknown> {
  projectId: string;
  allowUnconfigured?: boolean;
}
interface STFixtures {
  requirements?: STRequirementFixture[];
  projects?: STProjectFixture[];
  [purpose: string]: Record<string, unknown>[] | undefined;
}

function isFixtureId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0)
    throw new Error("ST 配置错误：超时必须为正整数毫秒");
  return number;
}
function fixtureFile(): STFixtures {
  const file = process.env.ST_FIXTURES_FILE;
  if (!file) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("ST 配置错误：无法读取 ST_FIXTURES_FILE 的 JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("ST 配置错误：前置清单必须为按用途分类的对象");
  for (const rows of Object.values(parsed)) {
    if (
      !Array.isArray(rows) ||
      rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))
    )
      throw new Error("ST 配置错误：每个前置用途必须是对象数组");
  }
  const fixtures = parsed as Record<string, Record<string, unknown>[] | undefined>;
  // 需求和项目是不同用途；项目夹具不需要伪造 IR，声明的 ID 也不得用空串代替。
  const requirements = new Set<string>();
  for (const row of fixtures.requirements ?? []) {
    if (
      !isFixtureId(row.projectId) ||
      !isFixtureId(row.irId) ||
      (row.releaseId !== undefined && !isFixtureId(row.releaseId))
    ) {
      throw new Error(
        "ST 前置阻塞：requirements 条目必须提供 projectId、irId 及有效的可选 releaseId",
      );
    }
    const key = JSON.stringify([row.projectId, row.irId]);
    if (requirements.has(key)) throw new Error(`ST 前置阻塞：requirements 重复声明 ${key}`);
    requirements.add(key);
  }
  const projects = new Set<string>();
  for (const row of fixtures.projects ?? []) {
    if (
      !isFixtureId(row.projectId) ||
      (row.allowUnconfigured !== undefined && typeof row.allowUnconfigured !== "boolean")
    ) {
      throw new Error(
        "ST 前置阻塞：projects 条目必须提供 projectId，allowUnconfigured 只能是布尔值",
      );
    }
    if (projects.has(row.projectId))
      throw new Error(`ST 前置阻塞：projects 重复声明 ${row.projectId}`);
    projects.add(row.projectId);
  }
  return fixtures as STFixtures;
}
const base = new URL(process.env.ST_BASE_URL || "http://localhost:5174");
if (
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password ||
  base.search ||
  base.hash ||
  base.pathname !== "/"
)
  throw new Error("ST 配置错误：ST_BASE_URL 必须是无凭据／查询参数的 HTTP(S) origin");
export const config = {
  baseUrl: base.origin,
  employeeId: process.env.ST_EMPLOYEE_ID || "s00000001",
  otherEmployeeId: process.env.ST_OTHER_EMPLOYEE_ID || "s00000002",
  testerEmployeeId: process.env.ST_TESTER_EMPLOYEE_ID || "s00000003",
  token: process.env.ST_TOKEN,
  timeoutMs: positiveInteger(process.env.ST_TIMEOUT_MS, 120_000),
  repositoryUrl: process.env.ST_REPOSITORY_URL || "https://github.com/jchanghong023/test.git",
  branch: process.env.ST_REPOSITORY_BRANCH || "main",
  workDirectoryRoot: process.env.ST_WORK_DIRECTORY_ROOT || join(tmpdir(), "zcode-st-projects"),
  isolatedRedZoneSync: process.env.ST_ISOLATED_RED_ZONE_SYNC === "1",
  fixtures: fixtureFile(),
  file: undefined as
    | undefined
    | {
        workspacePath: string;
        path: string;
        directoryPath: string;
        missingPath: string;
        bytesBase64: string;
      },
};
if (process.env.ST_FILE_JSON) {
  try {
    config.file = JSON.parse(process.env.ST_FILE_JSON);
  } catch {
    throw new Error("ST 配置错误：ST_FILE_JSON 不是有效 JSON");
  }
}
export function requireConfig<T>(value: T | null | undefined, label: string): NonNullable<T> {
  if (value === undefined || value === null || value === "")
    throw new Error(`ST 前置阻塞：缺少 ${label}`);
  return value as NonNullable<T>;
}
