import concurrently from "concurrently";
import { fileURLToPath } from "node:url";
import { deploymentOptions, productionHelp } from "../packages/server/src/production/options.js";

const options = deploymentOptions(process.argv.slice(2));
if (options.help) {
  process.stdout.write(productionHelp + "\n");
} else {
  const env = {
    PORT: String(options.port),
    ZCODE_WEB_PORT: String(options.webPort),
    ZCODE_WEB_HOST: options.host,
    ZCODE_SERVER_HOST: options.host,
    ZCODE_ZONE: options.zone,
    ZCODE_CLOUDDRAGON_MODE: options.cloud,
  };
  const { result } = concurrently(
    [
      {
        command: "bun packages/server/src/production/entry.ts",
        name: options.zone + "-server",
        env,
      },
      { command: "bun run dev:web", name: options.zone + "-web", env },
    ],
    { cwd: fileURLToPath(new URL("../", import.meta.url)), killOthersOn: ["success", "failure"] },
  );
  await result.catch(() => {
    process.exitCode = 1;
  });
}
