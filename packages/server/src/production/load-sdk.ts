import { realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { SdkModules } from "./omp.js";
import { prepareOmpSdkArchive } from "./sdk-archive.js";

export async function loadOmpSdk(): Promise<SdkModules> {
  const root = await realpath(await prepareOmpSdkArchive());
  const load = async (id: string) => {
    const entry = await realpath(Bun.resolveSync(id, root));
    const fromRoot = relative(root, entry);
    if (isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith(".." + sep)) {
      throw new Error(`OMP SDK 归档内缺少公开入口 ${id}。`);
    }
    return import(pathToFileURL(entry).href);
  };
  const [sdk, sessions, mcp, thinking, dirs, settings] = await Promise.all([
    load("@oh-my-pi/pi-coding-agent/sdk"),
    load("@oh-my-pi/pi-coding-agent/session/session-manager"),
    load("@oh-my-pi/pi-coding-agent/mcp"),
    load("@oh-my-pi/pi-catalog/model-thinking"),
    load("@oh-my-pi/pi-utils/dirs"),
    load("@oh-my-pi/pi-coding-agent/config/settings"),
  ]);
  const modules: SdkModules = {
    createAgentSession: sdk.createAgentSession,
    Settings: settings.Settings,
    getSessionsDir: dirs.getSessionsDir,
    SessionManager: sessions.SessionManager,
    MCPManager: mcp.MCPManager,
    readMCPConfigFile: mcp.readMCPConfigFile,
    getSupportedEfforts: thinking.getSupportedEfforts,
  };
  if (
    [
      modules.createAgentSession,
      modules.Settings?.loadReadOnly,
      modules.SessionManager?.create,
      modules.SessionManager?.listAll,
      modules.SessionManager?.open,
      modules.SessionManager?.inMemory,
      modules.MCPManager,
      modules.readMCPConfigFile,
      modules.getSupportedEfforts,
      modules.getSessionsDir,
    ].some((entry) => typeof entry !== "function")
  ) {
    throw new Error("OMP SDK ZIP 的公开接口与此版本的正式服务不兼容。");
  }
  return modules;
}
