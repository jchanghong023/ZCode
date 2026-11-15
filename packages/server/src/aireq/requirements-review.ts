import { readPrototypeAgentPrompts } from "./personalization.js";
import { requirementsReviewInputs } from "@zcode/services/aireq";
import { readPrototypeAgentModelBinding } from "./agent-models.js";
import type {
  AIReqAgentModelBinding,
  AIReqNativeSessionRef,
  AIReqRequirementGroup,
  AIReqReview,
  AIReqReviewAgent,
  AIReqReviewAgentId,
} from "@zcode/services/aireq";
const reportA =
  "## 评审 A · 独立意见\n\n已独立审查本轮 IR 与全部 SR，未预先参考 B、C 的结论。\n\n- **A-01 · 完整性**：异常失败后的用户可观察结果与恢复方式需要明确。\n- **A-02 · 依据**：当前规格已描述正常查看和取消行为，异常场景的验收说明较少。\n\n这是固定样例报告，不是实际模型调用结果。问题和建议供人判断，不阻止人选择通过；不修改文件，也不代表人工已批准。\n";
const reportB =
  "## 评审 B · 独立意见\n\n已独立审查与 A、C 相同的需求文件版本。\n\n- **B-01 · 可验证性**：建议逐项对应 IR 的能力声明与 SR 的 Requirement／Scenario。\n- **B-02 · 分歧**：失败重试是否必须在当前范围内没有明确业务依据。可以补充本轮，也可以由人判断列为后续范围，不能仅因其他模型提出就认定必须实现。\n\n保留不同看法，由人决定是否通过；评审不修改需求文件。\n";
const reportC =
  "## 评审 C · 独立意见\n\n已检查同一版 IR／SR 的边界和异常条件。\n\n- **C-01 · 边界**：应说明重复请求、取消及失败后保留输入的预期行为。\n- **C-02 · 重复意见**：异常恢复与 A-01 有重叠，可在综合意见中合并展示，但需要保留 A、C 两个来源。\n\n这是固定样例报告，不调用模型、不修改文件、不生成通过凭证。\n";
const summary =
  "## 综合意见\n\n已汇总 **评审 A、B、C 的同版报告**。以下归并共同问题，保留分歧及原始意见来源，供人工判断。\n\n### 请你判断\n\n1. **异常结果与恢复边界**（来源 A-01、C-01／C-02）：需求已覆盖正常查看、取消；失败后用户看到什么、输入是否保留、如何恢复，建议说明。两份重复意见在此归并，原始报告仍可追溯。\n2. **能力与验收场景覆盖**（来源 B-01）：建议检查每项能力是否有可观察的验收行为。\n3. **保留分歧**（A-01 与 B-02）：A 倾向补齐恢复规则；B 认为自动重试是否属于本轮范围尚无依据。这里保留两种意见，不用二比一投票替代业务判断。\n\n### 下一步由你决定\n\n- 认为当前需求足以进入设计：点击右侧文档底部 **通过，进入技术方案**。\n- 认为需要补充：点击 **返回业务补充**，与业务 Agent 对话，由 AI 修改 IR／SR，再重新发起评审。\n\n有意见不等于不通过，无意见也不等于自动通过。可以直接在这里追问综合评审 Agent；需要时切换 A／B／C 查看依据。四个 Agent 均不修改需求文件，聊天不会代替人工批准。\n";

export function prototypeReviewModelBindings(): AIReqAgentModelBinding[] {
  const bindings = [
    readPrototypeAgentModelBinding("requirements-review-a"),
    readPrototypeAgentModelBinding("requirements-review-b"),
    readPrototypeAgentModelBinding("requirements-review-c"),
    readPrototypeAgentModelBinding("requirements-review"),
  ];
  if (new Set(bindings.slice(0, 3).map((binding) => binding.modelKey)).size !== 3)
    throw new Error(
      "评审 A、B、C 须配置三个不同模型；综合评审可独立选择模型。请由当前 Web 所有者在模型设置中调整。",
    );
  return bindings;
}
export function prototypeReviewSessions(review: AIReqReview): AIReqNativeSessionRef[] {
  return (
    review.agents?.map((agent) => agent.session) ??
    ("projectId" in review.reviewer ? [review.reviewer] : [])
  );
}
/** Complete static reports, never model approval. Seeded history records a prior human decision. */
export function createPrototypeRequirementsReview(
  group: AIReqRequirementGroup,
  employeeId: string,
  seedPassed = false,
): AIReqReview {
  const round = group.proposalRound ?? 1;
  const id = `sample-requirements-review:${group.projectId}:${group.id}:${round}:${group.revision}`;
  const bindings = prototypeReviewModelBindings();
  const prompts = readPrototypeAgentPrompts().saved;
  const keys: AIReqReviewAgentId[] = ["a", "b", "c", "summary"];
  const reports = [reportA, reportB, reportC, summary];
  const agents: AIReqReviewAgent[] = keys.map((key, index) => ({
    id: key,
    name: key === "summary" ? "综合评审 Agent" : `评审 ${key.toUpperCase()}`,
    status: "completed",
    report: reports[index]!,
    promptSnapshot: prompts[bindings[index]!.role],
    session: {
      projectId: group.projectId,
      irId: group.id,
      sessionId: `sample-requirements-reviewer:${group.id}:${round}:${group.revision}:${key}`,
      sessionFile: `/demo/sessions/requirements-review-${group.id}-${round}-${group.revision}-${key}.jsonl`,
      role: "reviewer",
      phase: "requirements",
      modelConfig: bindings[index],
      round,
    },
  }));
  return {
    id,
    snapshotDigest: group.snapshot?.digest ?? "sample-missing-snapshot",
    inputFiles: structuredClone(requirementsReviewInputs(group) ?? []),
    passed: seedPassed,
    agents,
    ...(seedPassed
      ? { humanDecision: { employeeId, decidedAt: new Date().toISOString(), reviewId: id } }
      : {}),
    modelConfig: bindings[3],
    report: summary,
    requestedBy: employeeId,
    round,
    findings: [
      {
        id: "sample-exception-boundary",
        level: "suggestion",
        message: "综合意见保留异常边界建议与模型分歧，是否通过由人判断。",
        documentPath: group.snapshot?.srs[0]?.documentPath ?? group.documentPath,
      },
    ],
    reviewer: agents[3]!.session,
    createdAt: new Date().toISOString(),
  };
}
