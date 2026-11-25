import type {
  AIReqDiscussionAgent,
  AIReqRequirementGroup,
  AIReqSelection,
  AIReqWorkflowView,
} from "./contract.js";

/** 服务端已经按当前工号过滤会话，列表和文档区都进入这个 IR 实际可用的讨论。 */
export function primaryDiscussionAgent(
  group: AIReqRequirementGroup,
): AIReqDiscussionAgent | undefined {
  return (
    group.sessions.find((session) => session.phase === "requirements")?.phase ??
    group.sessions[0]?.phase
  );
}

const objectLinkKeys = [
  "aireqProject",
  "aireqRelease",
  "aireqIr",
  "aireqSr",
  "aireqAgent",
] as const;

type ObjectLink = {
  projectId: string;
  releaseId?: string;
  irId: string;
  srId?: string;
  agent: AIReqDiscussionAgent;
};

export function readObjectLink(href = window.location.href): ObjectLink | "invalid" | null {
  const query = new URL(href).searchParams;
  if (!objectLinkKeys.some((key) => query.has(key))) return null;
  const [projectId, releaseId, irId, srId] = objectLinkKeys
    .slice(0, 4)
    .map((key) => query.get(key)?.trim());
  if (!projectId || !irId || (query.has("aireqSr") && !srId)) return "invalid";
  const agent = query.get("aireqAgent") ?? "requirements";
  if (agent !== "requirements" && agent !== "solution") return "invalid";
  return { projectId, ...(releaseId ? { releaseId } : {}), irId, ...(srId ? { srId } : {}), agent };
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

export function selectionFromObjectLink(link: ObjectLink): AIReqSelection {
  return {
    projectId: link.projectId,
    irId: link.irId,
    ...(link.srId ? { srId: link.srId } : {}),
    discussionPhase: link.agent,
  };
}

/** 先在同一服务端快照核对项目及对象归属，再接纳地址。 */
export function resolveObjectLink(link: ObjectLink, view: AIReqWorkflowView): boolean {
  return (
    view.projects.some((item) => item.id === link.projectId) &&
    view.requirements.some((item) => item.projectId === link.projectId && item.id === link.irId) &&
    (!link.srId ||
      view.srs.some(
        (item) =>
          item.projectId === link.projectId && item.irId === link.irId && item.id === link.srId,
      ))
  );
}
