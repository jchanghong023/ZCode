import concurrently from "concurrently";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--use-clouddragon")) {
  console.error("Usage: bun run dev [--use-clouddragon]");
  process.exit(2);
}

const { result } = concurrently(
  [
    {
      command: "bun run dev:server",
      name: "server",
      prefixColor: "blue",
      env: { ZCODE_CLOUDDRAGON_MODE: args.length ? "real" : "mock" },
    },
    { command: "bun run dev:web", name: "web", prefixColor: "green" },
  ],
  { killOthersOn: ["success", "failure"] },
);

await result.catch(() => {
  process.exitCode = 1;
});
