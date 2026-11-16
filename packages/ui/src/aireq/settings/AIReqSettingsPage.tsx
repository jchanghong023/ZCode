import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Folders, Palette, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
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
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsPageFrame, SettingsSidebarButton } from "@/settings/SettingsPageParts.js";
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
import { AIReqAnalysisSettings } from "../tracking/analysis/AIReqAnalysisSettings.js";
import type { AIReqSettingsDraftActions } from "../contract.js";

export type AIReqSettingsSection =
  | "appearance"
  | "projects"
  | "models"
  | "personalization"
  | "analysis";
export type AIReqNavigationGuard = (navigate: () => void) => void;
const chineseTitles = {
  appearance: "外观",
  projects: "项目配置",
  models: "模型",
  personalization: "Agent 指令",
  analysis: "分析设置",
};
const englishTitles = {
  appearance: "Appearance",
  projects: "Project configuration",
  models: "Models",
  personalization: "Agent instructions",
  analysis: "Analysis settings",
};
const searchSectionTargets: Partial<Record<SettingsSectionId, AIReqSettingsSection>> = {
  appearance: "appearance",
  general: "projects",
  modelProvider: "models",
  personalization: "personalization",
  agentBehavior: "analysis",
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
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const titles = zh ? chineseTitles : englishTitles;
  const aiTitle = zh ? "AI 配置" : "AI configuration";
  const aiSection = section === "models" || section === "personalization" || section === "analysis";
  const contentRef = useRef<HTMLElement>(null);
  const searchSections = useMemo(
    () =>
      [
        { id: "appearance", label: titles.appearance },
        { id: "general", label: titles.projects, includeSettings: false },
        { id: "modelProvider", label: `${aiTitle} · ${titles.models}`, includeSettings: false },
        {
          id: "personalization",
          label: `${aiTitle} · ${titles.personalization}`,
          includeSettings: false,
        },
        { id: "agentBehavior", label: `${aiTitle} · ${titles.analysis}`, includeSettings: false },
      ] as const,
    [titles, aiTitle],
  );
  useLayoutEffect(() => {
    // AI 子页共用稳定的页签栏；仅重置正文滚动，保留键盘切换后的页签焦点。
    contentRef.current?.scrollTo({ top: 0 });
  }, [section]);
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
    if (busyRef.current || current.form?.canSave === false || current.skill?.canSave === false)
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
        title={zh ? "设置" : "Settings"}
        isDesktop={false}
        isMacDesktop={false}
        isWindowsDesktop={false}
        rootProps={{
          "data-testid": "aireq-settings",
          "data-active-section": section,
          style: { gridTemplateColumns: "68px minmax(0, 1fr)" },
        }}
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
        navigationLabel={zh ? "设置分区" : "Settings categories"}
        navigation={
          <div className="space-y-1">
            {(
              [
                {
                  id: "appearance",
                  icon: Palette,
                  label: titles.appearance,
                  active: section === "appearance",
                },
                {
                  id: "projects",
                  icon: Folders,
                  label: titles.projects,
                  active: section === "projects",
                },
                {
                  id: aiSection ? section : "models",
                  icon: Bot,
                  label: aiTitle,
                  active: aiSection,
                },
              ] as const
            ).map((entry) => (
              <SettingsSidebarButton
                key={entry.label}
                icon={entry.icon}
                label={entry.label}
                className="mx-auto size-10 justify-center px-0 [&>span:last-child]:sr-only"
                active={entry.active}
                aria-current={entry.active ? "page" : undefined}
                onClick={() => navigate(entry.id)}
              />
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
        <main ref={contentRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-8 lg:px-8 lg:pb-10">
            <h2 className="text-ui-settings-title font-semibold tracking-tight text-foreground lg:text-ui-settings-title-lg">
              {aiSection ? aiTitle : titles[section]}
            </h2>
            {aiSection ? (
              <Tabs
                value={section}
                onValueChange={(next) => navigate(next as AIReqSettingsSection)}
                activationMode="manual"
                className="min-w-0"
              >
                <TabsList aria-label={aiTitle}>
                  {(["models", "personalization", "analysis"] as const).map((id) => (
                    <TabsTrigger key={id} value={id}>
                      {titles[id]}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent key={section} value={section} className="mt-6 space-y-8">
                  {section === "models" ? (
                    <AIReqAgentModelSettings onDraftActionsChange={onDraftActionsChange} />
                  ) : section === "personalization" ? (
                    <AIReqPersonalizationSettings onDraftActionsChange={onDraftActionsChange} />
                  ) : (
                    <AIReqAnalysisSettings
                      onOpenModelSettings={() => navigate("models")}
                      onDraftActionsChange={onDraftActionsChange}
                    />
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div key={section} className="space-y-8">
                {section === "appearance" ? <Appearance /> : <AIReqProjectSettings />}
              </div>
            )}
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
