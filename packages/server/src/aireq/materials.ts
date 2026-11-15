import {
  prototypeChangeRoot,
  prototypeSpecPath,
  prototypeCapabilityName,
} from "./proposal-storage.js";
import type { AIReqMaterialView } from "@zcode/services/aireq";

export function prototypeMaterial(
  input: Omit<AIReqMaterialView, "sha256" | "size" | "valid">,
): AIReqMaterialView {
  const content = input.content ?? "";
  return {
    ...input,
    sha256: `sample:${input.path}`,
    size: new TextEncoder().encode(content).length,
    valid: true,
  };
}
export function requirementMaterials(
  projectId: string,
  irId: string,
  title: string,
  rows: { id: string; title: string; dependencySrIds?: string[] }[],
): AIReqMaterialView[] {
  return [
    prototypeMaterial({
      projectId,
      irId,
      kind: "ir",
      path: `${prototypeChangeRoot(irId)}/proposal.md`,
      content: `# ${title}

## Why
本需求围绕「${title}」，统一${rows.map((row) => `「${row.title}」`).join("、")}的业务边界与反馈。使用者应能理解当前状态、下一步操作以及发生异常后的恢复方式。

## What Changes
${rows.map((row) => `- ${row.title}：详见 specs/${prototypeCapabilityName(row.id)}/spec.md。`).join("\n")}

## Capabilities

### New Capabilities
${rows.map((row) => `- ${prototypeCapabilityName(row.id)}: ${row.title}`).join("\n")}

### Modified Capabilities
无。

## Impact
- 影响范围：当前项目的相关界面与会话能力。
- 提案材料先在共享临时工作区整理，需求 PR 合并后转为正式需求。
- 涉及需求文档、交互边界及对应模块的实现与验证。`,
    }),
    ...rows.map((row) =>
      prototypeMaterial({
        projectId,
        irId,
        srId: row.id,
        kind: "sr",
        path: prototypeSpecPath(irId, row.id),
        content: `# ${row.title}

稳定 SR ID：${row.id}

## ADDED Requirements

### Requirement: ${row.title}
系统 MUST 展示与当前项目和需求一致的内容，并保持明确的查看上下文。

#### Scenario: 查看当前需求
- **WHEN** 用户选择本能力对应的 SR
- **THEN** 展示此 spec.md 的完整行为、规则与验收场景
- **AND** 不自动推进阶段或发送消息

#### Scenario: 没有可展示内容
- **WHEN** 当前查询无结果或材料缺失
- **THEN** 显示明确空态，不以其他项目的数据替代

### Requirement: 取消与返回
系统 MUST 允许用户取消未提交操作并保留原查看位置。

#### Scenario: 取消操作
- **WHEN** 用户取消弹窗或返回已有会话
- **THEN** 不改变需求状态，不触发实际执行`,
      }),
    ),
  ];
}
