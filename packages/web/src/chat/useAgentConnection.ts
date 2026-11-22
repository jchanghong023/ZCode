import { useEffect, useState } from "react";
import {
  connectWebChatAgent,
  type ModelSelectionView,
  type WebChatAgent,
} from "@zcode/client/agent";
import { createUuid } from "@zcode/shared/uuid";
import { helloMessageSchema, V4_WIRE_PROTOCOL_VERSION } from "@zcode/shared/zcode-protocol-v4";

const clientKey = "zcode-web-chat-client";

function getBrowserId(): string {
  try {
    const saved = localStorage.getItem(clientKey);
    if (saved) return saved;
    const id = createUuid();
    localStorage.setItem(clientKey, id);
    return id;
  } catch {
    return createUuid();
  }
}

export interface AgentConnection {
  agent: WebChatAgent;
  clientId: string;
  modelCatalog: ModelSelectionView;
}

type ConnectionView = {
  connection: AgentConnection | null;
  status: "connecting" | "connected" | "reconnecting" | "offline";
};

export function useAgentConnection() {
  const [clientId] = useState(getBrowserId);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<ConnectionView>({ connection: null, status: "connecting" });

  useEffect(() => {
    const lifetime = new AbortController();
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [500, 1000, 2000, 4000, 8000];
    const url = new URL("/ws/chat", location.origin);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("clientId", clientId);
    const token = new URLSearchParams(location.search).get("token");
    if (token) url.searchParams.set("token", token);

    async function connect(): Promise<void> {
      timer = undefined;
      const transport = new AbortController();
      const signal = AbortSignal.any([lifetime.signal, transport.signal]);
      let disconnected = false;
      const reconnect = () => {
        if (disconnected || lifetime.signal.aborted) return;
        disconnected = true;
        transport.abort();
        const delay = delays[attempt++];
        setView({ connection: null, status: delay === undefined ? "offline" : "reconnecting" });
        if (delay !== undefined) timer = setTimeout(() => void connect(), delay);
      };
      try {
        const { agent, getModelCatalog } = await connectWebChatAgent(url.toString(), {
          signal,
          onClose: reconnect,
        });
        const hello = helloMessageSchema.parse(await agent.helloConversationV4());
        if (hello.protocolVersion !== V4_WIRE_PROTOCOL_VERSION)
          throw new Error("Agent protocol mismatch");
        await agent.initializeConversationV4({
          kind: "clientHello",
          protocolVersion: hello.protocolVersion,
          clientId,
          clientKind: "web",
          appVersion: "web-chat",
        });
        const modelCatalog = await getModelCatalog();
        if (signal.aborted) return;
        attempt = 0;
        setView({ connection: { agent, clientId, modelCatalog }, status: "connected" });
      } catch {
        reconnect();
      }
    }

    void connect();
    return () => {
      lifetime.abort();
      clearTimeout(timer);
    };
  }, [clientId, retry]);

  return {
    ...view,
    reconnect: () => {
      setView({ connection: null, status: "reconnecting" });
      setRetry((value) => value + 1);
    },
  };
}
