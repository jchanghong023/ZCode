import { resolve } from "node:path";
import { parseArgs } from "node:util";

export function deploymentOptions(args: string[], env = process.env) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      zone: { type: "string" },
      "use-clouddragon": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const zone = values.zone ?? env["ZCODE_ZONE"] ?? "yellow";
  if (zone !== "yellow" && zone !== "red") throw new Error("--zone 应为 yellow 或 red。");
  if (zone === "red" && values["use-clouddragon"]) throw new Error("红区只通过文件导入目录。");
  const local = zone === "yellow";
  const root = resolve(env["ZCODE_DATA_DIR"] || `.zcode-runtime/${zone}`);
  const port = Number(env["PORT"] ?? (local ? 3032 : 3033));
  const webPort = Number(env["ZCODE_WEB_PORT"] ?? (local ? 5175 : 5176));
  if (![port, webPort].every((p) => Number.isInteger(p) && p > 0 && p <= 65535) || port === webPort)
    throw new Error("请为前后端指定不同且有效的监听端口。");
  return {
    zone: zone as "yellow" | "red",
    root,
    port,
    webPort,
    help: values.help,
    host: env["ZCODE_SERVER_HOST"] || "127.0.0.1",
    exchange: resolve(env["ZCODE_EXCHANGE_DIR"] || resolve(root, local ? "outbox" : "inbox")),
    workspace: resolve(env["ZCODE_SERVER_WORKSPACE"] || process.cwd()),
    cloud:
      zone === "red"
        ? "disabled"
        : values["use-clouddragon"] || env["ZCODE_CLOUDDRAGON_MODE"] === "real"
          ? "real"
          : "mock",
  };
}
export const productionHelp = "start:prod [--zone yellow|red] [--use-clouddragon]";
