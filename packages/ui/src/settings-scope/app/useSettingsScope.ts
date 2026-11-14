import { useCallback, useEffect, useMemo, useState } from "react";
import type { IServiceAccessor } from "@zcode/services";
import type { SourceServerManagementSnapshot } from "@zcode/shared";
import { useSourceServerManagementSnapshot } from "@/hooks/useSourceServerManagementSnapshot.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { getWorkspaceSourceServerId } from "@/conversation-workspace-target/sourceIdentity.js";
import { getPathLeaf } from "@/lib/path.js";
import { logger } from "@/logger.js";
import type {
  SettingsScopeDevice,
  SettingsScopeDeviceState,
  SettingsScopeState,
  SettingsUserScope,
} from "@/settings-scope/contract.js";
import {
  LOCAL_USER_SCOPE_KEY,
  buildSettingsScopeGroups,
  isUserScopeKey,
  remoteUserScopeKey,
  resolveDefaultSettingsScopeKey,
  resolveSettingsScope,
} from "@/settings-scope/domain/scope.js";
import {
  useConfigWorkspaceTargets,
  type ConfigWorkspaceTarget,
} from "@/workspace-config-catalog/index.js";

function useServicesHomeDir(services: IServiceAccessor | undefined): string | undefined {
  const [snapshot, setSnapshot] = useState<{
    services: IServiceAccessor;
    homedir: string;
  } | null>(null);
  useEffect(() => {
    const info = services?.systemService?.info;
    if (!services || !info) return;
    let current = true;
    // 迟到结果只属于发起请求的那组服务：切换设备或 attachment 换代后旧结果被丢弃。
    void info.call(services.systemService).then(
      (result) => {
        if (current) setSnapshot({ services, homedir: result.homedir });
      },
      (error: unknown) => {
        if (current) logger.warn("[settings-scope] 读取设备 home 目录失败", error);
      },
    );
    return () => {
      current = false;
    };
  }, [services]);
  return snapshot && snapshot.services === services ? snapshot.homedir : undefined;
}

/**
 * 浏览器没有跨设备 source-settings attachment，远端「用户」配置不可达。
 * 这里返回明确的空结果，不再经平台端口申请 attachment 或用本机服务冒充远端。
 */
function useRemoteUserServices(): {
  services: IServiceAccessor | undefined;
  homedir: string | undefined;
  failed: boolean;
} {
  return { services: undefined, homedir: undefined, failed: false };
}

function normalizeInitialScopeKey(key: string | undefined): string | null {
  const trimmed = key?.trim();
  // 插件商店返回的 "user" 表示「当前设备的用户视图」，按默认规则解析到当前 workspace 所在设备。
  return trimmed && trimmed !== LOCAL_USER_SCOPE_KEY ? trimmed : null;
}

/** 设备名与在线状态都只取自管理快照：在线 = 该设备当前 Profile 的连接状态为 online。 */
function buildDeviceStates(
  snapshot: SourceServerManagementSnapshot | null,
): SettingsScopeDeviceState[] {
  if (!snapshot) return [];
  return snapshot.servers.map((server) => {
    const profiles = snapshot.profiles.filter(
      (profile) =>
        profile.sourceServerId === server.sourceServerId && profile.lifecycleState !== "retired",
    );
    const profile =
      profiles.find((item) => item.profileId === server.preferredProfileId) ?? profiles[0];
    return {
      sourceServerId: server.sourceServerId,
      name: server.displayName,
      online: profile
        ? snapshot.states.some(
            (state) => state.profileId === profile.profileId && state.state === "online",
          )
        : false,
    };
  });
}

/**
 * 设置页 Scope 的唯一状态 owner（插件 / MCP / 技能 / 命令 / 子智能体 / 钩子共用）。
 *
 * ```text
 * 配置目录目录表（项目）──┐
 * 管理快照（设备名/在线）──┼─▶ groups ─▶ 菜单
 * 平台能力（attachment）──┘
 * selectedScopeKey ─▶ resolveSettingsScope ─▶ ready / offline(fail-closed) / missing(回退同设备「用户」)
 *                                         └▶ user：本机 base services | 远端 source-settings + home
 * ```
 */
export function useSettingsScope(params: {
  workspacePath?: string | null;
  workspaceIdentity?: string | null;
  initialScopeKey?: string;
  /** 选中的项目已关闭、回退到同设备「用户」时通知（插件页沿用原有提示）。 */
  onFallback?(): void;
}): SettingsScopeState {
  const { workspacePath, workspaceIdentity, initialScopeKey, onFallback } = params;
  const base = useBaseWorkspaceServices();
  // 远端用户配置依赖已裁撤的桌面 attachment 端口，浏览器只使用工作区配置。
  const remoteUserAvailable = false;
  const { targets, loaded: catalogLoaded } = useConfigWorkspaceTargets();
  const { snapshot: deviceSnapshot } = useSourceServerManagementSnapshot(
    base.sourceServerManagementService,
  );
  const devices = useMemo(() => buildDeviceStates(deviceSnapshot), [deviceSnapshot]);
  const context = useMemo(
    () => ({ targets, devices, remoteUserAvailable }),
    [devices, remoteUserAvailable, targets],
  );
  const groups = useMemo(() => buildSettingsScopeGroups(context), [context]);
  const activeTarget = workspaceIdentity?.trim()
    ? targets.find((target) => target.workspaceIdentity === workspaceIdentity)
    : undefined;
  const defaultKey = resolveDefaultSettingsScopeKey({
    workspacePath,
    workspaceIdentity,
    remoteTarget: activeTarget?.remoteTarget,
    remoteUserAvailable,
  });
  const [pickedKey, setPickedKey] = useState(() => normalizeInitialScopeKey(initialScopeKey));
  useEffect(() => setPickedKey(normalizeInitialScopeKey(initialScopeKey)), [initialScopeKey]);
  const selectedScopeKey = pickedKey ?? defaultKey;
  const rawResolution = resolveSettingsScope(selectedScopeKey, context);
  // 默认 key 指向的项目可能还没出现在目录表里（异步读取）：只在本帧按回退目标解析，不改写选择。
  const resolution =
    rawResolution.status === "missing" && pickedKey === null
      ? resolveSettingsScope(rawResolution.fallbackKey, context)
      : rawResolution;
  const fallbackKey =
    // 初次挂载的空目录不是项目已删除，不能抢在异步读取前丢掉审核入口的工作区。
    catalogLoaded && rawResolution.status === "missing" && pickedKey !== null
      ? rawResolution.fallbackKey
      : null;
  useEffect(() => {
    if (fallbackKey === null) return;
    // 用户选中的项目已关闭或断开：显式回退到同一设备的「用户」并提示，不静默改写到其他设备。
    setPickedKey(fallbackKey);
    onFallback?.();
  }, [fallbackKey, onFallback]);

  const device: SettingsScopeDevice =
    resolution.status === "missing" ? { kind: "local" } : resolution.device;
  const deviceId = device.kind === "local" ? "local" : device.id;
  const deviceTargets = useMemo(
    () =>
      groups
        .find((group) => (group.device.kind === "local" ? "local" : group.device.id) === deviceId)
        ?.options.flatMap((option) => (option.target ? [option.target] : [])) ?? [],
    [deviceId, groups],
  );

  const remoteSourceServerId =
    device.kind === "remote" && remoteUserAvailable ? device.sourceServerId : null;
  const remoteOnline = remoteSourceServerId
    ? devices.some((item) => item.sourceServerId === remoteSourceServerId && item.online)
    : false;
  const remote = useRemoteUserServices();
  const localHomeDir = useServicesHomeDir(base);
  const localAnchor = useMemo<ConfigWorkspaceTarget | null>(() => {
    if (device.kind !== "local") return null;
    // 本机「用户」借用一个本机项目作为插件 / 技能接口需要的 cwd（与旧行为一致）；没有本机项目时用本机 home。
    const activeLocal =
      workspacePath && !workspaceIdentity?.trim()
        ? (deviceTargets.find((target) => target.workspacePath === workspacePath) ?? {
            workspacePath,
            label: getPathLeaf(workspacePath) || workspacePath,
          })
        : undefined;
    const anchor = activeLocal ?? deviceTargets[0];
    if (anchor) return anchor;
    return localHomeDir ? { workspacePath: localHomeDir, label: localHomeDir } : null;
  }, [device.kind, deviceTargets, localHomeDir, workspaceIdentity, workspacePath]);

  const user: SettingsUserScope =
    device.kind === "local"
      ? localAnchor
        ? { status: "ready", target: localAnchor, unscopedServices: base }
        : { status: "connecting" }
      : !remoteSourceServerId
        ? { status: "unavailable" }
        : !remoteOnline || remote.failed
          ? { status: "offline" }
          : remote.services && remote.homedir
            ? {
                status: "ready",
                target: { workspacePath: remote.homedir, label: remote.homedir },
                unscopedServices: remote.services,
                cacheAuthorityKey: `source-settings:${remoteSourceServerId}`,
              }
            : { status: "connecting" };

  const syncSourceServerId =
    resolution.status === "ready" && resolution.kind === "user" && device.kind === "remote"
      ? device.sourceServerId
      : null;
  const activeDeviceId = workspaceIdentity?.trim()
    ? workspacePath
      ? (getWorkspaceSourceServerId({
          workspacePath,
          workspaceIdentity: workspaceIdentity.trim(),
          remoteTarget: activeTarget?.remoteTarget,
        }) ??
        activeTarget?.hostId ??
        null)
      : null
    : "local";
  const deviceUserKey =
    device.kind === "local"
      ? LOCAL_USER_SCOPE_KEY
      : device.sourceServerId
        ? remoteUserScopeKey(device.sourceServerId)
        : LOCAL_USER_SCOPE_KEY;
  const setSelectedScopeKey = useCallback((key: string) => setPickedKey(key), []);
  const toLocalScopeKey = useCallback(
    (pageKey: string) => (isUserScopeKey(pageKey) ? LOCAL_USER_SCOPE_KEY : pageKey),
    [],
  );
  const toPageScopeKey = useCallback(
    (localKey: string) => (localKey === LOCAL_USER_SCOPE_KEY ? deviceUserKey : localKey),
    [deviceUserKey],
  );
  return {
    groups,
    selectedScopeKey: resolution.status === "missing" ? selectedScopeKey : resolution.key,
    setSelectedScopeKey,
    resolution,
    device,
    deviceTargets,
    user,
    syncSourceServerId,
    isActiveWorkspaceDevice: activeDeviceId === deviceId,
    toLocalScopeKey,
    toPageScopeKey,
  };
}
