import { businessRule } from "./errors.js";
import { prototypeRecoveryScenario } from "./recovery.js";
import {
  conversationReadOnlyReason,
  requirementsReviewCurrent,
  fullReviewCurrent,
  proposalVersion,
  type AIReqIdentity,
} from "@zcode/services/aireq";
import type { ModelSelection } from "@zcode/shared";
import type { NativeProposalOutput } from "./proposal-mutations.js";
import {
  stagePrototypeNativeMaterials,
  applyPrototypeAction,
  readPrototypeNativeContext,
  requireProjectRole,
} from "./workflow.js";
import {
  stagePrototypeSkillDiscussion,
  commitPrototypeSkillDiscussion,
  prototypeSkillDesignBinding,
  assertSkillSession,
  type StagedSkillDiscussion,
} from "./skill-design.js";
import { currentIdentity, withAIReqIdentity } from "./identity.js";
import { consumePrototypeSendFailure, prototypeSessionReadIssue } from "./recovery.js";

export interface AIReqNativeTurnResult {
  commandIds: readonly string[];
  reply: string;
  output:
    | { kind: "none" }
    | { kind: "skill"; discussion: StagedSkillDiscussion }
    | { kind: "proposal"; note: string; materials: NativeProposalOutput };
}

interface NativeExecutionSnapshot {
  text: string;
  effectiveText: string;
  version?: string;
  modelSelection?: ModelSelection;
  promptSnapshot: string;
}

export class AIReqNativeBusiness {
  private readonly failures = new Set<string>();
  private readonly admissions = new Map<string, { actor: AIReqIdentity; text: string }>();
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
    const key = JSON.stringify([sessionId, commandId]);
    const prior = this.admissions.get(key);
    // 接纳记录是消息的不可变身份；引导和跟进也不能替换原操作者或正文。
    if (
      prior &&
      (prior.actor.employeeId !== identity.employeeId ||
        prior.actor.clientId !== identity.clientId ||
        prior.text !== text)
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
    this.admissions.set(key, { actor: { ...identity }, text });
  }
  /** Admission is immutable; freeze actual turn selection and its session's instructions at dispatch. */
  beginNative(
    sessionId: string,
    commandId: string,
    text: string,
    modelSelection?: ModelSelection,
    effectiveText = text,
  ): void {
    const key = JSON.stringify([sessionId, commandId]);
    const admitted = this.admissions.get(key);
    if (!admitted || admitted.text !== text) throw businessRule("消息与接纳记录不一致。");
    withAIReqIdentity(admitted.actor, () => {
      const prior = this.executionSnapshots.get(key);
      if (prior) {
        if (prior.text !== text || prior.effectiveText !== effectiveText)
          throw businessRule("已开始执行的输入不能替换。");
        return;
      }
      if (sessionId.startsWith("prototype-skill-design:")) {
        assertSkillSession(sessionId);
        this.executionSnapshots.set(key, {
          text,
          effectiveText,
          modelSelection,
          promptSnapshot: "",
        });
        return;
      }
      // 前项可在此项等待期间更新材料；开始时冻结一次，完成或重试不能换版本或重读设置。
      const { proposal, ref } = this.currentProposal(sessionId);
      this.executionSnapshots.set(key, {
        text,
        effectiveText,
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
    const key = JSON.stringify([sessionId, commandId]);
    this.admissions.delete(key);
    this.executionSnapshots.delete(key);
  }

  private currentExecution(sessionId: string, commandId: string) {
    const key = JSON.stringify([sessionId, commandId]);
    const admitted = this.admissions.get(key);
    const execution = this.executionSnapshots.get(key);
    if (!admitted || !execution || admitted.text !== execution.text)
      throw businessRule("当前输入未进入执行或已取消。");
    // 根输入与引导输入可能属于不同工号，每项都必须按自己的权限重验。
    withAIReqIdentity(admitted.actor, () => {
      if (sessionId.startsWith("prototype-skill-design:")) {
        assertSkillSession(sessionId);
      } else {
        const { proposal } = this.currentProposal(sessionId);
        if (execution.version !== proposalVersion(proposal))
          throw businessRule("当前材料已变化，拒绝迟到的原生业务完成结果。");
      }
    });
    return { actor: admitted.actor, text: execution.effectiveText };
  }

  prepareNativeResult(sessionId: string, commandIds: readonly string[]): AIReqNativeTurnResult {
    const started = commandIds.map((id) => this.currentExecution(sessionId, id));
    const first = started[0];
    if (!first) throw businessRule("本轮没有已执行输入。");
    return withAIReqIdentity(first.actor, () => {
      const note = started
        .map(({ text }) => text.trim())
        .filter(Boolean)
        .join("\n\n");
      if (!note) {
        return {
          commandIds,
          reply: "本次输入已在当前会话接纳；未生成文字分析或修改材料。",
          output: { kind: "none" },
        };
      }
      if (sessionId.startsWith("prototype-skill-design:")) {
        const discussion = stagePrototypeSkillDiscussion(sessionId, note);
        return { commandIds, reply: discussion.reply, output: { kind: "skill", discussion } };
      }
      const { ref, proposal } = this.currentProposal(sessionId);
      if (ref.role === "reviewer") {
        return {
          commandIds,
          reply: "追问已记录在当前会话；本次未修改需求材料、评审报告或人工决定。",
          output: { kind: "none" },
        };
      }
      const kind = ref.phase === "solution" ? "solution" : "requirements";
      return {
        commandIds,
        reply: `本轮${kind === "solution" ? "方案" : "需求"}讨论已完成。材料与格式检查结果请在材料区核对。`,
        output: {
          kind: "proposal",
          note,
          materials: stagePrototypeNativeMaterials(proposal, kind, note),
        },
      };
    });
  }

  completeNative(sessionId: string, result: AIReqNativeTurnResult): void {
    const [firstId, ...steeredIds] = result.commandIds;
    if (!firstId) throw businessRule("本轮没有已执行输入。");
    const first = this.currentExecution(sessionId, firstId);
    for (const id of steeredIds) this.currentExecution(sessionId, id);
    const output = result.output;
    withAIReqIdentity(first.actor, () => {
      switch (output.kind) {
        case "none":
          break;
        case "skill":
          commitPrototypeSkillDiscussion(sessionId, output.discussion);
          break;
        case "proposal": {
          const { ref, proposal } = this.currentProposal(sessionId);
          const target = { projectId: ref.projectId, irId: ref.irId };
          const initial = !proposal.files.some((file) => file.path === proposal.documentPath);
          const action =
            output.materials.kind === "solution"
              ? ({ type: "generateProposalSolution", ...target } as const)
              : ({
                  type: initial ? "generateRequirements" : "supplementRequirements",
                  note: output.note,
                  ...target,
                } as const);
          applyPrototypeAction(action, target, output.materials);
          break;
        }
      }
    });
    for (const id of result.commandIds) this.discardNative(sessionId, id);
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
