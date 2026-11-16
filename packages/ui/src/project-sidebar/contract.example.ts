import type { ProjectTask } from "@/project-sidebar/contract.js";

/** 展示只读取任务既有归属，不提交项目修改。 */
export function exampleProjectTaskLabel(task: ProjectTask): string {
  return task.title || task.taskId;
}
