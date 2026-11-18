export const pluginHostQueriesModule = {
  id: "plugin-host-queries",
  requires: ["shared"],
  provides: ["plugin-host-queries"],
  publicEntrypoints: ["contract.ts"],
} as const;
