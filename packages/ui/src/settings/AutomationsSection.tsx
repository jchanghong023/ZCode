/* eslint-disable max-lines -- 定时任务主视图集中维护列表、创建/编辑整页路由与启停/删除操作，集中更利于交互一致。 */
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type SVGProps,
  type ReactNode,
} from "react";
import { CircleCheck, RotateCcw, TriangleAlert } from "lucide-react";
import {
  AUTOMATION_CREATE_LIMIT,
  isAutomationCreateLimitError,
  resolveWorkspaceKey,
  type ZCodeAutomation,
} from "@zcode/shared";
import {
  TID_AUTOMATION_ACTION_DELETE,
  TID_AUTOMATION_ACTION_TOGGLE,
  TID_AUTOMATION_CARD,
  TID_AUTOMATION_CARD_MENU,
  TID_AUTOMATIONS_LIST,
  TID_AUTOMATIONS_STATUS_FILTER,
} from "@zcode/shared/test-ids";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Spinner } from "@/components/ui/spinner.js";
import { toast as showToast, type ToastOptions } from "@/components/ui/toast.js";
import { cn } from "@/components/lib/utils.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { AutomationScheduledTemplateIcon } from "@/settings/AutomationScheduledTemplateIcon.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useServices } from "@/hooks/useServices.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useProviderSettingsView } from "@/hooks/useProviderSettingsView.js";
import { logger } from "@/logger.js";
import {
  useAutomationManagementStore,
  type AutomationRunNowResult,
} from "@/store/automationManagementStore.js";
import {
  formatAutomationCardNextRun,
  hasAutomationFailureState,
  resolveAutomationStatusKind,
  type AutomationStatusKind,
  SCHEDULED_AUTOMATION_STATUS_FILTERS,
  SCHEDULED_AUTOMATION_STATUS_LABELS,
  DEFAULT_AUTOMATION_STATUS_FILTER,
  resolveScheduledAutomationStatus,
  type AutomationStatusFilter,
} from "@/settings/automationFormat.js";
import { describeAutomationCardSchedule } from "@/settings/automationCardSchedule.js";
import { AutomationEditView, type AutomationEditSubmit } from "@/settings/AutomationEditView.js";
import { AutomationScheduleBadge } from "@/settings/AutomationScheduleBadge.js";
import {
  AutomationClockIcon,
  AutomationContinueIcon,
  AutomationCreateDropdown,
  AutomationEditActionIcon,
  AutomationMoreHorizontalIcon,
  AutomationPauseActionIcon,
  AutomationPausedIcon,
  AutomationRefreshIcon,
  AutomationRunNowIcon,
  AutomationTrashIcon,
} from "@/settings/AutomationDesignPrimitives.js";
import { SETTINGS_FRAME_CONTENT_CLASSNAME } from "@/settings/SettingsPageParts.js";
import {
  reportAutomationActionClick,
  reportAutomationCreateResult,
  resolveAutomationSelectionTelemetry,
} from "@/lib/automationTelemetry.js";
import {
  materializeScheduledTemplateDraft,
  resolveAutomationTemplateText,
  type ScheduledAutomationTemplate,
} from "@/settings/automationTemplateCatalog.js";
import { useAutomationTemplates } from "@/settings/useAutomationTemplates.js";
import type { AutomationsNavigationTab } from "@/lib/taskNavigationHistory.js";
import {
  AutomationsPageTitle,
  type AutomationsPageTab,
} from "@/settings/saved-workflows/AutomationsPageTitleSwitch.js";
import {
  readAutomationsPageTab,
  writeAutomationsPageTab,
} from "@/settings/saved-workflows/automationsPageTabMemory.js";
import { AutomationTemplateSkeletonGrid } from "@/settings/AutomationTemplateSkeletonGrid.js";
import type { AutomationWorkspaceOption } from "./automationWorkspaceOptions.js";

interface AutomationsSectionProps {
  /** 当前工作流标签由原生运行记录视图提供。 */
  nativeWorkflowContent?: ReactNode;
  projectOptions?: AutomationWorkspaceOption[];
  runNowNotice?: string;
  workspacePath?: string | null;
  workspaceIdentity?: string;
  /** 「Create via chat」切到会话；缺省则打开手动创建整页。 */
  onCreateViaChat?: (prompt: string) => void;
  /** 会话内创建卡片的详情导航目标；定位成功后由调用方清空。 */
  openAutomationId?: string | null;
  /** 推荐提示词携带的一次性 tab 导航目标；仅在目标 tab 可见时应用。"workflow" 落到顶级「工作流」标签。 */
  openAutomationTab?: AutomationsNavigationTab | null;
  onOpenAutomationConsumed?: () => void;
  /** 打开某次运行关联的会话；管理页列出所有项目，必须携带 automation 所属 workspace。 */
  onOpenSession?: (params: {
    sessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
  }) => void;
}

export const AUTOMATIONS_TOAST_ANCHOR_ID = "automations-main-toast-anchor";

function toast(message: string, options?: ToastOptions): number {
  return showToast(message, {
    ...options,
    anchorId: AUTOMATIONS_TOAST_ANCHOR_ID,
  });
}

/** 创建表单的预填草稿(来自「More ideas」模板)。 */
export interface AutomationDraft {
  templateId?: string;
  title: string;
  cronExpr: string;
  prompt: string;
}

/** 主视图内部路由:列表 / 新建 / 编辑。 */
type AutomationsView =
  | { mode: "list" }
  | { mode: "create"; draft: AutomationDraft | null }
  | { mode: "edit"; automation: ZCodeAutomation; savedRevision?: number };

const STATUS_META: Record<
  AutomationStatusKind,
  { icon: ComponentType<SVGProps<SVGSVGElement>>; className: string }
> = {
  active: { icon: AutomationClockIcon, className: "text-success" },
  // 设计稿的暂停态是 stop-circle 描边图标，不能回退为圆圈内实心方块。
  paused: { icon: AutomationPausedIcon, className: "text-foreground-subtle" },
  completed: { icon: CircleCheck, className: "text-foreground-subtle" },
  failed: { icon: TriangleAlert, className: "text-destructive" },
};

function automationPromptSummary(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : " ";
}

export function canRestartAutomation(
  automation: Pick<ZCodeAutomation, "lifecycleStatus">,
): boolean {
  return automation.lifecycleStatus === "failed";
}

export function canToggleAutomation(automation: Pick<ZCodeAutomation, "lifecycleStatus">): boolean {
  return automation.lifecycleStatus !== "completed" && automation.lifecycleStatus !== "failed";
}

export function getAutomationRunNowToastId(
  result: AutomationRunNowResult,
): "automations.runNowQueued" | "automations.runNowAlreadyRunning" | "automations.runNowFailed" {
  if (result === "queued") return "automations.runNowQueued";
  if (result === "duplicate") return "automations.runNowAlreadyRunning";
  return "automations.runNowFailed";
}

export type AutomationActionError = "create" | "update" | "toggle" | "restart" | "delete";

/** 原始 Agent/RPC 错误留在 logger；界面只展示当前动作对应的可理解提示。 */
export function getAutomationActionErrorToastId(action: AutomationActionError): string {
  return `automations.error.${action}`;
}

export function getAutomationCreateErrorToastId(error: unknown): string {
  return isAutomationCreateLimitError(error)
    ? "automations.error.createLimit"
    : getAutomationActionErrorToastId("create");
}

export function resolveAutomationDetailTarget(
  automations: readonly ZCodeAutomation[],
  automationId?: string | null,
): ZCodeAutomation | null {
  const targetId = automationId?.trim();
  if (!targetId) return null;
  return automations.find((automation) => automation.automationId === targetId) ?? null;
}

export function resolveAutomationDetailNavigation(
  automations: readonly ZCodeAutomation[],
  automationId: string | null | undefined,
  listReady: boolean,
): { status: "pending" } | { status: "missing" } | { status: "found"; target: ZCodeAutomation } {
  if (!automationId?.trim() || !listReady) return { status: "pending" };
  const target = resolveAutomationDetailTarget(automations, automationId);
  return target ? { status: "found", target } : { status: "missing" };
}

interface AutomationActionsMenuProps {
  automation: ZCodeAutomation;
  busy: boolean;
  canRestart: boolean;
  canToggle: boolean;
  onRunNow: (automation: ZCodeAutomation) => void;
  onEdit: (automation: ZCodeAutomation) => void;
  onToggle: (automation: ZCodeAutomation, enabled: boolean) => void;
  onRestart: (automation: ZCodeAutomation) => void;
  onDelete: (automation: ZCodeAutomation) => void;
}

function AutomationActionsMenu({
  automation,
  busy,
  canRestart,
  canToggle,
  onRunNow,
  onEdit,
  onToggle,
  onRestart,
  onDelete,
}: AutomationActionsMenuProps) {
  const { intl } = useZCodeIntl();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // 根因：桌面端只在 hover 恢复透明度，键盘已聚焦时按钮仍不可见。
          className="flex size-6 items-center justify-center rounded-md opacity-100 transition-colors hover:bg-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 data-[state=open]:bg-hover data-[state=open]:opacity-100"
          data-testid={TID_AUTOMATION_CARD_MENU}
          aria-label={intl.formatMessage({ id: "automations.moreActions" })}
          disabled={busy}
          // 卡片可点进编辑;菜单点击不冒泡到卡片。
          onClick={(event) => event.stopPropagation()}
        >
          <AutomationMoreHorizontalIcon
            className="size-4 text-foreground-subtle"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="w-[190px]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 立即运行：当前 RPC 期间用 busy 防重，返回后恢复入口；活动 run 由 host single-flight 判重。 */}
        <DropdownMenuItem
          className="gap-1"
          disabled={busy}
          onSelect={() => void onRunNow(automation)}
        >
          <span className="flex size-5 items-center justify-center">
            <AutomationRunNowIcon className="size-4" aria-hidden="true" />
          </span>
          {intl.formatMessage({ id: "automations.runNow" })}
        </DropdownMenuItem>
        {canRestart ? (
          <DropdownMenuItem
            className="gap-1"
            disabled={busy}
            onSelect={() => void onRestart(automation)}
          >
            <span className="flex size-5 items-center justify-center">
              <RotateCcw className="size-4" strokeWidth={1.33} aria-hidden="true" />
            </span>
            {intl.formatMessage({ id: "automations.restart" })}
          </DropdownMenuItem>
        ) : null}
        {/* 终态任务不展示 pause/resume：failed 可 Restart，completed 彻底收口只保留查看/删除。 */}
        {canToggle ? (
          <DropdownMenuItem
            data-testid={TID_AUTOMATION_ACTION_TOGGLE}
            className="gap-1"
            disabled={busy}
            onSelect={() => void onToggle(automation, !automation.enabled)}
          >
            {automation.enabled ? (
              <span className="flex size-5 items-center justify-center">
                <AutomationPauseActionIcon className="size-4" aria-hidden="true" />
              </span>
            ) : (
              <span className="flex size-5 items-center justify-center">
                <AutomationContinueIcon className="size-4" aria-hidden="true" />
              </span>
            )}
            {intl.formatMessage({
              id: automation.enabled ? "automations.pause" : "automations.resume",
            })}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="gap-1"
          disabled={busy}
          onSelect={() => void onEdit(automation)}
        >
          <span className="flex size-5 items-center justify-center">
            <AutomationEditActionIcon className="size-4" aria-hidden="true" />
          </span>
          {intl.formatMessage({ id: "automations.form.editTitle" })}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid={TID_AUTOMATION_ACTION_DELETE}
          className="gap-1 !text-destructive data-[highlighted]:!bg-menu-hover data-[highlighted]:!text-destructive focus:!text-destructive [&_svg]:!text-destructive"
          disabled={busy}
          onSelect={() => void onDelete(automation)}
        >
          <AutomationTrashIcon />
          {intl.formatMessage({ id: "automations.delete" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 状态筛选命中 0 条时的占位；复用闲时空态卡的描边样式，文案与「还没有任务」区分开。 */
function AutomationStatusFilterEmpty() {
  const { intl } = useZCodeIntl();
  return (
    <div className="rounded-[10px] border border-card-border px-3 py-3 text-ui-base text-foreground-subtle">
      {intl.formatMessage({ id: "automations.statusFilter.empty" })}
    </div>
  );
}

export function AutomationsSection({
  workspacePath,
  workspaceIdentity,
  onCreateViaChat,
  openAutomationId,
  openAutomationTab,
  onOpenAutomationConsumed,
  onOpenSession,
  nativeWorkflowContent,
  runNowNotice,
  projectOptions,
}: AutomationsSectionProps) {
  const { intl, locale } = useZCodeIntl();
  const platform = usePlatform();
  const { clientScenesService, zcodeAgentService } = useServices();
  const confirmDialog = useConfirmDialog();
  const providerSettingsRead = useProviderSettingsView();
  const providerSettingsView =
    providerSettingsRead.state.status === "ready" ? providerSettingsRead.state.view : null;

  const automations = useAutomationManagementStore((state) => state.automations);
  const automationCreateLimitReached = automations.length >= AUTOMATION_CREATE_LIMIT;
  const loading = useAutomationManagementStore((state) => state.loading);
  const operationId = useAutomationManagementStore((state) => state.operationId);
  const runsCache = useAutomationManagementStore((state) => state.runsCache);
  const initialize = useAutomationManagementStore((state) => state.initialize);
  const createAutomation = useAutomationManagementStore((state) => state.createAutomation);
  const updateAutomation = useAutomationManagementStore((state) => state.updateAutomation);
  const deleteAutomation = useAutomationManagementStore((state) => state.deleteAutomation);
  const setEnabled = useAutomationManagementStore((state) => state.setEnabled);
  const restartAutomation = useAutomationManagementStore((state) => state.restartAutomation);
  const runAutomationNow = useAutomationManagementStore((state) => state.runAutomationNow);
  const loadRuns = useAutomationManagementStore((state) => state.loadRuns);
  const deleteRun = useAutomationManagementStore((state) => state.deleteRun);
  const refresh = useAutomationManagementStore((state) => state.refresh);

  const automationTemplates = useAutomationTemplates(clientScenesService);

  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<AutomationsView>({ mode: "list" });
  const [statusFilter, setStatusFilter] = useState<AutomationStatusFilter>(
    DEFAULT_AUTOMATION_STATUS_FILTER,
  );
  const dynamicWorkflowEnabled = nativeWorkflowContent !== undefined;
  // 顶级标签「自动化 / 工作流」：页标题即切换。中枢已是跨项目视图，记忆不再按项目分桶，用 app 级单 key。
  const [storedPageTab, setPageTabState] = useState<AutomationsPageTab>(() =>
    readAutomationsPageTab(),
  );
  const pageTab: AutomationsPageTab = dynamicWorkflowEnabled ? storedPageTab : "automation";
  const setPageTab = useCallback((next: AutomationsPageTab) => {
    setPageTabState(next);
    writeAutomationsPageTab(next);
  }, []);
  const hasAnyTasks = automations.length > 0;
  const visibleAutomations = automations.filter(
    (automation) =>
      statusFilter === DEFAULT_AUTOMATION_STATUS_FILTER ||
      resolveScheduledAutomationStatus(automation, runsCache[automation.automationId]?.runs) ===
        statusFilter,
  );
  // 修复原因：执行中必须读取既有历史 owner 的在途记录，不能从 enabled 推断。
  useEffect(() => {
    for (const automation of automations) void loadRuns(automation.automationId, zcodeAgentService);
  }, [automations, loadRuns, zcodeAgentService]);
  const showTaskTemplateSeparator = hasAnyTasks;
  const [loadedWorkspaceKey, setLoadedWorkspaceKey] = useState<string | null>(null);
  // 相对时间基准;刷新列表时更新,避免频繁 setInterval。
  const [now, setNow] = useState(() => Date.now());

  // 列表按当前项目加载(主视图由 WorkspaceShellLayout 传入当前 workspace)。
  useEffect(() => {
    if (!workspacePath) return;
    const workspaceKey = resolveWorkspaceKey({
      workspacePath,
      workspaceIdentity,
    });
    let disposed = false;
    setLoadedWorkspaceKey(null);
    setNow(Date.now());
    void initialize({
      workspacePath,
      workspaceIdentity,
      agentService: zcodeAgentService,
    }).then(() => {
      if (!disposed) setLoadedWorkspaceKey(workspaceKey);
    });
    return () => {
      disposed = true;
    };
  }, [workspacePath, workspaceIdentity, zcodeAgentService, initialize]);

  useEffect(() => {
    if (!openAutomationTab) return;
    // 灰度关：请求的「工作流」标签不存在，
    // 落到「自动化」并把深链消费掉——不消费会让请求一直挂着，反复把页面拉回来。
    if (openAutomationTab === "workflow" && !dynamicWorkflowEnabled) {
      setPageTab("automation");
      onOpenAutomationConsumed?.();
      return;
    }
    if (openAutomationTab === "workflow") {
      setPageTab("workflow");
      onOpenAutomationConsumed?.();
      return;
    }
    const currentWorkspaceKey = workspacePath
      ? resolveWorkspaceKey({ workspacePath, workspaceIdentity })
      : null;
    if (currentWorkspaceKey === null || loadedWorkspaceKey !== currentWorkspaceKey) return;
    setPageTab("automation");
    onOpenAutomationConsumed?.();
  }, [
    dynamicWorkflowEnabled,
    loadedWorkspaceKey,
    onOpenAutomationConsumed,
    openAutomationTab,
    setPageTab,
    workspaceIdentity,
    workspacePath,
  ]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh(zcodeAgentService);
      setNow(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, [refresh, zcodeAgentService]);

  const showAutomationCreateLimitToast = useCallback(() => {
    toast(
      intl.formatMessage(
        { id: "automations.error.createLimit" },
        { limit: String(AUTOMATION_CREATE_LIMIT) },
      ),
    );
  }, [intl]);

  useEffect(() => {
    const currentWorkspaceKey = workspacePath
      ? resolveWorkspaceKey({ workspacePath, workspaceIdentity })
      : null;
    const result = resolveAutomationDetailNavigation(
      automations,
      openAutomationId,
      currentWorkspaceKey !== null && loadedWorkspaceKey === currentWorkspaceKey,
    );
    if (result.status === "pending") return;
    if (result.status === "found") {
      setView({ mode: "edit", automation: result.target });
    } else {
      // 目标任务可能已删除；失效的一次性导航必须提示并消费，不能影响后续进入页面。
      toast(intl.formatMessage({ id: "automations.error.targetNotFound" }));
    }
    onOpenAutomationConsumed?.();
  }, [
    automations,
    intl,
    loadedWorkspaceKey,
    onOpenAutomationConsumed,
    openAutomationId,
    workspaceIdentity,
    workspacePath,
  ]);

  const handleCreateManually = useCallback(() => {
    if (automationCreateLimitReached) {
      showAutomationCreateLimitToast();
      return;
    }
    setView({ mode: "create", draft: null });
  }, [automationCreateLimitReached, showAutomationCreateLimitToast]);

  // 「Create via chat」:交给 parent 切到会话视图;未提供则回退到手动创建整页。
  const handleCreateViaChat = useCallback(() => {
    if (automationCreateLimitReached) {
      showAutomationCreateLimitToast();
      return;
    }
    if (onCreateViaChat) {
      onCreateViaChat(intl.formatMessage({ id: "automations.createViaChat.prompt" }));
    } else setView({ mode: "create", draft: null });
  }, [automationCreateLimitReached, intl, onCreateViaChat, showAutomationCreateLimitToast]);

  const handleUseTemplate = useCallback(
    (template: ScheduledAutomationTemplate) => {
      if (automationCreateLimitReached) {
        showAutomationCreateLimitToast();
        return;
      }
      const draft = materializeScheduledTemplateDraft(template, locale);
      setView({
        mode: "create",
        draft,
      });
    },
    [automationCreateLimitReached, locale, showAutomationCreateLimitToast],
  );

  // 创建/编辑整页提交:创建可指定目标项目;编辑锁定原项目。
  const handleEditSubmit = useCallback(
    async ({
      input,
      workspacePath: targetPath,
      workspaceIdentity: targetIdentity,
    }: AutomationEditSubmit) => {
      if (view.mode === "edit") {
        const automationId = view.automation.automationId;
        const ok = await updateAutomation(automationId, input, zcodeAgentService);
        const state = useAutomationManagementStore.getState();
        const saved = state.automations.find((item) => item.automationId === automationId);
        if (!ok || state.error || !saved) {
          toast(
            intl.formatMessage({
              id: getAutomationActionErrorToastId("update"),
            }),
          );
          return false;
        } else {
          // 保存后仍可能留在编辑页；只接纳显式保存的 store 快照，后台刷新不回填草稿。
          setView((current) =>
            current.mode === "edit" && current.automation.automationId === automationId
              ? {
                  ...current,
                  automation: saved,
                  savedRevision: (current.savedRevision ?? 0) + 1,
                }
              : current,
          );
          setNow(Date.now());
        }
        return ok;
      }
      if (automationCreateLimitReached) {
        showAutomationCreateLimitToast();
        return false;
      }
      const created = await createAutomation(
        {
          ...(input as Parameters<typeof createAutomation>[0]),
          workspacePath: targetPath,
          workspaceIdentity: targetIdentity,
        },
        zcodeAgentService,
      );
      void reportAutomationCreateResult(platform, {
        automationId: created?.automationId,
        cronExpr: input.cronExpr ?? "",
        templateId: view.mode === "create" ? view.draft?.templateId : undefined,
        error: useAutomationManagementStore.getState().error,
        modelFields: resolveAutomationSelectionTelemetry(
          input.modelSelection,
          providerSettingsView,
        ),
      });
      if (!created) {
        const createError = useAutomationManagementStore.getState().error;
        toast(
          intl.formatMessage(
            { id: getAutomationCreateErrorToastId(createError) },
            { limit: String(AUTOMATION_CREATE_LIMIT) },
          ),
        );
        return false;
      }
      setNow(Date.now());
      return true;
    },
    [
      automationCreateLimitReached,
      createAutomation,
      intl,
      platform,
      providerSettingsView,
      showAutomationCreateLimitToast,
      updateAutomation,
      view,
      zcodeAgentService,
    ],
  );

  const handleToggle = useCallback(
    async (automation: ZCodeAutomation, enabled: boolean) => {
      await setEnabled(automation.automationId, enabled, zcodeAgentService);
      const message = useAutomationManagementStore.getState().error;
      if (message) toast(intl.formatMessage({ id: getAutomationActionErrorToastId("toggle") }));
      else {
        // 启停沿用 store 已保存对象，不复制进入编辑页时的旧正文，也不重置草稿基线。
        const saved = useAutomationManagementStore
          .getState()
          .automations.find((item) => item.automationId === automation.automationId);
        if (saved) {
          setView((current) =>
            current.mode === "edit" && current.automation.automationId === automation.automationId
              ? { ...current, automation: saved }
              : current,
          );
        }
        setNow(Date.now());
      }
    },
    [intl, setEnabled, zcodeAgentService],
  );

  const handleRestart = useCallback(
    async (automation: ZCodeAutomation) => {
      await restartAutomation(automation.automationId, zcodeAgentService);
      const message = useAutomationManagementStore.getState().error;
      if (message)
        toast(
          intl.formatMessage({
            id: getAutomationActionErrorToastId("restart"),
          }),
        );
      else setNow(Date.now());
    },
    [intl, restartAutomation, zcodeAgentService],
  );

  const handleRunNow = useCallback(
    async (automation: ZCodeAutomation, source: "list" | "editor" = "list") => {
      logger.debug("[automations] 立即运行交互开始", {
        automationId: automation.automationId,
        source,
      });
      void reportAutomationActionClick(platform, {
        action: "run_now",
        source,
        automation,
        providerSettingsView,
      });
      const result = await runAutomationNow(automation.automationId, zcodeAgentService);
      logger.debug("[automations] 立即运行交互结束", {
        automationId: automation.automationId,
        source,
        result,
      });
      if (result === "queued") {
        await loadRuns(automation.automationId, zcodeAgentService, true);
        const latestSessionId = useAutomationManagementStore
          .getState()
          .runsCache[automation.automationId]?.runs?.find(
            (run) => run.trigger === "manual" && Boolean(run.sessionId),
          )?.sessionId;
        toast(
          runNowNotice ??
            intl.formatMessage(
              { id: "scheduledPreview.toast.running" },
              { title: automation.title },
            ),
          {
            durationMs: 4000,
            position: "top-center",
            variant: "info",
            ...(!runNowNotice && latestSessionId && onOpenSession
              ? {
                  actionLabel: intl.formatMessage({
                    id: "scheduledPreview.toast.view",
                  }),
                  onAction: () =>
                    onOpenSession({
                      sessionId: latestSessionId,
                      workspacePath: automation.workspacePath,
                      workspaceIdentity: automation.workspaceIdentity,
                    }),
                }
              : {}),
            dismissible: true,
            dismissLabel: intl.formatMessage({ id: "common.close" }),
          },
        );
        setNow(Date.now());
      } else if (result === "duplicate") {
        // 连续点击或上一条 manual run 仍在执行时，store/host 会返回 duplicate。
        // 这里必须给出可见反馈，否则用户会以为按钮没响应。
        toast(intl.formatMessage({ id: getAutomationRunNowToastId(result) }));
      } else if (result === "failed") {
        toast(intl.formatMessage({ id: getAutomationRunNowToastId(result) }));
      }
    },
    [
      runNowNotice,
      intl,
      loadRuns,
      onOpenSession,
      platform,
      providerSettingsView,
      runAutomationNow,
      zcodeAgentService,
    ],
  );

  const handleDelete = useCallback(
    async (automation: ZCodeAutomation, source: "list" | "editor" = "list") => {
      const confirmed = await confirmDialog({
        presentation: "automation-confirmation",
        title: intl.formatMessage({ id: "automations.delete.title" }),
        description: intl.formatMessage(
          { id: "automations.delete.description" },
          { title: automation.title },
        ),
        confirmLabel: intl.formatMessage({ id: "common.delete" }),
        confirmVariant: "destructive",
        // 共享确认弹窗默认在按钮右侧渲染 esc / ⏎，在删除场景会被视为额外图标。
        // 定时任务删除按钮只保留动作文字，且不改变其他确认弹窗的键盘提示策略。
        showKeyboardHints: false,
      });
      if (!confirmed) return;
      void reportAutomationActionClick(platform, {
        action: "delete",
        source,
        automation,
        providerSettingsView,
      });
      await deleteAutomation(automation.automationId, zcodeAgentService);
      const message = useAutomationManagementStore.getState().error;
      // 删除失败时必须保留编辑页及草稿，不能仅吐司后无条件回列表。
      if (message) {
        toast(intl.formatMessage({ id: getAutomationActionErrorToastId("delete") }));
        return;
      }
      // 若在编辑该任务的整页,删除成功后回列表。
      setView((prev) =>
        prev.mode === "edit" && prev.automation.automationId === automation.automationId
          ? { mode: "list" }
          : prev,
      );
    },
    [confirmDialog, deleteAutomation, intl, platform, providerSettingsView, zcodeAgentService],
  );

  if (!workspacePath) {
    return (
      <div className="rounded-lg border border-card-border bg-card px-3 py-2 text-ui-base text-foreground-subtle">
        {intl.formatMessage({ id: "automations.noWorkspace" })}
      </div>
    );
  }

  // 创建/编辑整页(带 Settings/History tab)。
  if (view.mode !== "list") {
    return (
      <>
        <AutomationEditView
          scheduledOnly
          editing={view.mode === "edit" ? view.automation : null}
          savedRevision={view.mode === "edit" ? (view.savedRevision ?? 0) : 0}
          initialDraft={view.mode === "create" ? view.draft : null}
          defaultWorkspacePath={workspacePath}
          defaultWorkspaceIdentity={workspaceIdentity}
          projectOptions={projectOptions}
          saving={
            operationId?.startsWith("automation:create") ||
            operationId?.startsWith("automation:update") ||
            false
          }
          onBack={() => setView({ mode: "list" })}
          onSubmit={handleEditSubmit}
          onRunNow={(automation) => handleRunNow(automation, "editor")}
          onToggle={handleToggle}
          onDelete={(automation) => handleDelete(automation, "editor")}
          runsEntry={view.mode === "edit" ? runsCache[view.automation.automationId] : undefined}
          onLoadRuns={() => {
            if (view.mode === "edit")
              void loadRuns(view.automation.automationId, zcodeAgentService, true);
          }}
          onDeleteRun={(runId) => {
            if (view.mode === "edit") {
              void deleteRun(view.automation.automationId, runId, zcodeAgentService);
            }
          }}
          onOpenSession={
            view.mode === "edit" && onOpenSession
              ? (sessionId) => {
                  // 运行历史的跳转入口之前没有从父层接入导航回调，导致即使 run.sessionId
                  // 已经写入 automation_runs，菜单里也会把“跳到会话”隐藏掉。
                  onOpenSession({
                    sessionId,
                    workspacePath: view.automation.workspacePath,
                    workspaceIdentity: view.automation.workspaceIdentity,
                  });
                }
              : undefined
          }
        />
      </>
    );
  }

  // 页标题即顶级切换：「自动化 / 工作流」两个标题词
  // 并排，30/34 沿用 h1 的页面标题层级；副标题随标签换。
  const pageHeader = (
    <div className="flex flex-col gap-3">
      <AutomationsPageTitle
        workflowTabEnabled={dynamicWorkflowEnabled}
        value={pageTab}
        onValueChange={setPageTab}
      />
      <p className="text-ui-base leading-5 text-foreground-subtlest">
        {intl.formatMessage({
          id:
            pageTab === "workflow"
              ? "workflows.hub.description"
              : hasAnyTasks
                ? "automations.description.populated"
                : "automations.description",
        })}
      </p>
    </div>
  );

  const contentClassName = cn(SETTINGS_FRAME_CONTENT_CLASSNAME, "lg:px-6");

  if (pageTab === "workflow") {
    return (
      <div className={contentClassName}>
        {pageHeader}
        {nativeWorkflowContent}
      </div>
    );
  }

  return (
    <div data-automations-content className={cn(contentClassName, "flex flex-col")}>
      {pageHeader}

      {hasAnyTasks ? (
        <div className="mt-8 flex items-center justify-end">
          <div className="flex items-center gap-3">
            <ControlHintTooltip
              title={intl.formatMessage({
                id: refreshing ? "automations.refreshing" : "automations.refresh",
              })}
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={intl.formatMessage({ id: "automations.refresh" })}
                onClick={() => void handleRefresh()}
                disabled={refreshing}
              >
                <AutomationRefreshIcon
                  className={cn("size-3.5", refreshing && "animate-spin")}
                  aria-hidden="true"
                />
              </Button>
            </ControlHintTooltip>
            <AutomationCreateDropdown
              onViaChat={handleCreateViaChat}
              onManually={handleCreateManually}
            />
          </div>
        </div>
      ) : null}

      {hasAnyTasks ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-1.5"
          data-testid={TID_AUTOMATIONS_STATUS_FILTER}
        >
          {SCHEDULED_AUTOMATION_STATUS_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={statusFilter === key}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-ui-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused",
                statusFilter === key
                  ? "bg-selected text-foreground"
                  : "text-foreground-subtle hover:bg-hover hover:text-foreground",
              )}
              onClick={() => setStatusFilter(key)}
            >
              {SCHEDULED_AUTOMATION_STATUS_LABELS[key]}
            </button>
          ))}
        </div>
      ) : null}

      {loading && automations.length === 0 ? (
        <div className="mt-8 flex h-40 items-center justify-center">
          <Spinner className="size-5" />
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-8",
            // 列表态提示栏与 action row 旧间距为 16px，小于设计稿要求的 20px。
            hasAnyTasks ? "mt-5" : "mt-8",
          )}
        >
          <div className="flex w-full flex-col gap-4">
            <div data-automations-task-grid className="contents">
              {automations.length > 0 ? (
                <section className="flex w-full flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-ui-base font-medium leading-5 text-foreground-subtle">
                      {intl.formatMessage({ id: "automations.createdLabel" })}
                    </h2>
                  </div>
                  {visibleAutomations.length === 0 ? (
                    <AutomationStatusFilterEmpty />
                  ) : (
                    <div
                      data-testid={TID_AUTOMATIONS_LIST}
                      className={cn(
                        "grid grid-cols-1 auto-rows-[132px] gap-x-4 gap-y-4 lg:grid-cols-2",
                        // 设计规范最多露出 8 张卡片；grid 自身负责滚动。阈值按筛选后的数量算，
                        // 否则筛出少量卡片时仍锁高度会留下大块空白。
                        visibleAutomations.length > 8 &&
                          "max-h-[1198px] overflow-y-auto overscroll-contain lg:max-h-[606px]",
                      )}
                    >
                      {visibleAutomations.map((automation) => {
                        const status = resolveAutomationStatusKind(automation);
                        const hasFailure = hasAutomationFailureState(automation);
                        const statusMeta = STATUS_META[status];
                        const StatusIcon = statusMeta.icon;
                        const scheduleText = describeAutomationCardSchedule(automation, intl);
                        const formattedNextRun = formatAutomationCardNextRun(
                          automation.nextRunAt,
                          now,
                          intl,
                        );
                        // completed/paused/失败态的调度不再推进，但有限次任务跑完后
                        // nextRunAt 仍可能指向未来时刻，曾被拼进卡片误显“下次运行”。只有活跃
                        // 且未失败的卡片才追加下次运行时间，其余一律只展示频率摘要。
                        const scheduleCardText =
                          status === "active" && !hasFailure && formattedNextRun
                            ? `${scheduleText} · ${intl.formatMessage(
                                { id: "automations.nextRun" },
                                { when: formattedNextRun },
                              )}`
                            : scheduleText;
                        // Card 展示的是定时 + 手动派发的累计次数；maxRuns 只约束定时计划，
                        // 若作为分母会让用户误以为“立即运行”也消耗有限任务额度。
                        const runCountText = intl.formatMessage(
                          { id: "automations.runCount" },
                          { count: String(automation.runCount) },
                        );
                        const busy = operationId?.endsWith(`:${automation.automationId}`) ?? false;
                        // completed 表示有限次任务已经自然结束，不能再通过 Restart 复活；
                        // failed 才是可恢复终态，允许用户手动重排下一次运行。
                        const canRestart = canRestartAutomation(automation);
                        const canToggle = canToggleAutomation(automation);
                        return (
                          <div
                            key={automation.automationId}
                            data-testid={TID_AUTOMATION_CARD}
                            role="button"
                            tabIndex={0}
                            onClick={() => setView({ mode: "edit", automation })}
                            onKeyDown={(event) => {
                              // 根因：内部菜单按钮的 Enter／Space 会冒泡，不能当作卡片自身的导航。
                              if (event.target !== event.currentTarget) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setView({ mode: "edit", automation });
                              }
                            }}
                            className={cn(
                              // 任务卡与模板卡曾分别使用 surface/border，跨主题下描边深浅不一致。
                              "group relative flex h-full min-h-0 cursor-pointer gap-3 overflow-hidden rounded-xl border border-card-border bg-background p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused",
                              // 已完成任务保持静态弱化，不在 hover 时恢复透明度或改变背景。
                              status === "completed" ? "opacity-60" : "hover:bg-hover",
                            )}
                          >
                            <div className="flex h-full min-w-0 flex-1 flex-col gap-3">
                              <span className="block truncate pr-12 text-ui-base font-medium leading-5 text-foreground">
                                {automation.title}
                              </span>
                              <p className="text-wrap-phrase line-clamp-2 h-10 text-ui-base font-normal leading-5 text-foreground-subtle">
                                {automationPromptSummary(automation.prompt)}
                              </p>
                              <div className="mt-auto flex h-6 min-w-0 items-center gap-2 text-ui-base leading-5">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  {hasFailure ? (
                                    <>
                                      <span className="inline-flex shrink-0 items-center py-0.5 pl-1 pr-2 font-normal text-destructive">
                                        <span className="flex size-5 shrink-0 items-center justify-center">
                                          <TriangleAlert
                                            className="size-4"
                                            strokeWidth={1.33}
                                            aria-hidden="true"
                                          />
                                        </span>
                                        <span className="pl-1">
                                          {intl.formatMessage({
                                            id: "automations.lifecycle.failed",
                                          })}
                                        </span>
                                      </span>
                                      {/* 失败态也只展示 cron 摘要，禁止把已过期 nextRunAt 误写成“下次运行”。 */}
                                      <AutomationScheduleBadge
                                        tone="muted"
                                        text={scheduleCardText}
                                        icon={
                                          <AutomationClockIcon
                                            className="size-4"
                                            aria-hidden="true"
                                          />
                                        }
                                      />
                                    </>
                                  ) : status === "active" ? (
                                    <>
                                      <span className="text-ui-sm text-success">
                                        {
                                          SCHEDULED_AUTOMATION_STATUS_LABELS[
                                            resolveScheduledAutomationStatus(
                                              automation,
                                              runsCache[automation.automationId]?.runs,
                                            )
                                          ]
                                        }
                                      </span>
                                      <AutomationScheduleBadge
                                        text={scheduleCardText}
                                        icon={
                                          <StatusIcon
                                            className="size-4 shrink-0"
                                            strokeWidth={1.33}
                                            aria-hidden="true"
                                          />
                                        }
                                      />
                                    </>
                                  ) : (
                                    <>
                                      <span
                                        className={cn(
                                          "inline-flex shrink-0 items-center gap-1 font-normal",
                                          statusMeta.className,
                                        )}
                                      >
                                        <span className="flex size-5 shrink-0 items-center justify-center">
                                          <StatusIcon
                                            className="size-4 shrink-0"
                                            strokeWidth={1.33}
                                            aria-hidden="true"
                                          />
                                        </span>
                                        {intl.formatMessage({
                                          id: `automations.lifecycle.${status}`,
                                        })}
                                      </span>
                                      {status === "paused" || status === "completed" ? (
                                        /* 暂停/完成后调度不再推进，只展示 cron 摘要，不展示 nextRunAt。 */
                                        <AutomationScheduleBadge
                                          tone={status === "completed" ? "completed" : "muted"}
                                          text={scheduleCardText}
                                          icon={
                                            <AutomationClockIcon
                                              className="size-4"
                                              aria-hidden="true"
                                            />
                                          }
                                        />
                                      ) : null}
                                    </>
                                  )}
                                </div>
                                {/* 根因：次数已经使用 semantic 次要前景，额外压到 40% 会让失败／暂停任务不可读。 */}
                                <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md bg-surface px-1.5 py-0.5 text-ui-base font-normal text-foreground-subtle">
                                  {runCountText}
                                </span>
                              </div>
                            </div>

                            <div className="absolute right-3 top-3 flex items-center gap-1">
                              {busy ? <Spinner className="size-3.5" /> : null}
                              <AutomationActionsMenu
                                automation={automation}
                                busy={busy}
                                canRestart={canRestart}
                                canToggle={canToggle}
                                onRunNow={handleRunNow}
                                onEdit={(target) => setView({ mode: "edit", automation: target })}
                                onToggle={handleToggle}
                                onRestart={handleRestart}
                                onDelete={handleDelete}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : (
                /* 空状态按钮组整体较卡片中心下移 8px。 */
                <div
                  data-automations-empty-state
                  className="flex h-[226px] w-full items-center justify-center rounded-2xl border border-card-border bg-background px-4"
                >
                  <div className="flex translate-y-2 flex-col items-center gap-5">
                    <p className="text-ui-base font-medium leading-5 text-foreground-subtlest">
                      {intl.formatMessage({ id: "automations.empty.title" })}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <AutomationCreateDropdown
                        onViaChat={handleCreateViaChat}
                        onManually={handleCreateManually}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 修复原因：真实任务卡与模板此前只靠空白分区，遗漏了 Figma 4835:5515 的分割线；
             分割线使用 surface 在 Light 下过淡，因此与 Card 统一使用 card-border。
             外层 gap-8 加本容器 py-2，使卡片到线、线到模板标题均保持 40px。 */}
          {showTaskTemplateSeparator ? (
            <div
              data-automations-task-template-separator
              className="flex w-full flex-col py-2"
              aria-hidden="true"
            >
              <div className="h-px w-full bg-card-border" />
            </div>
          ) : null}

          {/* Scheduled task template：点击只预填新建整页。 */}
          <section
            data-automations-scheduled-templates
            aria-busy={automationTemplates.loading}
            className="flex w-full flex-col gap-4"
          >
            <h2 className="text-ui-base font-medium leading-5 text-foreground-subtle">
              {intl.formatMessage({ id: "automations.moreIdeas" })}
            </h2>
            {automationTemplates.loading ? (
              <AutomationTemplateSkeletonGrid
                label={intl.formatMessage({ id: "common.loading" })}
              />
            ) : automationTemplates.scheduled.length === 0 ? (
              <div
                data-automation-template-empty-state
                className="flex min-h-[114px] w-full items-center justify-center rounded-xl border border-card-border bg-background p-3 text-center text-ui-base font-normal text-foreground-subtlest"
              >
                {intl.formatMessage({ id: "automations.templates.unavailable" })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {automationTemplates.scheduled.map((template) => {
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleUseTemplate(template)}
                      className="group flex min-h-[114px] flex-col gap-2 overflow-hidden rounded-xl border border-card-border bg-background p-3 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
                    >
                      <div className="flex min-w-0 items-center gap-1 text-foreground">
                        <span className="flex size-5 shrink-0 items-center justify-center">
                          <AutomationScheduledTemplateIcon
                            iconName={template.iconName}
                            name={template.icon}
                          />
                        </span>
                        <span className="truncate text-ui-base font-medium leading-5 text-foreground">
                          {resolveAutomationTemplateText(template.title, locale)}
                        </span>
                      </div>
                      {/* Bug 原因：定时模板首次实现时把周期时间拼进标题行，和闲时模板的底部时间层级不一致。 */}
                      <p className="line-clamp-2 flex-1 text-ui-base font-normal leading-5 text-foreground-subtle">
                        {resolveAutomationTemplateText(template.description, locale)}
                      </p>
                      <div className="text-ui-base font-normal leading-5 text-foreground-subtle">
                        {describeAutomationCardSchedule({ cronExpr: template.cronExpr }, intl)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
