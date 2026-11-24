import { prototypeRecoveryScenario } from "./recovery.js";
import type { AIReqRelease } from "@zcode/services/aireq";

// 共享数据库中按项目关联的 Release 清单内存投影。
// 每个项目独立维护，不实际执行文件写入、commit 或 push。
const releasesByProject = new Map<string, AIReqRelease[]>([
  [
    "demo-aurora",
    [
      {
        id: "release-2026-11",
        projectId: "demo-aurora",
        title: "2026.11 · 体验优化",
        createdAt: "2026-10-20T09:00:00.000Z",
      },
      {
        id: "release-2026-12",
        projectId: "demo-aurora",
        title: "2026.12 · 下一迭代",
        createdAt: "2026-11-01T09:00:00.000Z",
      },
    ],
  ],
  [
    "demo-mobile",
    [
      {
        id: "mobile-release-2026-11",
        projectId: "demo-mobile",
        title: "2026.11 · 移动端优化",
        createdAt: "2026-10-21T09:00:00.000Z",
      },
      {
        id: "mobile-release-2026-12",
        projectId: "demo-mobile",
        title: "2026.12 · 离线体验",
        createdAt: "2026-11-01T09:00:00.000Z",
      },
      {
        id: "mobile-release-2027-01",
        projectId: "demo-mobile",
        title: "2027.01 · 消息协同",
        createdAt: "2026-11-03T09:00:00.000Z",
      },
      {
        id: "mobile-release-2027-02",
        projectId: "demo-mobile",
        title: "2027.02 · 工作台优化",
        createdAt: "2026-11-05T09:00:00.000Z",
      },
      {
        id: "mobile-release-2027-03",
        projectId: "demo-mobile",
        title: "2027.03 · 协作体验",
        createdAt: "2026-11-09T09:00:00.000Z",
      },
    ],
  ],
  [
    "demo-atlas",
    [
      {
        id: "atlas-release-2026-11",
        projectId: "demo-atlas",
        title: "2026.11 · 客户门户",
        createdAt: "2026-10-22T09:00:00.000Z",
      },
    ],
  ],
]);

if (prototypeRecoveryScenario === "empty-projects") releasesByProject.clear();
if (prototypeRecoveryScenario === "empty-releases") releasesByProject.set("demo-aurora", []);

export function readPrototypeProjectReleases(projectId?: string): AIReqRelease[] {
  return structuredClone(
    projectId ? (releasesByProject.get(projectId) ?? []) : [...releasesByProject.values()].flat(),
  );
}
export function addPrototypeRelease(release: AIReqRelease): void {
  releasesByProject.set(release.projectId, [
    ...(releasesByProject.get(release.projectId) ?? []),
    structuredClone(release),
  ]);
}
