import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Folders, Package, Palette, User, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { AppearanceSectionContent } from "@/settingsCodePreview.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import {
  SettingsPageFrame,
  SettingsSidebarButton,
} from "@/settings/SettingsPageParts.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import {
  SettingsSearch,
  SettingsSearchTargetContext,
  type SettingsSearchId,
} from "@/settings-search/index.js";
import type { SettingsSectionId } from "@/lib/settingsNavigation.js";
import { AIReqAgentModelSettings } from "./AIReqAgentModelSettings.js";
import { AIReqPersonalizationSettings } from "./AIReqPersonalizationSettings.js";
import { AIReqProjectSettings } from "./AIReqProjectSettings.js";
import type { AIReqSettingsDraftActions } from "../contract.js";

export type AIReqSettingsSection =
  | "appearance"
  | "projects"
  | "models"
  | "personalization";
export type AIReqNavigationGuard = (navigate: () => void) => void;
const titles: Record<AIReqSettingsSection, string> = {
  appearance: "外观",
  projects: "AIReq 项目与 Release",
  models: "模型设置",
  personalization: "个性化",
};
const icons = {
  appearance: Palette,
  projects: Folders,
  models: Package,
  personalization: User,
};
const searchSections = [
  { id: "appearance", label: titles.appearance },
  { id: "general", label: titles.projects, includeSettings: false },
  { id: "modelProvider", label: titles.models, includeSettings: false },
  { id: "personalization", label: titles.personalization, includeSettings: false },
] as const;
const searchSectionTargets: Partial<Record<SettingsSectionId, AIReqSettingsSection>> = {
  appearance: "appearance",
  general: "projects",
  modelProvider: "models",
  personalization: "personalization",
};

function Appearance() {
  const theme = useZCodeStore((s) => s.theme);
  const setTheme = useZCodeStore((s) => s.setTheme);
  const codePreviewSettings = useZCodeStore((s) => s.codePreviewSettings);
  const setCodePreviewSettings = useZCodeStore((s) => s.setCodePreviewSettings);
  const uiFontSizePx = useZCodeStore((s) => s.uiFontSizePx);
  const setUiFontSizePx = useZCodeStore((s) => s.setUiFontSizePx);
  const fontSmoothingEnabled = useZCodeStore((s) => s.fontSmoothingEnabled);
  const setFontSmoothingEnabled = useZCodeStore((s) => s.setFontSmoothingEnabled);
  return (
    <AppearanceSectionContent
      {...{
        theme,
        setTheme,
        codePreviewSettings,
        setCodePreviewSettings,
        uiFontSizePx,
        setUiFontSizePx,
        fontSmoothingEnabled,
        setFontSmoothingEnabled,
      }}
      isMacDesktop={false}
    />
  );
}

export function AIReqSettingsPage({
  active,
  onClose,
  section,
  onSectionChange,
  onHelp,
  onNavigationGuardChange,
  skillActions,
}: {
  active: boolean;
  onClose: () => void;
  section: AIReqSettingsSection;
  onSectionChange: (section: AIReqSettingsSection) => void;
  onHelp: (returnFocusTo?: HTMLButtonElement | null) => void;
  onNavigationGuardChange?: (guard: AIReqNavigationGuard | null) => void;
  skillActions: AIReqSettingsDraftActions | null;
}) {
  const actions = useRef<{
    form: AIReqSettingsDraftActions | null;
    skill: AIReqSettingsDraftActions | null;
  }>({ form: null, skill: null });
  const pending = useRef<(() => void) | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [canSave, setCanSave] = useState(false);
  const [canDiscard, setCanDiscard] = useState(true);
  const [error, setError] = useState("");
  const [searchTarget, setSearchTarget] = useState<{ id: SettingsSearchId } | null>(null);
  const updateActions = useCallback(
    (kind: "form" | "skill", next: AIReqSettingsDraftActions | null) => {
      actions.current[kind] = next;
      const { form, skill } = actions.current;
      setCanSave(form?.canSave !== false && skill?.canSave !== false);
      setCanDiscard(form?.canDiscard !== false && skill?.canDiscard !== false);
    },
    [],
  );
  const onDraftActionsChange = useCallback(
    (next: AIReqSettingsDraftActions | null) => updateActions("form", next),
    [updateActions],
  );
  useEffect(() => updateActions("skill", skillActions), [skillActions, updateActions]);
  const guard = useCallback<AIReqNavigationGuard>((navigate) => {
    if (pending.current) return;
    if (!actions.current.form && !actions.current.skill) {
      navigate();
      return;
    }
    pending.current = navigate;
    setError("");
    setConfirm(true);
  }, []);
  useEffect(() => {
    if (!active) return;
    onNavigationGuardChange?.(guard);
    return () => onNavigationGuardChange?.(null);
  }, [active, guard, onNavigationGuardChange]);
  const finish = useCallback(() => {
    const next = pending.current;
    pending.current = null;
    actions.current.form = null;
    actions.current.skill = null;
    setConfirm(false);
    next?.();
  }, []);
  // 快捷键曾绕过门禁结算；所有入口共用保存动作与同步忙锁，成功后仅消费一次 pending。
  const save = useCallback(async () => {
    const current = actions.current;
    if (
      busyRef.current ||
      current.form?.canSave === false ||
      current.skill?.canSave === false
    )
      return;
    // 说明自动保存可能在确认框打开后完成；已无脏动作时直接结算原导航。
    if (!current.form && !current.skill) {
      if (pending.current) finish();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (
        (!current.form || (await current.form.save())) &&
        (!current.skill || (await current.skill.save()))
      ) {
        if (pending.current) finish();
      } else {
        setError("保存失败，请检查当前权限、大小限制或连接状态后重试。");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [finish]);
  useEffect(() => {
    if (!active) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!actions.current.form && !actions.current.skill) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const saveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void save();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", saveShortcut);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", saveShortcut);
    };
  }, [active, save]);
  const navigate = (next: AIReqSettingsSection) => {
    if (next === section) return;
    guard(() => {
      // 旧搜索目标不能跨分区保留，否则返回外观时重新挂载会再次抢焦点。
      setSearchTarget(null);
      onSectionChange(next);
    });
  };
  return (
    <SettingsSearchTargetContext.Provider value={searchTarget}>
      <SettingsPageFrame
        title="设置"
        isDesktop={false}
        isMacDesktop={false}
        isWindowsDesktop={false}
        rootProps={{ "data-testid": "aireq-settings", "data-active-section": section, style: { gridTemplateColumns: "68px minmax(0, 1fr)" } }}
        backButton={
          <ControlHintTooltip title="返回工作区" side="right" align="center">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              aria-label="返回工作区"
              className="m-1 size-10 justify-center rounded-xl bg-surface p-0 text-remote-foreground-muted hover:bg-surface-hover hover:text-foreground"
              onClick={() => guard(onClose)}
            >
              <ArrowLeft className="size-4" />
              <span className="sr-only">返回工作区</span>
            </Button>
          </ControlHintTooltip>
        }
        search={
          <SettingsSearch
            compact
            sections={searchSections}
            onSelect={({ section: targetSection, setting }) => {
              const next = searchSectionTargets[targetSection];
              if (!next) return;
              // AIReq 迁移漏接搜索；沿用离开门禁，接纳后才更换分区和定位目标。
              guard(() => {
                onSectionChange(next);
                setSearchTarget(setting ? { id: setting } : null);
              });
            }}
          />
        }
        navigationLabel="设置分区"
        navigation={
          <div className="space-y-4 compact-web:flex compact-web:items-center compact-web:gap-2 compact-web:space-y-0">
            {(
              [
                ["个人工具", ["appearance"]],
                ["平台配置", ["projects", "models", "personalization"]],
              ] as const
            ).map(([group, entries], index) => (
              <div
                key={group}
                role="group"
                aria-label={group}
                className={`space-y-1 ${index ? "border-t border-border pt-3" : ""}`}
              >
                <div className="sr-only">
                  {group}
                </div>
                {entries.map((id) => (
                  <SettingsSidebarButton
                    key={id}
                    icon={icons[id]}
                    label={titles[id]}
                    className="mx-auto size-10 justify-center px-0 [&>span:last-child]:sr-only"
                    active={section === id}
                    aria-current={section === id ? "page" : undefined}
                    onClick={() => navigate(id)}
                  />
                ))}
              </div>
            ))}
          </div>
        }
        footer={null}
        help={
          <Button
            variant="ghost"
            size="icon"
            aria-label="帮助"
            onClick={(event) => onHelp(event.currentTarget)}
          >
            <HelpCircle className="size-4" />
          </Button>
        }
      >
        {/* 修复：分区切换后复用滚动容器会沿用旧页面位置，使新标题移出视野。 */}
        <main key={section} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-8 lg:px-8 lg:pb-10">
            <h2 className="text-ui-settings-title font-semibold tracking-tight text-foreground lg:text-ui-settings-title-lg">
              {titles[section]}
            </h2>
            <div className="space-y-8">
              {section === "appearance" ? (
                <Appearance />
              ) : section === "projects" ? (
                <AIReqProjectSettings />
              ) : section === "models" ? (
                <AIReqAgentModelSettings onDraftActionsChange={onDraftActionsChange} />
              ) : section === "personalization" ? (
                <AIReqPersonalizationSettings onDraftActionsChange={onDraftActionsChange} />
              ) : null}
            </div>
          </div>
        </main>
      </SettingsPageFrame>
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!open && !busy) {
            pending.current = null;
            setConfirm(false);
          }
        }}
      >
        <DialogContent className="max-w-md" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>保存更改？</DialogTitle>
            <DialogDescription>
              当前更改尚未保存。保存成功后才会离开；取消将保留所有草稿。
              {/* 仅有 Skill 草稿需要解释其丢弃范围，避免设置表单显示无关提示。 */}
              {skillActions && "Skill 丢弃仅放弃本版确认保存，保留临时预览、未发送正文与附件。"}
            </DialogDescription>
          </DialogHeader>
          {skillActions?.saveBlockedReason && (
            <p role="alert" className="text-ui-sm text-destructive">
              {skillActions.saveBlockedReason}
            </p>
          )}
          {error && (
            <p role="alert" className="text-ui-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                pending.current = null;
                setConfirm(false);
              }}
            >
              取消
            </Button>
            <Button
              variant="outline"
              disabled={busy || !canDiscard}
              onClick={() => {
                const { form, skill } = actions.current;
                if (form?.canDiscard === false || skill?.canDiscard === false) return;
                form?.discard();
                skill?.discard();
                finish();
              }}
            >
              丢弃
            </Button>
            <Button disabled={busy || !canSave} onClick={() => void save()}>
              {busy ? "保存中…" : "保存并离开"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSearchTargetContext.Provider>
  );
}
