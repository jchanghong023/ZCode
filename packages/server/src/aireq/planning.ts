import { businessRule } from "./errors.js";
import type { AIReqSrPlanningInput, AIReqWorkflowView } from "@zcode/services/aireq";
import { getEmployeeId, isEmployeeId } from "./identity.js";
import { operatePrototypeProgress } from "./progress.js";
import { prototypeSrSolutionAnalysis } from "./proposal-flow.js";

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
      // 没有实际建议时不生成规划；现有分工与联系人回退不构成 AI 建议。
      const developerEmployeeId = sr.planning
        ? sr.developerEmployeeId
        : (sr.developerEmployeeId ?? group.contacts?.development);
      const testingEmployeeId = sr.planning
        ? sr.testingEmployeeId
        : (sr.testingEmployeeId ?? group.contacts?.testing);
      return {
        ...sr,
        developerEmployeeId,
        testingEmployeeId,
        solutionAnalysis: prototypeSrSolutionAnalysis(group, sr.id),
        planning: sr.planning
          ? { ...sr.planning, developerEmployeeId, testingEmployeeId }
          : undefined,
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
  if (!isEmployeeId(actor)) throw businessRule("请先登录有效工号。");
  if (
    !input ||
    [input.developerEmployeeId, input.testingEmployeeId].some(
      (employeeId) => employeeId !== undefined && employeeId !== "" && !isEmployeeId(employeeId),
    )
  )
    throw businessRule("开发、测试负责人工号须为一个小写字母后接 8 位数字。");
  for (const value of [input.plannedStart, input.plannedEnd]) {
    if (value === undefined || value === "") continue;
    // Date.parse 会将二月三十日等坏日期归一化，必须按上海时区回读逐分钟校验。
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
      throw businessRule("请填写有效的计划日期和时间。");
    const timestamp = Date.parse(`${value}+08:00`);
    if (
      !Number.isFinite(timestamp) ||
      new Date(timestamp + 8 * 60 * 60_000).toISOString().slice(0, 16) !== value
    )
      throw businessRule("请填写有效的计划日期和时间。");
  }
  if (Boolean(input.plannedStart) !== Boolean(input.plannedEnd))
    throw businessRule("请同时填写开始和结束时间，或同时清空以取消排期。");
  if (input.plannedStart && input.plannedEnd && input.plannedEnd <= input.plannedStart)
    throw businessRule("计划结束时间必须晚于开始时间。");
  // 分工和排期一次原子写回 SR，不能由独立 manualPlans 覆盖联系人或待办事实。
  operatePrototypeProgress(
    projectId,
    irId,
    srId,
    { operationId: input.operationId!, expectedRevision: input.expectedRevision! },
    "updateSrPlanning",
    input,
    (state, group, target, employeeId, at) => {
      const sr = target!;
      const projected = withPrototypePlanning({ ...state, groups: [group], srs: [sr] }).srs[0]!;
      sr.developerEmployeeId = Object.hasOwn(input, "developerEmployeeId")
        ? input.developerEmployeeId || undefined
        : projected.developerEmployeeId;
      sr.testingEmployeeId = Object.hasOwn(input, "testingEmployeeId")
        ? input.testingEmployeeId || undefined
        : projected.testingEmployeeId;
      sr.planning = {
        ...projected.planning,
        assumptions: projected.planning?.assumptions ?? "",
        developerEmployeeId: undefined,
        testingEmployeeId: undefined,
        plannedStart: Object.hasOwn(input, "plannedStart")
          ? input.plannedStart || undefined
          : projected.planning?.plannedStart,
        plannedEnd: Object.hasOwn(input, "plannedEnd")
          ? input.plannedEnd || undefined
          : projected.planning?.plannedEnd,
        source: "manual",
        updatedBy: employeeId,
        updatedAt: at,
      };
    },
  );
}
