import { createContext, useContext, type ReactNode } from "react";
import type { WebFileMediaPreview } from "@zcode/services";
import type { AgentColor } from "@zcode/shared";

export interface ToolPresentationCapabilities {
  readMediaPreview?: (path: string) => Promise<WebFileMediaPreview>;
  agentColor?: (name: string) => AgentColor | undefined;
  modelProviderName?: (providerId: string) => string | undefined;
  normalizeOutputText?: (text: string) => string;
  resourceUrl?: (ref: string) => string | undefined;
  readonly?: boolean;
}
const EMPTY_CAPABILITIES: ToolPresentationCapabilities = {};
const Context = createContext<ToolPresentationCapabilities>(EMPTY_CAPABILITIES);
export function ToolPresentationCapabilitiesProvider({
  value,
  children,
}: {
  value: ToolPresentationCapabilities;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useToolPresentationCapabilities() {
  return useContext(Context);
}
