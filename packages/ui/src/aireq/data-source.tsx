import { createContext, useContext, type ReactNode } from "react";
import type { AIReqDataSource } from "./contract.js";
const Context = createContext<AIReqDataSource | null>(null);
export function AIReqDataSourceProvider({
  source,
  children,
}: {
  source: AIReqDataSource;
  children: ReactNode;
}) {
  return <Context.Provider value={source}>{children}</Context.Provider>;
}
export function useOptionalAIReqDataSource() {
  return useContext(Context);
}
export function useAIReqDataSource(): AIReqDataSource {
  const source = useOptionalAIReqDataSource();
  if (!source) throw new Error("AIReqDataSourceProvider is required");
  return source;
}
