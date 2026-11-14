import { useCallback, useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { BlocksIcon, CableIcon, WandIcon } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.js";
import { useSourceServerManagementSnapshot } from "@/hooks/useSourceServerManagementSnapshot.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { DataSyncCategoryId, DataSyncDialogRequest } from "@/data-sync/contract.js";
import { isDataSyncDeviceOnline } from "@/data-sync/ui/DataSyncDialogContainer.js";
import {
  useDataSyncResultVersion,
  useOpenDataSyncDialog,
} from "@/data-sync/ui/DataSyncDialogProvider.js";

/** 旧入口能定位的分类：技能、MCP、插件。 */
export type DataSyncEntryCategory = Extract<DataSyncCategoryId, "skills" | "mcp" | "plugins">;

export type DataSyncEntryRequest = DataSyncDialogRequest;

/** 设备在线判断与数据同步页一致：取自管理快照；不会为此建立连接。 */
export function useDataSyncDeviceOnline(sourceServerId: string | null | undefined): boolean {
  const management = useBaseWorkspaceServices().sourceServerManagementService;
  const { snapshot } = useSourceServerManagementSnapshot(management, {
    enabled: Boolean(sourceServerId),
  });
  return sourceServerId ? isDataSyncDeviceOnline(snapshot, sourceServerId) : false;
}

/**
 * 旧同步入口统一打开数据同步弹窗。
 * available：平台能申请设备的 source-settings attachment（只有桌面端）；Web 与手机远控不显示入口。
 * onPushFinished：任一推送的设备结果写入后，已挂载的本页刷新一次，与弹窗由哪个入口打开无关。
 */
export function useDataSyncEntry(options: { onPushFinished?(): void | Promise<void> } = {}): {
  available: boolean;
  open(request: DataSyncEntryRequest): void;
  dialog: ReactNode;
} {
  const openDialog = useOpenDataSyncDialog();
  const resultVersion = useDataSyncResultVersion();
  // 跨设备同步依赖桌面壳层提供的 source-settings attachment；浏览器没有该宿主端口。
  const available = false;
  const onPushFinishedRef = useRef(options.onPushFinished);
  const seenResultVersionRef = useRef(resultVersion);
  useEffect(() => {
    onPushFinishedRef.current = options.onPushFinished;
  }, [options.onPushFinished]);
  // 修复原因：刷新回调原来绑在打开弹窗的入口实例上。最小化后该页卸载再挂载，或从数据同步页、
  // 状态条恢复弹窗时，推送结束只调用已失效的旧回调，设置页列表停在推送前。改为订阅窗口级结果版本：
  // 设备结果写入后，当时已挂载的入口页各刷新一次；页面新挂载时自行加载，不重复刷新。
  useEffect(() => {
    if (seenResultVersionRef.current === resultVersion) return;
    seenResultVersionRef.current = resultVersion;
    void onPushFinishedRef.current?.();
  }, [resultVersion]);
  const open = useCallback(
    (next: DataSyncEntryRequest) => {
      if (available && openDialog) openDialog(next);
    },
    [available, openDialog],
  );
  return { available, open, dialog: null };
}

const ENTRY_ITEMS: ReadonlyArray<{
  category: DataSyncEntryCategory;
  messageId: string;
  icon: typeof WandIcon;
}> = [
  { category: "skills", messageId: "remote.syncSkills", icon: WandIcon },
  { category: "mcp", messageId: "remote.syncMcp", icon: CableIcon },
  { category: "plugins", messageId: "remote.syncPlugins", icon: BlocksIcon },
];

/** Header 更多菜单共用的三个同步项；设备离线时禁用。 */
export function DataSyncEntryMenuItems(props: {
  disabled?: boolean;
  stopMouseDownPropagation?: boolean;
  onSelect(category: DataSyncEntryCategory): void;
}) {
  const { intl } = useZCodeIntl();
  const handleMouseDown = props.stopMouseDownPropagation
    ? (event: MouseEvent) => event.stopPropagation()
    : undefined;
  return (
    <>
      {ENTRY_ITEMS.map(({ category, messageId, icon: Icon }) => (
        <DropdownMenuItem
          key={category}
          data-testid={`data-sync-entry-${category}`}
          disabled={props.disabled}
          onMouseDown={handleMouseDown}
          onSelect={() => props.onSelect(category)}
        >
          <Icon className="size-3.5" />
          {intl.formatMessage({ id: messageId })}
        </DropdownMenuItem>
      ))}
    </>
  );
}
