import { conversationReadOnlyReason, requirementsReviewCurrent, fullReviewCurrent, proposalVersion } from "@zcode/services/aireq";
import {
  getPrototypeWorkflow,
  applyPrototypeAction,
} from "./workflow.js";
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
    if (this.nativeDrafts.has(sessionId)) throw new Error("原生草稿已登记。");
    this.nativeDrafts.set(sessionId, { actor: this.actorKey(), ...workspace, original, exists });
  }
  actorKey(): string {
    const actor = currentIdentity();
    if (!actor) throw new Error("INVALID_IDENTITY");
    return `${actor.employeeId}:${actor.clientId}`;
  }
  isPublishedNativeSession(sessionId: string): boolean {
    const target = locate(sessionId);
    if (!target) return false;
    // 共享读取只来自业务 owner 登记的精确 canonical ref，不依赖首条聊天发布。
    return [...target.view.groups, ...target.view.drafts].some(
      (item) => item.projectId === target.ref.projectId && item.id === target.ref.irId,
    );
  }
  getNativeBinding(sessionId: string) {
    const draft = this.nativeDrafts.get(sessionId);
    // 草稿登记和收据要保留供重试，但其私有生命周期不能覆盖已接纳会话的共享读取。
    if (draft && draft.actor !== this.actorKey() && !this.isPublishedNativeSession(sessionId))
      throw new Error("fault.command.sessionNotFound");
    if (prototypeSessionReadIssue(sessionId))
      throw new Error("会话读取失败（模拟故障），请明确重新读取原会话。");
    if (sessionId.startsWith("prototype-skill-design:"))
      return prototypeSkillDesignBinding(sessionId);
    return locate(sessionId)?.ref.modelConfig;
  }
  admitNative(sessionId: string, commandId: string, text: string): void {
    const identity = currentIdentity();
    if (!identity) throw new Error("INVALID_IDENTITY");
    this.actors.set(`${sessionId}:${commandId}`, { ...identity });
    const result = this.results.get(`${sessionId}:${commandId}`);
    if (result && result.text !== text) throw new Error("相同消息编号不能用于不同正文。");
    if (
      consumePrototypeSendFailure() ||
      (identity.demo === "send-failure" && !this.failures.has(identity.clientId))
    ) {
      this.failures.add(identity.clientId);
      throw new Error("消息尚未接纳（一次性模拟失败），请明确重试。");
    }
    if (sessionId.startsWith("prototype-skill-design:")) {
      prototypeSkillDesignBinding(sessionId);
      return;
    }
    const target = locate(sessionId);
    if (!target) throw new Error("会话不属于当前可达 AIReq 业务。");
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
    if (reason) throw new Error(reason);
    if (ref.role === "reviewer") {
      const review = ref.phase === "solution" ? proposal?.review : proposal?.originalReview;
      if (!proposal || !(ref.phase === "solution" ? fullReviewCurrent(proposal) : requirementsReviewCurrent(proposal)) ||
        !review?.agents?.some((agent) => agent.session.sessionId === sessionId))
        throw new Error("历史评审仅供只读查看。");
    } else if (
      !proposal ||
      (ref.phase === "solution" && ref.round !== (proposal.proposalRound ?? 1)) ||
      proposal.status === "requirements-pr"
    )
      throw new Error("当前或历史会话只读，请回到有效讨论阶段。");
    this.admittedVersions.set(`${sessionId}:${commandId}`, proposalVersion(proposal!));
  }
  completeNative(sessionId: string, commandId: string, text: string): string {
    const actor = this.actors.get(`${sessionId}:${commandId}`);
    if (!actor) throw new Error("消息未接纳。");
    return withAIReqIdentity(actor, () => this.completeForActor(sessionId, commandId, text));
  }
  private completeForActor(sessionId: string, commandId: string, text: string): string {
    const key = `${sessionId}:${commandId}`;
    const prior = this.results.get(key);
    if (prior) {
      if (prior.text !== text) throw new Error("消息编号冲突。");
      return prior.reply;
    }
    let reply: string;
    if (sessionId.startsWith("prototype-skill-design:")) {
      assertSkillSession(sessionId);
      reply = prototypeSkillDesignReply(sessionId, text);
    } else {
      const target = locate(sessionId);
      if (!target) throw new Error("业务会话不存在。");
      const { ref, view } = target;
      const proposal = view.drafts.find((item) => item.id === ref.irId);
      const selection = { projectId: ref.projectId, irId: ref.irId };
      if (!proposal || this.admittedVersions.get(key) !== proposalVersion(proposal))
        throw new Error("当前材料已变化，拒绝迟到的原生业务完成结果。");
      if (ref.role === "reviewer")
        reply =
          "【模拟评审追问】\n\n当前独立意见与综合报告仅依据本轮 IR 和全部 SR。追问已记录，不修改需求、报告版本或人工决定。请结合材料核对范围、异常路径与可验收性。";
      else if (ref.phase === "solution" && text.trim()) {
        applyPrototypeAction({ type: "generateProposalSolution", ...selection }, selection, text);
        reply =
          "【服务端内存模拟】\n\n已按讨论拆分稳定 SR，并完善每个独立 change 的 proposal、design、tasks、specs、test-plan；同步 IR 依赖 JSON 与整体验收。整包旧审查和三方确认失效；未调用模型、Git，不执行开发任务。";
      } else if (proposal && text.trim()) {
        const initial = !proposal.files.some((file) => file.path === proposal.documentPath);
        applyPrototypeAction(
          {
            type: initial ? "generateRequirements" : "supplementRequirements",
            note: text,
            ...selection,
          },
          selection,
        );
        reply = initial
          ? "【服务端内存模拟】\n\n已整理 IR 原始业务需求文档，尚未创建 SR。请完善目标、范围和验收标准，再由单个业务需求 Agent 评审并人工通过。未调用真实模型。"
          : "【服务端内存模拟】\n\n已更新 IR 业务需求，原始短需求与历史保留；前置单评审及下游整包批准已失效，请重新评审。";
      } else
        reply =
          "附件已在当前原生会话接纳；尚无可用文字材料，需求文档尚未生成。请明确补充业务目标。";
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
    const review = [proposal?.originalReview, ...(proposal?.originalReviewHistory ?? []), proposal?.review, ...(proposal?.reviewHistory ?? [])].find((item) =>
      item?.agents?.some((agent) => agent.session.sessionId === sessionId),
    );
    return review?.agents?.find((agent) => agent.session.sessionId === sessionId)?.report;
  }
}
