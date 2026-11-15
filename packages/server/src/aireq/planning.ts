import type {
  AIReqSrPlanningInput,
  AIReqWorkflowView,
} from "@zcode/services/aireq";
import { getEmployeeId, isEmployeeId } from "./identity.js";
import { operatePrototypeProgress } from "./progress.js";
import { prototypeSrSolutionAnalysis } from "./proposal-flow.js";

const samples: Record<string, AIReqSrPlanningInput> = {
  "sr-auth": {
    developerEmployeeId: "j00808875",
    plannedStart: "2026-11-11T09:00",
    plannedEnd: "2026-11-13T18:00",
  },
  "sr-session": {
    developerEmployeeId: "j00808876",
    plannedStart: "2026-11-11T09:00",
    plannedEnd: "2026-11-12T18:00",
  },
  "sr-permissions": {
    developerEmployeeId: "j00808875",
    plannedStart: "2026-11-16T09:00",
    plannedEnd: "2026-11-17T18:00",
  },
  "sr-audit": { plannedStart: "2026-11-18T09:00", plannedEnd: "2026-11-20T18:00" },
  "sr-onboarding": {
    developerEmployeeId: "j00808877",
    plannedStart: "2026-11-09T09:00",
    plannedEnd: "2026-11-10T18:00",
  },
};

/** 固定建议夹具，不调用 AI 或接入人员日历。人员与时间不写入需求文档。 */
export function withPrototypePlanning(view: AIReqWorkflowView): AIReqWorkflowView {
  const eligible = view.groups;
  return {
    ...view,
    srs: view.srs.map((sr) => {
      const group = eligible.find(
        (item) =>
          item.id === sr.irId && item.projectId === sr.projectId && item.srIds.includes(sr.id),
      );
      if (!group) return { ...sr, planning: undefined };
      const suggestion = sr.projectId === "demo-aurora" ? (samples[sr.id] ?? {}) : {};
      const developerEmployeeId = sr.planning
        ? sr.developerEmployeeId
        : sr.developerEmployeeId ?? group.contacts?.development ?? suggestion.developerEmployeeId;
      const testingEmployeeId = sr.planning
        ? sr.testingEmployeeId
        : sr.testingEmployeeId ?? group.contacts?.testing;
      return {
        ...sr,
        developerEmployeeId,
        testingEmployeeId,
        solutionAnalysis: prototypeSrSolutionAnalysis(group, sr.id),
        planning: {
          ...(sr.planning ?? {
            ...suggestion,
            suggestion,
            source: "ai",
            assumptions:
              "AI 建议样例：项目时区 Asia/Shanghai；计划不代表人员可用性或实际开发活动，需人工协调。",
          }),
          developerEmployeeId,
          testingEmployeeId,
        },
      };
    }),
  };
}

export async function updatePrototypeSrPlanning(
  projectId: string,
  irId: string,
  srId: string,
  input: AIReqSrPlanningInput,
): Promise<void> {
  const actor = getEmployeeId();
  if (!isEmployeeId(actor)) throw new Error("请先登录有效工号。");
  if (
    !input ||
    [input.developerEmployeeId, input.testingEmployeeId].some(
      (employeeId) => employeeId !== undefined && employeeId !== "" && !isEmployeeId(employeeId),
    )
  )
    throw new Error("开发、测试负责人工号须为一个小写字母后接 8 位数字。");
  for (const value of [input.plannedStart, input.plannedEnd]) {
    if (value === undefined || value === "") continue;
    // Date.parse 会将二月三十日等坏日期归一化，必须按上海时区回读逐分钟校验。
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
      throw new Error("请填写有效的计划日期和时间。");
    const timestamp = Date.parse(`${value}+08:00`);
    if (
      !Number.isFinite(timestamp) ||
      new Date(timestamp + 8 * 60 * 60_000).toISOString().slice(0, 16) !== value
    )
      throw new Error("请填写有效的计划日期和时间。");
  }
  if (Boolean(input.plannedStart) !== Boolean(input.plannedEnd))
    throw new Error("请同时填写开始和结束时间，或同时清空以取消排期。");
  if (input.plannedStart && input.plannedEnd && input.plannedEnd <= input.plannedStart)
    throw new Error("计划结束时间必须晚于开始时间。");
  // 分工和排期一次原子写回 SR，不能由独立 manualPlans 覆盖联系人或待办事实。
  operatePrototypeProgress(
    projectId, irId, srId,
    { operationId: input.operationId!, expectedRevision: input.expectedRevision! },
    "updateSrPlanning", input,
    (state, group, target, employeeId, at) => {
      const sr = target!;
      const projected = withPrototypePlanning({ ...state, groups: [group], srs: [sr] }).srs[0]!;
      sr.developerEmployeeId = Object.hasOwn(input, "developerEmployeeId") ? input.developerEmployeeId || undefined : projected.developerEmployeeId;
      sr.testingEmployeeId = Object.hasOwn(input, "testingEmployeeId") ? input.testingEmployeeId || undefined : projected.testingEmployeeId;
      sr.planning = {
        ...projected.planning!,
        developerEmployeeId: undefined,
        testingEmployeeId: undefined,
        plannedStart: Object.hasOwn(input, "plannedStart") ? input.plannedStart || undefined : projected.planning?.plannedStart,
        plannedEnd: Object.hasOwn(input, "plannedEnd") ? input.plannedEnd || undefined : projected.planning?.plannedEnd,
        source: "manual",
        updatedBy: employeeId,
        updatedAt: at,
      };
    },
  );
}
