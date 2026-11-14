import type {
  IPluginUiBridgeService,
  PluginUiCallToolResult,
  PluginUiPrepareSandboxParams,
} from "./contract.js";

/**
 * 插件工具卡片的真实调用：先按同一 scope 准备沙箱句柄，再用句柄里的实例凭证调用插件的 MCP 工具。
 * 取消以 callId 显式请求，宿主不缓存执行结果。
 */
export async function examplePluginUiToolCard(
  bridge: IPluginUiBridgeService,
  prepare: Omit<PluginUiPrepareSandboxParams, "scopeId">,
  tool: { toolName: string; arguments: Record<string, unknown>; callId: string },
): Promise<{ sandboxId: string; result: PluginUiCallToolResult }> {
  const handle = await bridge.prepareSandbox({ ...prepare, scopeId: `tool:${tool.callId}` });
  const result = await bridge.callTool({
    workspacePath: prepare.workspacePath,
    workspaceIdentity: prepare.workspaceIdentity,
    instance: handle.instance,
    sessionId: prepare.sessionId,
    pluginId: prepare.pluginId,
    serverName: prepare.serverName,
    toolName: tool.toolName,
    arguments: tool.arguments,
    callId: tool.callId,
  });
  return { sandboxId: handle.sandboxId, result };
}
