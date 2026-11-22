import { businessRule } from "./errors.js";
import { prototypeRecoveryScenario } from "./recovery.js";
import {
  conversationReadOnlyReason,
  requirementsReviewCurrent,
  fullReviewCurrent,
  proposalVersion,
} from "@zcode/services/aireq";
import type { ModelSelection } from "@zcode/shared";
import {
  getPrototypeWorkflow,
  applyPrototypeAction,
  readPrototypeNativeContext,
  requireProjectRole,
} from "./workflow.js";
import {
  prototypeSkillDesignReply,
  prototypeSkillDesignBinding,
  assertSkillSession,
} from "./skill-design.js";
import { currentIdentity, withAIReqIdentity } from "./identity.js";
import { consumePrototypeSendFailure, prototypeSessionReadIssue } from "./recovery.js";

interface NativeExecutionSnapshot {
  text: string;
  version?: string;
  modelSelection?: ModelSelection;
  promptSnapshot: string;
}

export class AIReqNativeBusiness {
  private readonly results = new Map<string, { text: string; reply: string }>();
  private readonly failures = new Set<string>();
  private readonly actors = new Map<string, import("@zcode/services/aireq").AIReqIdentity>();
  private readonly admittedTexts = new Map<string, string>();
  private readonly executionSnapshots = new Map<string, NativeExecutionSnapshot>();
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
    // 资格只取同 owner 当前 canonical 引用；热路径不应按每个项目重复派生全局待办和进度。
    return readPrototypeNativeContext(sessionId)?.published === true;
  }
  getNativeBinding(sessionId: string) {
    const draft = this.nativeDrafts.get(sessionId);
    // 草稿登记和收据要保留供重试，但其私有生命周期不能覆盖已接纳会话的共享读取。
    if (draft && draft.actor !== this.actorKey() && !this.isPublishedNativeSession(sessionId))
      throw businessRule("会话不存在或当前无法访问，请返回需求重新打开。");
    if (prototypeSessionReadIssue(sessionId)) throw businessRule("会话读取失败，请重试。");
    if (sessionId.startsWith("prototype-skill-design:"))
      return prototypeSkillDesignBinding(sessionId);
    return readPrototypeNativeContext(sessionId)?.ref.modelConfig;
  }
  assertNativeWritable(sessionId: string): void {
    if (!currentIdentity()) throw businessRule("连接身份无效，请重新进入工作区。");
    if (sessionId.startsWith("prototype-skill-design:")) assertSkillSession(sessionId);
    else this.currentProposal(sessionId);
  }
  admitNative(sessionId: string, commandId: string, text: string): void {
    const identity = currentIdentity();
    if (!identity) throw businessRule("连接身份无效，请重新进入工作区。");
    const key = `${sessionId}:${commandId}`;
    const admittedActor = this.actors.get(key);
    // 接纳记录是消息的不可变身份；失败重试不能抢占原操作者或替换已接纳正文。
    if (
      admittedActor &&
      (admittedActor.employeeId !== identity.employeeId ||
        admittedActor.clientId !== identity.clientId ||
        this.admittedTexts.get(key) !== text)
    )
      throw businessRule("相同消息编号不能用于不同正文或操作者。");
    if (
      consumePrototypeSendFailure() ||
      (prototypeRecoveryScenario === "send-failure" && !this.failures.has(identity.clientId))
    ) {
      this.failures.add(identity.clientId);
      throw businessRule("消息未发送成功，请重试。");
    }
    this.assertNativeWritable(sessionId);
    this.actors.set(key, { ...identity });
    this.admittedTexts.set(key, text);
  }
  /** Admission is immutable; freeze actual turn selection and its session's instructions at dispatch. */
  beginNative(
    sessionId: string,
    commandId: string,
    text: string,
    modelSelection?: ModelSelection,
  ): void {
    const key = `${sessionId}:${commandId}`;
    const actor = this.actors.get(key);
    if (!actor) throw businessRule("消息未接纳。");
    withAIReqIdentity(actor, () => {
      const prior = this.executionSnapshots.get(key);
      if (prior) {
        if (prior.text !== text) throw businessRule("已开始执行的消息正文不能替换。");
        return;
      }
      if (sessionId.startsWith("prototype-skill-design:")) {
        assertSkillSession(sessionId);
        this.executionSnapshots.set(key, { text, modelSelection, promptSnapshot: "" });
        return;
      }
      // 前项可在此项等待期间更新材料；开始时冻结一次，完成或重试不能换版本或重读设置。
      const { proposal, ref } = this.currentProposal(sessionId);
      this.executionSnapshots.set(key, {
        text,
        version: proposalVersion(proposal),
        modelSelection,
        promptSnapshot: ref.modelConfig?.promptSnapshot ?? "",
      });
    });
  }
  private currentProposal(sessionId: string) {
    const target = readPrototypeNativeContext(sessionId, true);
    if (!target) throw businessRule("会话不属于当前可达 AIReq 业务。");
    const { ref, draft: proposal } = target;
    if (ref.phase === "solution") requireProjectRole(ref.projectId, "development");
    const reason = conversationReadOnlyReason(
      { drafts: proposal ? [proposal] : [] },
      {
        projectId: ref.projectId,
        irId: ref.irId,
        srId: ref.srId,
        discussionPhase: ref.phase === "solution" ? "solution" : "requirements",
        proposalStep:
          ref.phase === "solution"
            ? "solution"
            : ref.role === "reviewer"
              ? "requirements-review"
              : "requirements",
      },
      { proposalDiscussion: true },
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
    } else if (!proposal || ref.round !== (proposal.proposalRound ?? 1))
      throw businessRule("当前或历史会话只读，请回到有效讨论阶段。");
    return { proposal: proposal!, ref };
  }
  discardNative(sessionId: string, commandId: string): void {
    const key = `${sessionId}:${commandId}`;
    // 取消只撤销未完成的私有接纳，已完成收据仍用于同一命令的幂等读取。
    if (this.results.has(key)) return;
    this.actors.delete(key);
    this.admittedTexts.delete(key);
    this.executionSnapshots.delete(key);
  }
  completeNative(
    sessionId: string,
    commandId: string,
    text: string,
  ): { reply: string; modelId?: string } {
    const key = `${sessionId}:${commandId}`;
    const actor = this.actors.get(key);
    if (!actor) throw businessRule("消息未接纳。");
    const execution = this.executionSnapshots.get(key);
    if (!execution || execution.text !== text) throw businessRule("完成消息正文与执行快照不一致。");
    const reply = withAIReqIdentity(actor, () =>
      this.completeForActor(sessionId, commandId, execution),
    );
    return { reply, modelId: execution.modelSelection?.modelId };
  }
  private completeForActor(
    sessionId: string,
    commandId: string,
    execution: NativeExecutionSnapshot,
  ): string {
    const { text, version } = execution;
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
      // 送审可能未改变文件摘要，但已关闭需求澄清的写权限；完成时沿用发送门禁。
      const { ref, proposal } = this.currentProposal(sessionId);
      const selection = { projectId: ref.projectId, irId: ref.irId };
      if (version !== proposalVersion(proposal))
        throw businessRule("当前材料已变化，拒绝迟到的原生业务完成结果。");
      if (!text.trim()) reply = "本次输入已在当前会话接纳；未生成文字分析或修改材料。";
      else if (ref.role === "reviewer")
        reply = "追问已记录在当前会话；本次未修改需求材料、评审报告或人工决定。";
      else {
        const initial = !proposal.files.some((file) => file.path === proposal.documentPath);
        if (ref.phase === "solution")
          applyPrototypeAction({ type: "generateProposalSolution", ...selection }, selection, text);
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
    const target = readPrototypeNativeContext(sessionId, true);
    if (!target) return undefined;
    const proposal = target.formal ?? target.draft;
    const review = [
      proposal?.originalReview,
      ...(proposal?.originalReviewHistory ?? []),
      proposal?.review,
      ...(proposal?.reviewHistory ?? []),
    ].find((item) => item?.agents?.some((agent) => agent.session.sessionId === sessionId));
    return review?.agents?.find((agent) => agent.session.sessionId === sessionId)?.report;
  }
}
