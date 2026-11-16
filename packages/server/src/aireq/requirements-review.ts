import { businessRule } from "./errors.js";
import type { AIReqReviewScenario } from "./internal-scenarios.js";
import { readPrototypeAgentPrompts } from "./personalization.js";
import { requirementsReviewInputs, fileVersions, proposalVersion } from "@zcode/services/aireq";
import { readPrototypeAgentModelBinding } from "./agent-models.js";
import type {
  AIReqAgentModelBinding,
  AIReqNativeSessionRef,
  AIReqRequirementGroup,
  AIReqReview,
  AIReqReviewAgent,
  AIReqReviewAgentId,
} from "@zcode/services/aireq";

export function prototypeReviewModelBindings(): AIReqAgentModelBinding[] {
  const bindings = [
    "requirements-review-a",
    "requirements-review-b",
    "requirements-review-c",
    "requirements-review",
  ].map((role) => readPrototypeAgentModelBinding(role as AIReqAgentModelBinding["role"]));
  if (new Set(bindings.slice(0, 3).map((binding) => binding.modelKey)).size !== 3)
    throw businessRule("完整审查 A、B、C 须配置三个不同模型。");
  return bindings;
}
export function prototypeReviewSessions(review: AIReqReview): AIReqNativeSessionRef[] {
  return (
    review.agents?.map((agent) => agent.session) ??
    ("projectId" in review.reviewer ? [review.reviewer] : [])
  );
}
/** 模拟外部结果也绑定送审快照；批准只能由正常人工 command 写入。 */
export function createPrototypeRequirementsReview(
  group: AIReqRequirementGroup,
  employeeId: string,
  seedPassed = false,
  kind: "original" | "full" = "original",
  scenario: AIReqReviewScenario = "normal",
): AIReqReview {
  const round =
    kind === "original"
      ? (group.originalReviewHistory?.length ?? 0) + 1
      : (group.reviewHistory?.length ?? 0) + 1;
  const inputFiles = kind === "original" ? (requirementsReviewInputs(group) ?? []) : group.files;
  const digest = kind === "original" ? fileVersions(inputFiles) : proposalVersion(group);
  const id = `sample-${kind}-review:${group.projectId}:${group.id}:${round}:${group.revision}`;
  const bindings =
    kind === "full"
      ? prototypeReviewModelBindings()
      : [readPrototypeAgentModelBinding("requirements-review-a")];
  const keys: AIReqReviewAgentId[] = kind === "full" ? ["a", "b", "c", "summary"] : ["a"];
  const names =
    kind === "full"
      ? ["需求覆盖／一致性", "技术方案／依赖", "任务可执行性／测试充分性", "综合终审"]
      : ["原始业务需求评审"];
  const prompts = readPrototypeAgentPrompts().saved;
  const agents: AIReqReviewAgent[] = keys.map((key, index) => ({
    id: key,
    name: names[index]!,
    status:
      scenario === "failed" && index === 0
        ? "failed"
        : scenario === "hold"
          ? "running"
          : key === "summary" && scenario === "failed"
            ? "pending"
            : "completed",
    report:
      scenario === "hold" || (scenario === "failed" && key === "summary")
        ? ""
        : `# ${names[index]}\n\n演示文档，仅供预览。\n\n${
            scenario === "failed" && index === 0
              ? "评审失败，不能放行。"
              : scenario === "blocked"
                ? "存在阻断：验收条件与材料需补充，不得人工绕过。"
                : kind === "original"
                  ? "已检查业务目标、范围、歧义和可验收性，无阻断问题。尚未拆分 SR。"
                  : key === "summary"
                    ? "已等待并汇总本轮 A、B、C 三份同版报告，保留各自来源，无阻断冲突；仍需人工判断。"
                    : `已独立只读检查完整快照的${names[index]}，无阻断问题。`
          }`,
    promptSnapshot: prompts[bindings[index]!.role],
    session: {
      projectId: group.projectId,
      irId: group.id,
      sessionId: `${id}:${key}`,
      sessionFile: `/demo/sessions/${id}:${key}.jsonl`,
      role: "reviewer",
      phase: kind === "full" ? "solution" : "requirements",
      modelConfig: bindings[index],
      round,
    },
  }));
  return {
    id,
    kind,
    snapshotDigest: digest,
    inputFiles: structuredClone(inputFiles),
    passed: seedPassed && scenario === "normal",
    held: scenario === "hold",
    agents,
    ...(seedPassed && scenario === "normal"
      ? {
          humanDecision: {
            employeeId,
            decidedAt: new Date().toISOString(),
            reviewId: id,
          },
        }
      : {}),
    modelConfig: bindings.at(-1),
    report: agents.at(-1)!.report,
    requestedBy: employeeId,
    round,
    findings:
      scenario === "blocked"
        ? [
            {
              id: `${id}:blocking`,
              level: "blocking",
              message: "请补齐业务验收条件与完整材料后重新评审。",
              documentPath: group.documentPath,
            },
          ]
        : [],
    reviewer: agents.at(-1)!.session,
    createdAt: new Date().toISOString(),
  };
}
