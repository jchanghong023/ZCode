import type { GroupTaskRef, GroupNode } from "./contract.js";

/** 只构造展示 DTO；任务分组 RPC 已退出当前产品。 */
export function exampleTaskGroupNode(task: GroupTaskRef): GroupNode {
  return { type: "task", task };
}
