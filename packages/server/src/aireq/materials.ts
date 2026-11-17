import { contentVersion } from "./content-digest.js";
import { prototypeChangeRoot, prototypeIrRoot, prototypeSpecPath } from "./proposal-storage.js";
import type { AIReqMaterialView } from "@zcode/services/aireq";

export function prototypeMaterial(
  input: Omit<AIReqMaterialView, "sha256" | "size" | "valid">,
): AIReqMaterialView {
  // 摘要与字节数只取实际正文，不能为材料注入与业务无关的说明。
  const content = input.content ?? "";
  return {
    ...input,
    ...(input.content === undefined ? {} : { content }),
    ...contentVersion(content),
    valid: true,
  };
}
export function requirementMaterials(
  projectId: string,
  irId: string,
  title: string,
  rows: { id: string; title: string; dependencySrIds?: string[] }[],
  originalText = title,
): AIReqMaterialView[] {
  const shared = { projectId, irId };
  return [
    prototypeMaterial({
      ...shared,
      kind: "ir",
      path: `${prototypeIrRoot(irId)}/requirements.md`,
      content: `# ${title}\n\n## 目标与范围\n${originalText}\n\n## 业务验收标准\n- AC-1：业务正常操作具有明确、可观察的成功结果。\n- AC-2：失败和重复请求不丢失输入，明确说明恢复路径。\n\n## 范围外\n不由本平台执行开发、修改代码或运行测试。`,
    }),
    ...(rows.length
      ? [
          prototypeMaterial({
            ...shared,
            kind: "acceptance",
            path: `${prototypeIrRoot(irId)}/acceptance.md`,
            content: `# 整体验收\n\n依据 [业务需求](./requirements.md) AC-1／AC-2。\n\n${rows.map((row) => `- ${row.id}：独立验证正常、失败和重复请求；再验证跨 SR 协作结果。`).join("\n")}\n\n全部 SR 通过业务场景后整体验收，不以 tasks 勾选数代替测试结果。`,
          }),
          ...rows.flatMap((row) => {
            const root = prototypeChangeRoot(row.id);
            const context = { ...shared, srId: row.id };
            return [
              prototypeMaterial({
                ...context,
                kind: "sr",
                path: `${root}/proposal.md`,
                content: `# ${row.title}\n\n## Why\n追溯 IR ${irId} 的 AC-1／AC-2。\n\n## What Changes\n${row.title}。\n\n## Scope\n本 SR 是独立开发单元，依赖不合并 change 身份。`,
              }),
              prototypeMaterial({
                ...context,
                kind: "sr",
                path: prototypeSpecPath(irId, row.id),
                content: `# ${row.title}\n\n## ADDED Requirements\n\n### Requirement: 业务结果可观察\n系统 MUST 满足 IR ${irId} 的 AC-1 和 AC-2。\n\n#### Scenario: 正常完成\n- **WHEN** 用户提交有效业务操作\n- **THEN** 展示明确成功结果\n\n#### Scenario: 失败与重复\n- **WHEN** 操作失败或重复提交\n- **THEN** 保留输入并避免重复副作用，提供明确恢复路径`,
              }),
              prototypeMaterial({
                ...context,
                kind: "solution",
                stage: "solution",
                path: `${root}/design.md`,
                content: `# ${row.title} · 技术方案\n\n## Context\n输入为本 change proposal/specs 与 IR 共享材料。\n\n## Decisions\n复用既有模块；明确接口、状态与异常边界。依赖权威仅见 docs/requirements/${irId}/sr-dependencies.json。\n\n## Risks\n尚未完成代码与接口核验，实施前需由开发人员确认。`,
              }),
              prototypeMaterial({
                ...context,
                kind: "plan",
                stage: "solution",
                path: `${root}/tasks.md`,
                content: `# ${row.title} · 开发任务\n\n- [ ] 1. 核对当前接口与 AC-1 正常路径\n- [ ] 2. 实现规格定义的状态与异常恢复\n- [ ] 3. 在平台外验证 AC-1、AC-2 并提交代码审查\n\n以上为待实施的任务清单，尚未执行或验证。`,
              }),
              prototypeMaterial({
                ...context,
                kind: "test-plan",
                stage: "solution",
                path: `${root}/test-plan.md`,
                content: `# ${row.title} · 测试方案\n\n业务依据：docs/requirements/${irId}/requirements.md。\n\n|业务验收|测试场景|预期结果|\n|---|---|---|\n|AC-1|正常业务操作|结果可观察且符合范围|\n|AC-2|失败、重复与恢复|输入保留、无重复副作用、恢复入口明确|\n\n记录测试代码版本、实际结果与证据，不能以技术任务完成替代业务验收。`,
              }),
            ];
          }),
        ]
      : []),
  ];
}
