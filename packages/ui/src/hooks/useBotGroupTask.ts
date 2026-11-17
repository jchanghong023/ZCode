import { useEffect, useState } from "react";
import { isFeishuBotProvider, type BotContextState, type FeishuBotProvider } from "@zcode/shared";
import { useServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";

export function useBotGroupTask(
  taskId: string | null,
  workspacePath: string,
  workspaceIdentity?: string,
) {
  const { botsService, broadcastService } = useServices();
  const [context, setContext] = useState<BotContextState | null>(null);
  const [provider, setProvider] = useState<FeishuBotProvider>();
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    const refresh = async () => {
      const requested = ++revision;
      if (!taskId) {
        setContext(null);
        return;
      }
      try {
        const states = await botsService.getBotStates();
        if (disposed || revision !== requested) return;
        const nextContext =
          states.find(
            (state) =>
              (state.group?.taskWorkspaces?.[taskId]?.workspaceIdentity?.trim() ||
                state.group?.taskWorkspaces?.[taskId]?.workspacePath ||
                state.workspaceIdentity?.trim() ||
                state.workspacePath) === workspaceKey && state.group?.taskIds.includes(taskId),
          ) ?? null;
        setContext(nextContext);
        const savedProvider = Object.values(nextContext?.group?.inputs ?? {})[0]?.source.provider;
        setProvider(savedProvider);
        if (nextContext && !savedProvider) {
          // 首次准备还没有 accepted source，渠道名称取当前机器人配置，不默认猜作飞书。
          const config = await botsService.getConfig();
          if (disposed || revision !== requested) return;
          const configured = config.bots.find((bot) => bot.id === nextContext.botId)?.provider;
          setProvider(configured && isFeishuBotProvider(configured) ? configured : undefined);
        }
      } catch (error) {
        if (!disposed) logger.warn("读取群任务同步状态失败", { error: String(error) });
      }
    };
    setContext(null);
    setProvider(undefined);
    void refresh();
    const subscription = broadcastService.onMessage((message) => {
      if (message.channel === "bots:group-state") void refresh();
    });
    return () => {
      disposed = true;
      subscription.dispose();
    };
  }, [botsService, broadcastService, taskId, workspaceKey]);
  // 当前公开合同只提供群状态读取，不在展示 hook 中伪造重发、协调或预热动作。
  return { context, provider };
}
