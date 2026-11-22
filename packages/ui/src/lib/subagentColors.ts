import { FACE_COLORS } from "@/components/workflow-timeline/WorkflowAgentFace.js";
import type { AgentColor } from "@zcode/shared";

export const SUBAGENT_COLORS: AgentColor[] = [
  "yellow",
  "red",
  "orange",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
];

// 配置标识保持兼容，色值与 workflow 共用，选择器、头像和名称不能各自维护色阶。
export const SUBAGENT_WORKFLOW_COLOR: Record<AgentColor, string> = {
  yellow: FACE_COLORS[1],
  red: FACE_COLORS[8],
  orange: FACE_COLORS[5],
  green: FACE_COLORS[7],
  cyan: FACE_COLORS[0],
  blue: FACE_COLORS[4],
  purple: FACE_COLORS[3],
  pink: FACE_COLORS[6],
};

export function isSubagentColor(value: string): value is AgentColor {
  return (SUBAGENT_COLORS as readonly string[]).includes(value);
}

