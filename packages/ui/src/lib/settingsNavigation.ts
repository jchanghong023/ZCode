import { logger } from "@/logger.js";

export type SettingsSectionId =
  | "general"
  | "agentBehavior"
  | "appearance"
  | "migration"
  | "modelProvider"
  | "documentFormats"
  | "remoteDevices"
  | "dataSync"
  | "personalization"
  | "memory"
  | "mcp"
  | "skill"
  | "projects"
  | "archives"
  | "usage"
  | "subagents"
  | "commands"
  | "hooks"
  | "workspaceFileSearch"
  | "automations"
  | "shortcuts";

const SETTINGS_LAST_SECTION_STORAGE_KEY = "zcode-settings-last-section";
const HIDDEN_SETTINGS_SECTIONS = new Set<SettingsSectionId>([
  // 产品语义：定时任务是 workspace 主视图，不能再作为设置页分区出现。
  // 注意：hooks 已是正式设置页分区，不在此列。
  "automations",
  // 工作区搜索（.zcodeignore）设置入口先隐藏：规则文件仍生效并可手动编辑，
  // 编辑页代码保留，放开时从这里移除即可。
  "workspaceFileSearch",
]);

function isSettingsSectionId(value: string): value is SettingsSectionId {
  return (
    value === "general" ||
    value === "agentBehavior" ||
    value === "appearance" ||
    value === "migration" ||
    value === "modelProvider" ||
    value === "documentFormats" ||
    value === "remoteDevices" ||
    value === "dataSync" ||
    value === "personalization" ||
    value === "memory" ||
    value === "mcp" ||
    value === "skill" ||
    value === "projects" ||
    value === "archives" ||
    value === "usage" ||
    value === "subagents" ||
    value === "commands" ||
    value === "hooks" ||
    value === "workspaceFileSearch" ||
    value === "automations" ||
    value === "shortcuts"
  );
}

function isSettingsSectionEnabled(section: SettingsSectionId): boolean {
  return !HIDDEN_SETTINGS_SECTIONS.has(section);
}

function resolveSettingsSection(
  section: SettingsSectionId,
  fallbackSection: SettingsSectionId = "general",
): SettingsSectionId {
  return isSettingsSectionEnabled(section) ? section : fallbackSection;
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch (error) {
    // 部分 WebView / 移动远控容器可能禁用 localStorage。
    // 设置页分区记忆只是 UI 偏好，存储不可用时回退默认入口，不应阻断打开设置页。
    logger.warn("[settingsNavigation] localStorage 不可用", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function readLastSettingsSectionPreference(
  fallbackSection: SettingsSectionId = "general",
): SettingsSectionId {
  const storage = getLocalStorage();
  if (!storage) {
    return fallbackSection;
  }

  try {
    const raw = storage.getItem(SETTINGS_LAST_SECTION_STORAGE_KEY);
    if (raw === "skills") {
      storage.setItem(SETTINGS_LAST_SECTION_STORAGE_KEY, "skill");
      return "skill";
    }
    // 旧版“代码预览”已并入“外观”，保留用户上次停留位置的迁移语义。
    if (raw === "codePreview") {
      storage.setItem(SETTINGS_LAST_SECTION_STORAGE_KEY, "appearance");
      return "appearance";
    }
    if (raw && isSettingsSectionId(raw)) {
      return resolveSettingsSection(raw, fallbackSection);
    }
    if (raw !== null) {
      storage.removeItem(SETTINGS_LAST_SECTION_STORAGE_KEY);
    }
  } catch (error) {
    logger.warn("[settingsNavigation] 读取上次设置分区失败", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return fallbackSection;
}

export function writeLastSettingsSectionPreference(section: SettingsSectionId): void {
  const resolvedSection = resolveSettingsSection(section);
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(SETTINGS_LAST_SECTION_STORAGE_KEY, resolvedSection);
  } catch (error) {
    logger.warn("[settingsNavigation] 写入上次设置分区失败", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
