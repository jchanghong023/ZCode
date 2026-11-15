import { conversationReadOnlyReason, requirementsReviewCurrent } from "@zcode/services/aireq";
import {
  getPrototypeWorkflow,
  applyPrototypeAction,
  publishPrototypeProposalForSession,
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
  private readonly nativeDrafts = new Map<
    string,
    {
      actor: string;
      workspacePath: string;
      workspaceIdentity?: string;
      original: () => boolean;
      exists: () => boolean;
      proposalKey?: string;
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
  assertPreparedDraft(
    sessionId: string,
    workspace: { workspacePath: string; workspaceIdentity?: string },
    proposalKey: string,
  ): void {
    const draft = this.nativeDrafts.get(sessionId);
    // 只接纳原生 owner 已登记的草稿；未知编号绝不能通过业务创建补种。
    if (
      !draft ||
      !draft.exists() ||
      draft.actor !== this.actorKey() ||
      draft.workspacePath !== workspace.workspacePath ||
      draft.workspaceIdentity !== workspace.workspaceIdentity ||
      (draft.proposalKey
        ? draft.proposalKey !== proposalKey
        : !draft.original() || Boolean(locate(sessionId)))
    )
      throw new Error("预热草稿不存在、已使用或不属于当前操作者及工作区。");
  }
  bindPreparedDraft(sessionId: string, proposalKey: string): void {
    this.nativeDrafts.get(sessionId)!.proposalKey = proposalKey;
  }
  publishNativeAdmission(sessionId: string): void {
    // 仅在原生命令已写入接纳投影后发布；预热和失败重试都不产生可见提案。
    publishPrototypeProposalForSession(sessionId);
  }
  actorKey(): string {
    const actor = currentIdentity();
    if (!actor) throw new Error("INVALID_IDENTITY");
    return `${actor.employeeId}:${actor.clientId}`;
  }
  isPublishedNativeSession(sessionId: string): boolean {
    const target = locate(sessionId);
    if (!target) return false;
    // 绑定 proposalKey 仅表示首发准备；共享权限必须来自已发布业务的精确 canonical ref。
    return [...target.view.groups, ...target.view.drafts].some(
      (item) =>
        item.projectId === target.ref.projectId &&
        item.id === target.ref.irId &&
        !item.pendingFirstMessage,
    );
  }
  protected resolveNativeTaskSession(sessionId: string) {
    const target = locate(sessionId);
    // 修复原因：运行样例只挂在已发布的 canonical 业务会话，不能借草稿或未知编号解锁。
    if (!target || !this.isPublishedNativeSession(sessionId)) return undefined;
    const binding = this.getNativeBinding(sessionId);
    const project = target.view.projects.find((item) => item.id === target.ref.projectId);
    if (!binding || !project) return undefined;
    return {
      sessionId,
      projectId: project.id,
      workspacePath: project.root,
      workspaceIdentity: `aireq-mock:${project.id}`,
      binding,
    };
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
      if (
        !proposal ||
        !requirementsReviewCurrent(proposal) ||
        !proposal.review?.agents?.some((agent) => agent.session.sessionId === sessionId)
      )
        throw new Error("历史评审仅供只读查看。");
    } else if (
      !proposal ||
      (ref.phase === "solution" && ref.round !== (proposal.proposalRound ?? 1)) ||
      proposal.status === "requirements-pr"
    )
      throw new Error("当前或历史会话只读，请回到有效讨论阶段。");
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
      if (ref.role === "reviewer")
        reply =
          "【模拟评审追问】\n\n当前独立意见与综合报告仅依据本轮 IR 和全部 SR。追问已记录，不修改需求、报告版本或人工决定。请结合材料核对范围、异常路径与可验收性。";
      else if (ref.phase === "solution" && text.trim()) {
        applyPrototypeAction({ type: "generateProposalSolution", ...selection }, selection, text);
        reply =
          "【服务端内存模拟】\n\n已根据本轮方案讨论同步更新 design.md 和 sr-dependencies.json，包含全部 SR 的依赖、正数工作日预估与假设。旧文件确认已失效，请在右侧逐文件查看当前版本。未调用模型、Git 或外部服务。";
      } else if (proposal && text.trim()) {
        const initial = !proposal.srIds.length;
        applyPrototypeAction(
          {
            type: initial ? "generateRequirements" : "supplementRequirements",
            note: text,
            ...selection,
          },
          selection,
        );
        reply = initial
          ? "【服务端内存模拟】\n\n已按输入整理 IR，并建立“业务操作与结果展示”“异常处理与恢复”两个稳定 SR。右侧可阅读当前需求；请继续补充范围和验收标准，再发起四路评审。未调用真实模型。"
          : "【服务端内存模拟】\n\n已将补充写入当前 IR 与全部 SR，保留稳定编号；旧评审、方案与文件确认不再作为当前版本依据。请重新评审本轮需求。";
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
    const review = [proposal?.review, ...(proposal?.reviewHistory ?? [])].find((item) =>
      item?.agents?.some((agent) => agent.session.sessionId === sessionId),
    );
    return review?.agents?.find((agent) => agent.session.sessionId === sessionId)?.report;
  }
}
