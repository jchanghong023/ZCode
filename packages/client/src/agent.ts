import { ProxyChannel } from "@zcode/rpc";
import {
  IZCodeAgentService,
  WEB_AIREQ_AGENT_EVENTS,
  WEB_CHAT_AGENT_METHODS,
  type WebChatAgent,
} from "@zcode/services/zcode-agent";
import {
  IModelSelectionService,
  WEB_MODEL_SELECTION_METHODS,
  type WebModelSelectionService,
  type WebModelSelectionView,
} from "@zcode/services/model-selection";
import { connectWebSocketChannel, type WebSocketConnectionOptions } from "./channelWebSocket.js";

export type {
  RecentChatDirectory,
  RecentChatSession,
  WebChatAgent,
  ZCodeAgentSessionTarget,
} from "@zcode/services/zcode-agent";
export type { WebModelSelectionView } from "@zcode/services/model-selection";

const agentMembers = new Set([...WEB_CHAT_AGENT_METHODS, ...WEB_AIREQ_AGENT_EVENTS]);
const modelSelectionMembers = new Set(WEB_MODEL_SELECTION_METHODS);

export async function connectWebChatAgent(
  url: string,
  options?: WebSocketConnectionOptions,
): Promise<{ agent: WebChatAgent; getModelCatalog: () => Promise<WebModelSelectionView> }> {
  const client = await connectWebSocketChannel(url, options);
  const models = ProxyChannel.toService<WebModelSelectionService>(
    client.getChannel(IModelSelectionService.channelName),
    { members: modelSelectionMembers },
  );
  return {
    agent: ProxyChannel.toService<WebChatAgent>(client.getChannel(IZCodeAgentService.channelName), {
      members: agentMembers,
    }),
    getModelCatalog: () => models.getView(),
  };
}
