import { createServiceLogger } from "@zcode/services/logger";
import { loadOmpSdk } from "./load-sdk.js";
import { startProduction } from "./server.js";

await startProduction({ sdk: loadOmpSdk }).catch((error) => {
  createServiceLogger("production").error(undefined, "正式 Web 服务启动失败", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
