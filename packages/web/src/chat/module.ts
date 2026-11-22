export const webAgentChatModule = {
  id: "web-agent-chat",
  requires: ["client", "shared", "ui", "web-platform"],
  provides: ["web-agent-chat"],
  publicEntrypoints: ["main.tsx"],
} as const;
