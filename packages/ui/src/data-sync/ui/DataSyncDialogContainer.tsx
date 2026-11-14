import { useMemo } from "react";
import type {
  ConnectionProfile,
  DeviceSyncResult,
  SourceServerManagementSnapshot,
  SourceServerProfileTarget,
  SourceServerWorkspaceHistoryEntry,
} from "@zcode/shared";
import { logger } from "@/logger.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import type {
  DataSyncCategoryId,
  DataSyncDeviceSummary,
  DataSyncWorkspaceMapping,
  IDeviceSyncStateService,
  IServiceAccessor,
} from "@/data-sync/contract.js";
import { DataSyncDialog } from "@/data-sync/ui/DataSyncDialog.js";

/** 设备当前生效的 Profile：优先 Preferred，其次第一条未退役；不连接设备，只读快照。 */
function activeProfileOf(
  snapshot: SourceServerManagementSnapshot | null,
  sourceServerId: string,
): ConnectionProfile | undefined {
  if (!snapshot) return undefined;
  const server = snapshot.servers.find((item) => item.sourceServerId === sourceServerId);
  const profiles = snapshot.profiles.filter(
    (profile) => profile.sourceServerId === sourceServerId && profile.lifecycleState !== "retired",
  );
  return (
    profiles.find((profile) => profile.profileId === server?.preferredProfileId) ?? profiles[0]
  );
}

function formatProfileTarget(target?: SourceServerProfileTarget): string {
  if (!target) return "";
  switch (target.kind) {
    case "ssh":
      return `SSH · ${target.username}@${target.host}${target.port ? `:${target.port}` : ""}`;
    case "wsl":
      return ["WSL", target.distro, target.user].filter(Boolean).join(" · ");
    case "docker":
      return `Docker · ${target.container}`;
  }
}

/** 设备行与入口共用：名称与「传输方式 · 地址」取自管理快照的同一份设备记录。 */
export function toDataSyncDeviceSummary(
  snapshot: SourceServerManagementSnapshot | null,
  sourceServerId: string,
): DataSyncDeviceSummary {
  const server = snapshot?.servers.find((item) => item.sourceServerId === sourceServerId);
  const profile = activeProfileOf(snapshot, sourceServerId);
  return {
    sourceServerId,
    name: server?.displayName ?? profile?.displayName ?? sourceServerId,
    description: formatProfileTarget(profile?.target),
    ...(profile?.target ? { remoteKind: profile.target.kind } : {}),
  };
}

/** 设备是否在线：该设备当前 Profile 的连接状态为 online，只取自管理快照。 */
export function isDataSyncDeviceOnline(
  snapshot: SourceServerManagementSnapshot | null,
  sourceServerId: string,
): boolean {
  const profile = activeProfileOf(snapshot, sourceServerId);
  return profile
    ? (snapshot?.states.some(
        (state) => state.profileId === profile.profileId && state.state === "online",
      ) ?? false)
    : false;
}

/** 每次推送结束写入设备同步状态；它是设备行「上次同步」的唯一数据源。 */
export async function recordDataSyncResult(
  service: IDeviceSyncStateService | undefined,
  sourceServerId: string,
  result: DeviceSyncResult,
): Promise<void> {
  if (!service) return;
  try {
    await service.recordDeviceSyncResult({ sourceServerId, result });
  } catch (error) {
    logger.warn("[DataSync] 写入设备同步状态失败", {
      sourceServerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 远端一侧只用该设备的 source-settings attachment：不打开 workspace tab，也不新建 Host、连接或 Agent。
 * attachment 在设备离线时被 Host detach；设备重新在线后这里重新申请，弹窗按新 generation 重新加载。
 */
export function DataSyncDialogContainer(props: {
  device: DataSyncDeviceSummary;
  online: boolean;
  workspaceHistory?: readonly SourceServerWorkspaceHistoryEntry[];
  sourceServices: IServiceAccessor;
  initialCategory?: DataSyncCategoryId;
  workspace?: DataSyncWorkspaceMapping;
  minimized: boolean;
  onMinimizedChange(minimized: boolean): void;
  onClose(): void;
  onPushFinished(result: DeviceSyncResult): Promise<void>;
}) {
  const tabs = useTabStore((state) => state.tabs);
  const workspaceTabs = useMemo(() => tabs.filter(isWorkspaceTab), [tabs]);
  const { online } = props;
  // 浏览器没有跨设备 source-settings attachment：数据同步只保留只读设备状态与入口语义，
  // 不再伪造远端 targetServices。入口本身由桌面壳层能力契约关闭。
  const targetServices = undefined;

  return (
    <DataSyncDialog
      open
      minimized={props.minimized}
      onMinimizedChange={props.onMinimizedChange}
      device={props.device}
      online={online}
      sourceServices={props.sourceServices}
      targetServices={targetServices}
      workspaceHistory={props.workspaceHistory}
      workspaceTabs={workspaceTabs}
      initialCategory={props.initialCategory}
      workspace={props.workspace}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      onPushFinished={props.onPushFinished}
    />
  );
}
