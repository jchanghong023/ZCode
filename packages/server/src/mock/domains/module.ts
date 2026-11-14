export const mockDomainsModule = {
  id: "mock-domains",
  requires: ["services", "shared", "rpc", "provider", "server"],
  provides: ["mock-domains"],
  publicEntrypoints: ["contract.ts"],
} as const;
