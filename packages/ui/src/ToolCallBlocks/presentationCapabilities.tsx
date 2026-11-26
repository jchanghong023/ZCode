import { createContext, useContext, type ReactNode } from "react";
import type { WebFileMediaPreview } from "@zcode/services";

export interface ToolPresentationCapabilities {
  readMediaPreview?: (path: string) => Promise<WebFileMediaPreview>;
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
