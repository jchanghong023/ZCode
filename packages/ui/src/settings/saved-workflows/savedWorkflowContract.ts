/** 运行历史「查看实例」：切到发起它的会话并打开实例详情页；页列出所有项目，故必带所属 workspace。 */
export interface SavedWorkflowsOpenRunParams {
  sessionId: string;
  runId: string;
  toolCallId: string;
  workflowName: string;
  workspacePath: string;
  workspaceIdentity?: string;
}

