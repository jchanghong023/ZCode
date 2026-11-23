import type { AIReqReviewAgentId, AIReqWorkflowTarget, AIReqWorkflowView } from "./contract.js";
import { requirementObjectLink } from "./navigationState.js";
import {
  proposalTaskSelection,
  proposalTasks,
  type ProposalTask,
} from "./proposals/proposalTasks.js";

const objectLinkKeys = [
  "aireqProject",
  "aireqRelease",
  "aireqIr",
  "aireqSr",
  "aireqTask",
  "aireqAgent",
] as const;
type ObjectLink = {
  projectId: string;
  releaseId: string;
  irId: string;
  srId?: string;
  task?: ProposalTask;
  agent?: AIReqReviewAgentId;
};
export function readObjectLink(href = window.location.href): ObjectLink | "invalid" | null {
  const query = new URL(href).searchParams;
  if (!objectLinkKeys.some((key) => query.has(key))) return null;
  const [projectId, releaseId, irId, srId] = objectLinkKeys
    .slice(0, 4)
    .map((key) => query.get(key)?.trim());
  if (!projectId || !releaseId || !irId || (query.has("aireqSr") && !srId)) return "invalid";
  const taskValue = query.get("aireqTask");
  const task = proposalTasks.find((item) => item === taskValue);
  const agentValue = query.get("aireqAgent");
  const agent = (["a", "b", "c", "summary"] as const).find((item) => item === agentValue);
  if ((taskValue !== null && !task) || (agentValue !== null && !agent)) return "invalid";
  if (agent && task !== "solutionReviewDetail" && task !== "requirementsReviewDetail")
    return "invalid";
  if (task === "requirementsReviewDetail" && agent && agent !== "a") return "invalid";
  return {
    projectId,
    releaseId,
    irId,
    ...(srId ? { srId } : {}),
    ...(task ? { task } : {}),
    ...(agent ? { agent } : {}),
  };
}
export function withoutObjectLink(url: URL) {
  objectLinkKeys.forEach((key) => url.searchParams.delete(key));
  return url;
}
export function clearAIReqObjectLink() {
  window.history.replaceState(
    window.history.state,
    "",
    withoutObjectLink(new URL(window.location.href)),
  );
}
export function proposalTaskUrl(
  base: string,
  selection: AIReqWorkflowTarget,
  releaseId: string,
  task: ProposalTask,
) {
  const link = requirementObjectLink(base, selection, releaseId);
  if (!link) return withoutObjectLink(new URL(base));
  const url = new URL(link);
  url.searchParams.set("aireqTask", task);
  if (task === "solutionReviewDetail" || task === "requirementsReviewDetail")
    url.searchParams.set(
      "aireqAgent",
      selection.reviewAgent ?? (task === "requirementsReviewDetail" ? "a" : "summary"),
    );
  return url;
}

/** 历史任务链接在转正后保留对象归属，不再恢复已结束的编辑任务。 */
export function selectionFromObjectLink(link: ObjectLink, formal: boolean): AIReqWorkflowTarget {
  const target = {
    projectId: link.projectId,
    irId: link.irId,
    ...(link.srId ? { srId: link.srId } : {}),
  };
  if (formal) return target;
  return link.task ? proposalTaskSelection(target, link.task, link.agent, true) : target;
}
/** 先在同一服务端快照核对项目、版本及对象归属，再接纳地址。 */
export function resolveObjectLink(
  link: ObjectLink,
  view: AIReqWorkflowView,
): "formal" | "proposal" | null {
  const project = view.projects.find((item) => item.id === link.projectId);
  const release = view.releases.find(
    (item) => item.projectId === link.projectId && item.id === link.releaseId,
  );
  const group = view.requirements.find(
    (item) => item.projectId === link.projectId && item.id === link.irId,
  );
  const sr =
    !link.srId ||
    view.srs.some(
      (item) =>
        item.projectId === link.projectId && item.irId === link.irId && item.id === link.srId,
    );
  if (!project || !release || !group || group.releaseId !== release.id || !sr) return null;
  return group.archive ? "formal" : "proposal";
}
