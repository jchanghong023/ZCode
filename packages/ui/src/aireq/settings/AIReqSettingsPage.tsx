import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Folders, Palette, HelpCircle, Settings } from "lucide-react";
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
import {
  SETTINGS_FRAME_CONTENT_CLASSNAME,
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
import { AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { AIReqAgentModelSettings } from "./AIReqAgentModelSettings.js";
import { AIReqPersonalizationSettings } from "./AIReqPersonalizationSettings.js";
import { AIReqProjectSettings, type AIReqProjectSettingsRequest } from "./AIReqProjectSettings.js";
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
  analysisProjectId,
  projectSettingsRequest,
  onProjectSettingsRequestHandled,
}: {
  active: boolean;
  onClose: () => void;
  section: AIReqSettingsSection;
  onSectionChange: (section: AIReqSettingsSection) => void;
  onHelp: (returnFocusTo?: HTMLButtonElement | null) => void;
  onNavigationGuardChange?: (guard: AIReqNavigationGuard | null) => void;
  skillActions: AIReqSettingsDraftActions | null;
  analysisProjectId?: string;
  projectSettingsRequest: AIReqProjectSettingsRequest | null;
  onProjectSettingsRequestHandled(request: AIReqProjectSettingsRequest): void;
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
        {
          id: "general",
          label: titles.projects,
          includeSettings: false,
          items: [
            {
              id: "aireq.projects",
              label: zh
                ? "项目、仓库与 Release（先选择项目）"
                : "Projects, repositories and releases (select a project)",
              keywords: [
                "项目名称",
                "仓库",
                "远程仓库",
                "默认分支",
                "版本",
                "Release",
                "project",
                "repository",
                "branch",
              ],
            },
          ],
        },
        {
          id: "modelProvider",
          label: `${aiTitle} · ${titles.models}`,
          includeSettings: false,
          items: [
            {
              id: "aireq.model.default",
              label: zh ? "工作流默认模型" : "Workflow default model",
              keywords: ["默认模型", "default model", "workflow model"],
            },
            {
              id: "aireq.model.agents",
              label: zh ? "Agent 模型与思考强度" : "Agent models and reasoning",
              keywords: ["模型配置", "思考强度", "推理", "agent model", "reasoning"],
            },
            {
              id: "aireq.model.progressAnalysis",
              label: zh ? "需求分析 Agent 模型" : "Requirement Analysis Agent model",
              keywords: ["进度分析", "分析模型", "progress analysis", "analysis model"],
            },
          ],
        },
        {
          id: "personalization",
          label: `${aiTitle} · ${titles.personalization}`,
          includeSettings: false,
          items: [
            {
              id: "aireq.instructions.agent",
              label: zh ? "选择 Agent" : "Select Agent",
              keywords: ["角色", "选择智能体", "agent", "role"],
            },
            {
              id: "aireq.instructions.prompt",
              label: zh ? "追加指令" : "Additional instructions",
              keywords: [
                "共享指令",
                "Agent 指令",
                "提示词",
                "系统提示词",
                "prompt",
                "instructions",
              ],
            },
          ],
        },
        {
          id: "agentBehavior",
          label: `${aiTitle} · ${titles.analysis}`,
          includeSettings: false,
          items: [
            {
              id: "aireq.analysis.enabled",
              label: zh ? "全局自动分析" : "Global automatic analysis",
              keywords: ["分析开关", "自动调度", "global analysis", "scheduler"],
            },
            {
              id: "aireq.analysis.projects",
              label: zh ? "项目分析范围" : "Project analysis scope",
              keywords: ["项目分析", "启用项目", "project analysis", "project scope"],
            },
            {
              id: "aireq.analysis.interval",
              label: zh ? "统一分析间隔" : "Analysis interval",
              keywords: ["间隔", "周期", "调度", "interval", "schedule"],
            },
          ],
        },
      ] as const,
    [titles, aiTitle, zh],
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
  const returnFocus = useRef<HTMLElement | null>(null);
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
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      setError(formatUserFacingError(cause, "保存失败，请检查输入或连接状态后重试。"));
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
      {/* 固定窄栏和纵向按钮导致设置导航偏离 base；复用共享框架与导航控件恢复原有布局。 */}
      <SettingsPageFrame
        title={zh ? "设置" : "Settings"}
        isDesktop={false}
        isMacDesktop={false}
        isWindowsDesktop={false}
        rootProps={{
          "data-testid": "aireq-settings",
          "data-active-section": section,
          // 共享框架默认宽度与工作台不同，使用工作台的 w-64 保持切换前后对齐。
          style: { gridTemplateColumns: "256px minmax(0, 1fr)" },
        }}
        backButton={
          <ControlHintTooltip
            title={zh ? "返回工作区" : "Return to workspace"}
            side="right"
            align="center"
          >
            <Button
              type="button"
              variant="ghost"
              size="lg"
              aria-label={zh ? "返回工作区" : "Return to workspace"}
              className="m-1 w-[calc(100%-0.5rem)] justify-start gap-2 rounded-xl bg-surface px-1.5 text-remote-foreground-muted hover:bg-surface-hover hover:text-foreground max-lg:m-1 max-lg:size-10 max-lg:justify-center max-lg:px-0"
              onClick={() => guard(onClose)}
            >
              <ArrowLeft className="size-4" />
              <span className="max-lg:sr-only">{zh ? "返回工作区" : "Return to workspace"}</span>
            </Button>
          </ControlHintTooltip>
        }
        search={
          <SettingsSearch
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
            ).map((entry) => {
              return (
                <SettingsSidebarButton
                  key={entry.label}
                  icon={entry.icon}
                  label={entry.label}
                  active={entry.active}
                  aria-current={entry.active ? "page" : undefined}
                  onClick={() => navigate(entry.id)}
                >
                  <span className="truncate text-ui-base text-foreground">{entry.label}</span>
                </SettingsSidebarButton>
              );
            })}
          </div>
        }
        footer={
          // 齿轮原先仅标识当前位置、没有点击动作；与顶部返回共用门禁，避免离开时丢失草稿。
          <div className="flex shrink-0 justify-end px-4 pt-2 pb-4">
            <ControlHintTooltip title={zh ? "返回工作区" : "Return to workspace"} side="right">
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={zh ? "返回工作区" : "Return to workspace"}
                aria-current="page"
                onClick={() => guard(onClose)}
              >
                <Settings className="size-4" aria-hidden="true" />
              </Button>
            </ControlHintTooltip>
          </div>
        }
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
        <main
          ref={contentRef}
          className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]"
        >
          <div className={`${SETTINGS_FRAME_CONTENT_CLASSNAME} flex min-w-0 flex-col gap-8`}>
            <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{aiSection ? aiTitle : titles[section]}</h1>
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
                      onOpenModelSettings={() =>
                        guard(() => {
                          // 分析设置指向对应 Agent，避免进入模型页后再次搜索目标。
                          onSectionChange("models");
                          setSearchTarget({ id: "aireq.model.progressAnalysis" });
                        })
                      }
                      onDraftActionsChange={onDraftActionsChange}
                      focusProjectId={analysisProjectId}
                    />
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div key={section} className="space-y-8">
                {section === "appearance" ? (
                  <Appearance />
                ) : (
                  <AIReqProjectSettings
                    guard={guard}
                    onDraftActionsChange={onDraftActionsChange}
                    active={active}
                    request={projectSettingsRequest}
                    onRequestHandled={onProjectSettingsRequestHandled}
                  />
                )}
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
        <DialogContent
          className="max-w-md"
          showCloseButton={!busy}
          onCloseAutoFocus={(event) => {
            // 项目编辑是嵌套弹窗；取消确认后恢复原输入，避免焦点落到被遮罩的工作区。
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus({ preventScroll: true });
            }
            returnFocus.current = null;
          }}
        >
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
