export const mockDomainsModule = {
  id: "mock-domains",
  requires: ["services", "shared", "rpc", "server"],
  provides: ["mock-domains"],
  publicEntrypoints: ["contract.ts"],
} as const;
