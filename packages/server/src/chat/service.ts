import { AsyncLocalStorage } from "node:async_hooks";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { ServiceCollection, IZCodeAgentService } from "@zcode/services";
import { MockRuntime } from "../mock/runtime.js";
import { MockZCodeAgentService } from "../mock/zcodeAgent.js";
import { registerModelSelectionMockService } from "../mock/domains/contract.js";
import { starterChatSessions } from "./fixtures.js";

const browser = new AsyncLocalStorage<string>();

function isInsideDirectory(root: string, directory: string): boolean {
  const fromRoot = relative(root, directory);
  return fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

async function resolveChatDirectory(root: string, input: string): Promise<string> {
  try {
    if (typeof input === "string" && input.trim()) {
      const rootPath = resolve(root);
      const base = await realpath(rootPath);
      const requested = resolve(rootPath, input);
      // 先拦截根外输入，避免匿名请求触发根外目录读取；解析后再确认内部链接没有越界。
      if (isInsideDirectory(rootPath, requested) || isInsideDirectory(base, requested)) {
        const directory = await realpath(requested);
        if (isInsideDirectory(base, directory) && (await stat(directory)).isDirectory())
          return directory;
      }
    }
  } catch {
    // 错误只描述用户可用的选项，避免泄露服务端真实路径。
  }
  throw Object.assign(new Error("工作目录不可用，请输入服务端工作目录根下已有的目录。"), {
    code: "fault.chat.invalidDirectory",
    publicMessage: true,
  });
}

export function createWebChatServices(workspacePath: string): ServiceCollection {
  const runtime = new MockRuntime({ workspacePath });
  const agent = new MockZCodeAgentService(runtime, undefined, {
    actorKey: () => {
      const id = browser.getStore();
      if (!id) throw new Error("聊天连接身份无效。");
      return id;
    },
    resolveDirectory: (path) => resolveChatDirectory(workspacePath, path),
    starterSessions: starterChatSessions,
  });
  const services = new ServiceCollection().register(IZCodeAgentService, agent);
  registerModelSelectionMockService(services);
  return services;
}

export function bindWebChatConnection(
  agent: IZCodeAgentService,
  clientId: string,
): IZCodeAgentService {
  return new Proxy(agent, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        browser.run(clientId, () => {
          if (
            key === "sendConversationCommandV4" &&
            (args[0] as { envelope?: { clientId?: string } } | undefined)?.envelope?.clientId !==
              clientId
          )
            throw new Error("聊天连接身份已变化，请刷新页面。");
          return Reflect.apply(value, target, args);
        });
    },
  });
}
