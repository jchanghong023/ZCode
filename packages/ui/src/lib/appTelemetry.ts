import { useCallback, useContext } from "react";
import { StoreContext } from "@/store/StoreProvider.js";
import type { InterfaceMode } from "@/lib/interfaceMode.js";
import {
  BIGMODEL_PROVIDER_ID,
  BUILTIN_MODEL_PROVIDER_IDS,
  ZAI_PROVIDER_ID,
  collectTelemetryRendererContext,
  isZaiCodingPlanProviderId,
  sanitizeTelemetryEventDetail,
  type BuiltinModelProviderId,
  type IPlatformService,
  type TelemetryUiMode,
} from "@zcode/shared";
import { logger } from "@/logger.js";

export function resolveProviderTelemetryLabel(providerId: string): string {
  if (providerId === ZAI_PROVIDER_ID || isZaiCodingPlanProviderId(providerId)) {
    return "z.ai";
  }

  if (
    providerId === BIGMODEL_PROVIDER_ID ||
    providerId === BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan ||
    providerId === BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan ||
    providerId === BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan
  ) {
    return "bigmodel";
  }

  return providerId;
}

export function resolvePresetModelProviderTelemetryLabel(presetId: BuiltinModelProviderId): string {
  return resolveProviderTelemetryLabel(presetId);
}

type ReportTelemetryPlatform = Pick<IPlatformService, "reportTelemetryEvent">;

export async function reportAppTelemetryEvent(
  platform: ReportTelemetryPlatform,
  payload: {
    elementName: string;
    eventRegion: string;
    eventType: string;
    eventText?: string;
    eventExtraDetail: Record<string, string>;
    userId?: string;
    talkId?: string;
    messageId?: string;
  },
  scope: string,
): Promise<void> {
  try {
    const reportPayload = {
      context: collectTelemetryRendererContext(),
      ...payload,
      eventExtraDetail: sanitizeTelemetryEventDetail(payload.elementName, payload.eventExtraDetail),
    };

    // 修复原因：只在 Core 清洗会让原文先经过 IPC/本地日志；此处只记录清洗后的副本。
    // step 与消息同量级，调试输出使用 debug，不产生 info 落盘副本。
    if (payload.elementName === "message_completion" || payload.elementName === "agent_step") {
      logger.debug(`[${scope}] ${payload.elementName} payload:`, reportPayload);
    }

    await platform.reportTelemetryEvent(reportPayload);
  } catch {
    // 平台端口拒绝表示未获接纳；观测失败必须与主业务结果隔离，
    // 不把原始网络错误或遥测 payload 再复制到 UI 日志。
  }
}

/** 只在埋点边界映射；没有交互来源时不假定默认编程模式。 */
export function toTelemetryUiMode(mode: InterfaceMode | undefined): TelemetryUiMode {
  return mode === "office" ? "work" : mode === "coding" ? "code" : "unknown";
}

/** 用户入口显式调用；初始化、快捷键及广播仍使用原 store 命令。 */
export function useSetInterfaceModeWithTelemetry(
  platform: Pick<IPlatformService, "reportTelemetryEvent">,
  eventRegion: "app.profile" | "app.setting" | "app.onboarding",
): (mode: InterfaceMode) => void {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useSetInterfaceModeWithTelemetry 必须在 StoreProvider 内使用");
  return useCallback(
    (mode: InterfaceMode) => {
      // 操作时读取唯一 owner，连续切换及广播更新后也不会用旧 render 的值归因。
      const previousMode = store.getState().interfaceMode;
      store.getState().setInterfaceMode(mode);
      const currentMode = store.getState().interfaceMode;
      if (previousMode === currentMode) return;
      void reportAppTelemetryEvent(
        platform,
        {
          elementName: "ui_mode_switch",
          eventRegion,
          eventType: "ck",
          eventExtraDetail: {
            previous_ui_mode: toTelemetryUiMode(previousMode),
            ui_mode: toTelemetryUiMode(currentMode),
          },
        },
        "interfaceModeTelemetry",
      );
    },
    [store, platform, eventRegion],
  );
}
