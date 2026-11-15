export const genUiModule = {
  id: "gen-ui",
  requires: ["ui", "gen-ui-protocol"],
  provides: ["gen-ui-reference-projection"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
