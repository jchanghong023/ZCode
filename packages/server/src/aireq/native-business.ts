import { businessRule } from "./errors.js";
import { prototypeRecoveryScenario } from "./recovery.js";
import {
  conversationReadOnlyReason,
  requirementsReviewCurrent,
  fullReviewCurrent,
  proposalVersion,
} from "@zcode/services/aireq";
import { getPrototypeWorkflow, applyPrototypeAction } from "./workflow.js";
import {
  prototypeSkillDesignReply,
  prototypeSkillDesignBinding,
  assertSkillSession,
} from "./skill-design.js";
import { currentIdentity, withAIReqIdentity } from "./identity.js";
import { consumePrototypeSendFailure, prototypeSessionReadIssue } from "./recovery.js";

function locate(sessionId: string) {
  for (const project of getPrototypeWorkflow().projects) {
    const index = getPrototypeWorkflow({ projectId: project.id });
    const ref = index.sessions.find((item) => item.sessionId === sessionId);
    if (ref) return { ref, view: getPrototypeWorkflow({ projectId: project.id, irId: ref.irId }) };
  }
  return undefined;
}
export class AIReqNativeBusiness {
  private readonly results = new Map<string, { text: string; reply: string }>();
  private readonly failures = new Set<string>();
  private readonly actors = new Map<string, import("@zcode/services/aireq").AIReqIdentity>();
  private readonly admittedVersions = new Map<string, string>();
  private readonly nativeDrafts = new Map<
    string,
    {
      actor: string;
      workspacePath: string;
      workspaceIdentity?: string;
      original: () => boolean;
      exists: () => boolean;
    }
  >();
  registerNativeDraft(
    sessionId: string,
    workspace: { workspacePath: string; workspaceIdentity?: string },
    original: () => boolean,
    exists: () => boolean,
  ): void {
    if (this.nativeDrafts.has(sessionId)) throw businessRule("原生草稿已登记。");
    this.nativeDrafts.set(sessionId, { actor: this.actorKey(), ...workspace, original, exists });
  }
  actorKey(): string {
    const actor = currentIdentity();
    if (!actor) throw businessRule("连接身份无效，请重新进入工作区。");
    return `${actor.employeeId}:${actor.clientId}`;
  }
  isPublishedNativeSession(sessionId: string): boolean {
    const target = locate(sessionId);
    if (!target) return false;
    // 共享读取只来自业务服务 登记的精确 canonical ref，不依赖首条聊天发布。
    return [...target.view.groups, ...target.view.drafts].some(
      (item) => item.projectId === target.ref.projectId && item.id === target.ref.irId,
    );
  }
  getNativeBinding(sessionId: string) {
    const draft = this.nativeDrafts.get(sessionId);
    // 草稿登记和收据要保留供重试，但其私有生命周期不能覆盖已接纳会话的共享读取。
    if (draft && draft.actor !== this.actorKey() && !this.isPublishedNativeSession(sessionId))
      throw businessRule("会话不存在或当前无法访问，请返回需求重新打开。");
    if (prototypeSessionReadIssue(sessionId)) throw businessRule("会话读取失败，请重试。");
    if (sessionId.startsWith("prototype-skill-design:"))
      return prototypeSkillDesignBinding(sessionId);
    return locate(sessionId)?.ref.modelConfig;
  }
  admitNative(sessionId: string, commandId: string, text: string): void {
    const identity = currentIdentity();
    if (!identity) throw businessRule("连接身份无效，请重新进入工作区。");
    this.actors.set(`${sessionId}:${commandId}`, { ...identity });
    const result = this.results.get(`${sessionId}:${commandId}`);
    if (result && result.text !== text) throw businessRule("相同消息编号不能用于不同正文。");
    if (
      consumePrototypeSendFailure() ||
      (prototypeRecoveryScenario === "send-failure" && !this.failures.has(identity.clientId))
    ) {
      this.failures.add(identity.clientId);
      throw businessRule("消息未发送成功，请重试。");
    }
    if (sessionId.startsWith("prototype-skill-design:")) {
      prototypeSkillDesignBinding(sessionId);
      return;
    }
    const target = locate(sessionId);
    if (!target) throw businessRule("会话不属于当前可达 AIReq 业务。");
    const { ref, view } = target;
    const proposal = view.drafts.find((item) => item.id === ref.irId);
    const reason = conversationReadOnlyReason(
      view,
      {
        projectId: ref.projectId,
        irId: ref.irId,
        srId: ref.srId,
        discussionPhase: ref.phase === "solution" ? "solution" : "requirements",
      },
      { proposalDiscussion: true, codeDevelopment: false },
    );
    if (reason) throw businessRule(reason);
    if (ref.role === "reviewer") {
      const review = ref.phase === "solution" ? proposal?.review : proposal?.originalReview;
      if (
        !proposal ||
        !(ref.phase === "solution"
          ? fullReviewCurrent(proposal)
          : requirementsReviewCurrent(proposal)) ||
        !review?.agents?.some((agent) => agent.session.sessionId === sessionId)
      )
        throw businessRule("历史评审仅供只读查看。");
    } else if (
      !proposal ||
      (ref.phase === "solution" && ref.round !== (proposal.proposalRound ?? 1)) ||
      proposal.status === "requirements-pr"
    )
      throw businessRule("当前或历史会话只读，请回到有效讨论阶段。");
    this.admittedVersions.set(`${sessionId}:${commandId}`, proposalVersion(proposal!));
  }
  completeNative(sessionId: string, commandId: string, text: string): string {
    const actor = this.actors.get(`${sessionId}:${commandId}`);
    if (!actor) throw businessRule("消息未接纳。");
    return withAIReqIdentity(actor, () => this.completeForActor(sessionId, commandId, text));
  }
  private completeForActor(sessionId: string, commandId: string, text: string): string {
    const key = `${sessionId}:${commandId}`;
    const prior = this.results.get(key);
    if (prior) {
      if (prior.text !== text) throw businessRule("消息编号冲突。");
      return prior.reply;
    }
    let reply: string;
    if (sessionId.startsWith("prototype-skill-design:")) {
      assertSkillSession(sessionId);
      reply = text.trim()
        ? prototypeSkillDesignReply(sessionId, text)
        : "本次输入已在当前会话接纳；未生成文字分析或修改材料。";
    } else {
      const target = locate(sessionId);
      if (!target) throw businessRule("业务会话不存在。");
      const { ref, view } = target;
      const proposal = view.drafts.find((item) => item.id === ref.irId);
      const selection = { projectId: ref.projectId, irId: ref.irId };
      if (!proposal || this.admittedVersions.get(key) !== proposalVersion(proposal))
        throw businessRule("当前材料已变化，拒绝迟到的原生业务完成结果。");
      if (!text.trim()) reply = "本次输入已在当前会话接纳；未生成文字分析或修改材料。";
      else if (ref.role === "reviewer")
        reply = "追问已记录在当前会话；本次未修改需求材料、评审报告或人工决定。";
      else {
        const initial = !proposal.files.some((file) => file.path === proposal.documentPath);
        if (ref.phase === "solution")
          applyPrototypeAction(
            { type: "generateProposalSolution", ...selection },
            selection,
            text,
          );
        else
          applyPrototypeAction(
            {
              type: initial ? "generateRequirements" : "supplementRequirements",
              note: text,
              ...selection,
            },
            selection,
          );
        // 完成回复只引用 owner 提交后的材料版本，不能把固定产物描述为专属分析。
        const changed = getPrototypeWorkflow(selection).materials.filter(
          (material) =>
            material.irId === ref.irId &&
            !proposal.files.some(
              (file) => file.path === material.path && file.sha256 === material.sha256,
            ),
        );
        reply = `已接纳本次${ref.phase === "solution" ? "方案" : "需求"}讨论。${
          changed.length
            ? `本次更新材料：\n${changed
                .map((material) => `- ${material.path}（SHA-256：${material.sha256}）`)
                .join("\n")}`
            : "本次未改变材料内容。"
        }`;
      }
    }
    this.results.set(key, { text, reply });
    return reply;
  }
  seedNative(sessionId: string): string | undefined {
    const target = locate(sessionId);
    if (!target) return undefined;
    const proposal = [...target.view.groups, ...target.view.drafts].find(
      (item) => item.id === target.ref.irId,
    );
    const review = [
      proposal?.originalReview,
      ...(proposal?.originalReviewHistory ?? []),
      proposal?.review,
      ...(proposal?.reviewHistory ?? []),
    ].find((item) => item?.agents?.some((agent) => agent.session.sessionId === sessionId));
    return review?.agents?.find((agent) => agent.session.sessionId === sessionId)?.report;
  }
}
