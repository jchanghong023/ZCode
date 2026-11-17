import { useMemo } from "react";
import type { BotContextState } from "@zcode/shared";

export function useBotGroupMemberNames(context: BotContextState | null) {
  const botId = context?.botId;
  const group = context?.group;
  return useMemo(() => {
    if (!botId || !group?.chatId || !group.enabled) return null;
    // 没有公开成员目录接口；只投影已接收来源中的姓名，缺失姓名时保留真实 ID。
    const names: Record<string, string> = Object.create(null);
    for (const { source } of Object.values(group.inputs ?? {})) {
      const senderName = source.senderName.trim();
      if (senderName || !names[source.senderId]) {
        names[source.senderId] = senderName || source.senderId;
      }
      for (const message of source.messages ?? []) {
        const name = message.senderName.trim();
        if (name || !names[message.senderId]) {
          names[message.senderId] = name || message.senderId;
        }
      }
    }
    return { botId, chatId: group.chatId, names };
  }, [botId, group]);
}
