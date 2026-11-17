import { useEffect, useRef } from "react";
import type { IPlatformService, TaskNotificationPayload } from "@zcode/shared";
import type { ConversationSnapshot } from "@zcode/shared/zcode-protocol-v4";
import type { IntlInstance } from "@/i18n/index.js";
import { logger } from "@/logger.js";
import { collectPendingInteractionNotificationPayloads } from "@/lib/taskNotificationOrchestrator.js";

type FormatMessage = IntlInstance["formatMessage"];
type TaskNotificationPlatform = Pick<IPlatformService, "showTaskNotification">;

interface PendingInteractionTaskNotificationsParams {
  snapshot: ConversationSnapshot | null;
  enabled: boolean;
  platform: TaskNotificationPlatform | null | undefined;
  formatMessage: FormatMessage;
}

function showTaskNotification(
  platform: TaskNotificationPlatform,
  payload: TaskNotificationPayload,
): void {
  try {
    platform.showTaskNotification(payload);
  } catch (error) {
    logger.warn("[task-notification] 触发平台通知失败", {
      taskId: payload.taskId,
      status: payload.status,
      error,
    });
  }
}

/**
 * 当前 conversation snapshot 的阻塞交互通知。
 *
 * 首个 snapshot 只作为基线，避免订阅历史/恢复 replayable snapshot 时重放旧权限弹窗通知；
 * 后续新增 interactionId 才发通知，重复 pending 不会刷屏。
 */
export function usePendingInteractionTaskNotifications({
  snapshot,
  enabled,
  platform,
  formatMessage,
}: PendingInteractionTaskNotificationsParams): void {
  const seenRef = useRef<{ sessionId: string; seenRequestIds: Set<string> } | null>(null);

  useEffect(() => {
    if (!enabled || !snapshot) {
      seenRef.current = null;
      return;
    }

    const currentRequestIds = snapshot.pendingInteractions.map(
      (interaction) => interaction.interactionId,
    );
    const currentSeen = seenRef.current;
    if (!currentSeen || currentSeen.sessionId !== snapshot.sessionId) {
      seenRef.current = {
        sessionId: snapshot.sessionId,
        seenRequestIds: new Set(currentRequestIds),
      };
      return;
    }

    if (platform) {
      const payloads = collectPendingInteractionNotificationPayloads({
        snapshot,
        seenRequestIds: currentSeen.seenRequestIds,
        formatMessage,
      });
      for (const payload of payloads) {
        showTaskNotification(platform, payload);
      }
    }

    for (const requestId of currentRequestIds) {
      currentSeen.seenRequestIds.add(requestId);
    }
  }, [enabled, formatMessage, platform, snapshot]);
}
