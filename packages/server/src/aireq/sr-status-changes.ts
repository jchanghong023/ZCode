import { srProgressStatus } from "@zcode/services/aireq";
import type { AIReqWorkflowView } from "@zcode/services/aireq";

export type WorkflowUpdate = (view: AIReqWorkflowView) => boolean | void;

/** workflow owner 的提交步骤；失败事务与初始化不发布状态变化。 */
export function recordSrStatusChanges(previous: AIReqWorkflowView, next: AIReqWorkflowView): void {
  const key = (sr: AIReqWorkflowView["srs"][number]) => `${sr.projectId}:${sr.irId}:${sr.id}`;
  const before = new Map(previous.srs.map((sr) => [key(sr), srProgressStatus(sr)]));
  const formal = new Set(next.groups.map((group) => `${group.projectId}:${group.id}`));
  const at = new Date().toISOString();
  for (const sr of next.srs) {
    if (!formal.has(`${sr.projectId}:${sr.irId}`)) continue;
    const from = before.get(key(sr));
    const to = srProgressStatus(sr);
    // 分工、分析百分比和读取变化不等于有效状态变化，不能刷新动态时间。
    if (from !== undefined && from !== to) sr.statusChange = { from, to, at };
  }
}
