import { formatUserFacingError } from "@/lib/errorMessage.js";
import { createUuid } from "@zcode/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { FolderGit2, GitBranch, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { Badge } from "@/components/ui/badge.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { SettingsGroupCard } from "@/settings/SettingsPageParts.js";
import type { AIReqProject, AIReqSettingsDraftActions, AIReqWorkflowView } from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { getEmployeeId } from "../identity.js";
import { useAIReq } from "../AIReqContext.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { AIReqSettingsTarget } from "./AIReqSettingsTarget.js";
import { AIReqProjectField } from "./AIReqProjectField.js";
import { AIReqReleaseDialog } from "./AIReqReleaseDialog.js";
import { validateRepository, type ProjectFieldErrors } from "./projectValidation.js";

export type AIReqProjectSettingsRequest =
  | { kind: "create" }
  | { kind: "project"; projectId: string };

export function AIReqProjectSettings({
  guard,
  onDraftActionsChange,
  active,
  request,
  onRequestHandled,
}: {
  guard: (navigate: () => void) => void;
  onDraftActionsChange: (actions: AIReqSettingsDraftActions | null) => void;
  active: boolean;
  request: AIReqProjectSettingsRequest | null;
  onRequestHandled(request: AIReqProjectSettingsRequest): void;
}) {
  const source = useAIReqDataSource();
  const aireq = useAIReq();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const employeeId = getEmployeeId();
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>();
  const [projectRevision, setProjectRevision] = useState(0);
  const initialProject = useRef({
    name: "",
    repositoryUrl: "",
    defaultBranch: "",
    workDirectory: "",
  });
  const initialReleaseProject = useRef("");
  const savingRef = useRef(false);
  const currentActions = useRef<AIReqSettingsDraftActions | null>(null);
  const repositoryOperation = useRef<{ payload: string; operationId: string } | null>(null);
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [workDirectory, setWorkDirectory] = useState("");
  const [projectError, setProjectError] = useState("");
  const [projectErrors, setProjectErrors] = useState<ProjectFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseProjectId, setReleaseProjectId] = useState("");
  const [releaseTitle, setReleaseTitle] = useState("");
  const [releaseError, setReleaseError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [targetError, setTargetError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [projectQuery, setProjectQuery] = useState("");
  const [releaseSaving, setReleaseSaving] = useState(false);
  const addProjectButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const projectForm = useRef<HTMLFormElement>(null);
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);
  const [projectViews, setProjectViews] = useState<
    {
      project: AIReqProject;
      releases: AIReqWorkflowView["releases"];
      groups: AIReqWorkflowView["requirements"];
    }[]
  >([]);
  const projectElements = useRef(new Map<string, HTMLElement>());
  const loadedSnapshot = useRef<{
    source: typeof source;
    view: AIReqWorkflowView;
    refreshKey: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const view = aireq?.view;
    setLoading(true);
    setLoadError("");
    if (!view) {
      setProjectViews([]);
      return;
    }
    Promise.all(
      view.projects.map(async (project) => {
        // Release 目录是全局的；只读取该项目的正式需求，用于现有 SR 统计。
        const { releases, requirements } = await source.readWorkflow({ projectId: project.id });
        return {
          project,
          releases: releases.filter((release) => release.projectId === project.id),
          groups: requirements.filter((group) => group.projectId === project.id),
        };
      }),
    )
      .then((views) => {
        if (active) {
          loadedSnapshot.current = { source, view, refreshKey };
          setProjectViews(views);
        }
      })
      .catch((cause) => {
        if (active) setLoadError(formatUserFacingError(cause, "读取项目配置失败，请重试。"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [source, aireq?.view, refreshKey]);
  const projects = aireq?.view?.projects ?? [];
  const releaseCount = projectViews.reduce((count, item) => count + item.releases.length, 0);
  const normalizedProjectQuery = projectQuery.trim().toLocaleLowerCase();
  const filteredProjectViews = normalizedProjectQuery
    ? projectViews.filter(({ project }) =>
        `${project.name} ${project.repositoryUrl ?? ""} ${project.workDirectory ?? ""}`
          .toLocaleLowerCase()
          .includes(normalizedProjectQuery),
      )
    : projectViews;
  const projectCountLabel = normalizedProjectQuery
    ? zh
      ? `显示 ${filteredProjectViews.length} / ${projects.length} 个项目`
      : `${filteredProjectViews.length} of ${projects.length} projects`
    : zh
      ? `${projects.length} 个项目`
      : `${projects.length} projects`;
  // 空投影也是首次读取的初值，只有当前快照读取成功后才能把它解释为真实的零。
  const releaseCountReady =
    !loading &&
    !loadError &&
    loadedSnapshot.current?.source === source &&
    loadedSnapshot.current.view === aireq?.view &&
    loadedSnapshot.current.refreshKey === refreshKey;
  const canSaveRepository = Boolean(source.projects?.saveRepository);
  const canCreateRelease = source.capabilities.workflowCommands.includes("createRelease");
  const dirty =
    (projectOpen &&
      (name !== initialProject.current.name ||
        repositoryUrl !== initialProject.current.repositoryUrl ||
        defaultBranch !== initialProject.current.defaultBranch ||
        workDirectory !== initialProject.current.workDirectory)) ||
    (releaseOpen && (releaseTitle !== "" || releaseProjectId !== initialReleaseProject.current));
  const busy = saving || releaseSaving;
  const clearProjectFieldError = (field: keyof ProjectFieldErrors) => {
    setProjectError("");
    setProjectErrors((previous) =>
      previous[field] ? { ...previous, [field]: undefined } : previous,
    );
  };
  const canSave =
    !busy &&
    (projectOpen
      ? canSaveRepository &&
        Boolean(name.trim() && repositoryUrl.trim() && defaultBranch.trim() && workDirectory.trim())
      : releaseOpen &&
        canCreateRelease &&
        Boolean(releaseProjectId && releaseTitle.trim()) &&
        !aireq?.pending);
  const saveProject = async () => {
    if (!canSaveRepository || savingRef.current) return false;
    // 输入校验直接产生字段级业务提示，远程异常则交给统一安全错误格式化，避免下发实现细节。
    setProjectError("");
    const validationErrors = validateRepository(name, repositoryUrl, defaultBranch, workDirectory);
    if (Object.keys(validationErrors).length) {
      setProjectErrors(validationErrors);
      const fieldId = validationErrors.name
        ? "project-name"
        : validationErrors.repository
          ? "project-repository"
          : validationErrors.branch
            ? "project-default-branch"
            : "project-work-directory";
      projectForm.current?.querySelector<HTMLInputElement>(`#${fieldId}`)?.focus();
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setProjectErrors({});
    try {
      const input = {
        projectId,
        name: name.trim(),
        repositoryUrl: repositoryUrl.trim(),
        defaultBranch: defaultBranch.trim(),
        workDirectory: workDirectory.trim(),
        expectedRevision: projectRevision,
      };
      const payload = JSON.stringify(input);
      // 同一输入重试沿用逻辑动作 ID；断线后不能意外创建第二个项目。
      if (repositoryOperation.current?.payload !== payload)
        repositoryOperation.current = { payload, operationId: createUuid() };
      await source.projects!.saveRepository!({
        ...input,
        operationId: repositoryOperation.current.operationId,
      });
      setProjectOpen(false);
      setMessage(`已保存“${name.trim()}”的项目配置。`);
      return true;
    } catch (cause) {
      setProjectError(formatUserFacingError(cause, "保存项目配置失败，请重试。"));
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const saveRelease = async () => {
    if (
      !canCreateRelease ||
      savingRef.current ||
      !releaseProjectId ||
      !releaseTitle.trim() ||
      !aireq
    )
      return false;
    savingRef.current = true;
    setReleaseSaving(true);
    setReleaseError("");
    try {
      if (
        (await source.readWorkflow({ projectId: releaseProjectId })).releases.some(
          (release) =>
            release.projectId === releaseProjectId &&
            release.title.toLowerCase() === releaseTitle.trim().toLowerCase(),
        )
      ) {
        setReleaseError("此项目中已存在同名 Release，请使用其他名称。");
        return false;
      }
      const result = await aireq.command({
        type: "createRelease",
        projectId: releaseProjectId,
        title: releaseTitle,
      });
      if (result?.receipt.status !== "completed") {
        setReleaseError("未能添加 Release，请检查名称和所属项目。");
        return false;
      }
      setReleaseOpen(false);
      setMessage(`已添加 Release“${releaseTitle.trim()}”。`);
      return true;
    } catch (cause) {
      setReleaseError(formatUserFacingError(cause, "添加 Release 失败，请重试。"));
      return false;
    } finally {
      savingRef.current = false;
      setReleaseSaving(false);
    }
  };
  // 原弹窗关闭绕过设置门禁，Esc 会静默丢稿；所有离开入口复用同一 owner 和最新保存动作。
  currentActions.current = {
    canSave,
    canDiscard: !busy,
    save: projectOpen ? saveProject : saveRelease,
    discard: () => {
      setProjectOpen(false);
      setReleaseOpen(false);
    },
  };
  useEffect(() => {
    onDraftActionsChange(
      dirty || busy
        ? {
            canSave,
            canDiscard: !busy,
            save: () => currentActions.current?.save() ?? false,
            discard: () => currentActions.current?.discard(),
          }
        : null,
    );
  }, [dirty, busy, canSave, onDraftActionsChange]);
  useEffect(() => () => onDraftActionsChange(null), [onDraftActionsChange]);
  const openProject = useCallback((project?: AIReqProject, trigger = addProjectButton.current) => {
    dialogTrigger.current = trigger;
    setProjectRevision(project?.revision ?? 0);
    repositoryOperation.current = null;
    setProjectId(project?.id);
    setName(project?.name ?? "");
    setRepositoryUrl(project?.repositoryUrl ?? "");
    setDefaultBranch(project?.defaultBranch ?? "main");
    setWorkDirectory(project?.workDirectory ?? "");
    initialProject.current = {
      name: project?.name ?? "",
      repositoryUrl: project?.repositoryUrl ?? "",
      defaultBranch: project?.defaultBranch ?? "main",
      workDirectory: project?.workDirectory ?? "",
    };
    setProjectError("");
    setProjectErrors({});
    setMessage("");
    setProjectOpen(true);
  }, []);
  useEffect(() => {
    if (!active || !request) return;
    setTargetError("");
    if (request.kind === "create") {
      if (canSaveRepository) openProject();
      else setTargetError(zh ? "当前无法添加项目。" : "Adding a project is unavailable.");
      onRequestHandled(request);
      return;
    }
    // 搜索是展示过滤，外部定位目标必须先恢复完整列表，不能把被过滤的项目误判为已删除。
    if (normalizedProjectQuery) {
      setProjectQuery("");
      return;
    }
    // 项目列表更新后必须等待同一快照的配置加载，不能用旧列表判定目标不存在。
    if (
      loading ||
      loadError ||
      loadedSnapshot.current?.source !== source ||
      loadedSnapshot.current?.view !== aireq?.view ||
      loadedSnapshot.current?.refreshKey !== refreshKey
    )
      return;
    const element = projectElements.current.get(request.projectId);
    if (element) {
      element.scrollIntoView({ block: "start" });
      element.focus({ preventScroll: true });
    } else {
      setTargetError(zh ? "目标项目不存在或已被删除。" : "The requested project is unavailable.");
    }
    onRequestHandled(request);
  }, [
    active,
    request,
    loading,
    loadError,
    projectViews,
    source,
    aireq?.view,
    refreshKey,
    canSaveRepository,
    onRequestHandled,
    openProject,
    normalizedProjectQuery,
    zh,
  ]);
  if (!aireq) return null;
  const openRelease = (id: string, trigger: HTMLButtonElement) => {
    dialogTrigger.current = trigger;
    initialReleaseProject.current = id;
    setReleaseProjectId(id);
    setReleaseTitle("");
    setReleaseError("");
    setReleaseOpen(true);
  };
  const restoreDialogFocus = (event: Event) => {
    const trigger = dialogTrigger.current;
    dialogTrigger.current = null;
    // 受控弹窗没有 Radix Trigger；等弹窗释放焦点锁后再返回实际入口。
    event.preventDefault();
    const target = trigger?.isConnected && !trigger.disabled ? trigger : searchInput.current;
    if (active && target?.isConnected && !target.closest("[hidden], [inert]")) {
      target.focus({ preventScroll: true });
    }
  };
  return (
    <section className="space-y-4" data-testid="aireq-project-settings">
      {/* 已有配置时重读只播报状态，避免周期性插入加载行挤动列表；首次读取仍可见。 */}
      {loading && !projectViews.length && projects.length > 0 && (
        <p role="status" className="text-ui-sm text-foreground-subtle">
          正在读取项目与 Release…
        </p>
      )}
      {loadError && (
        <div role="alert" className="space-y-2 text-ui-sm text-destructive">
          <p>{loadError}</p>
          <Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)}>
            重试
          </Button>
        </div>
      )}
      {targetError && (
        <p role="alert" className="text-ui-sm text-destructive">
          {targetError}
        </p>
      )}
      <AIReqSettingsTarget
        id="aireq.projects"
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div className="min-w-0 space-y-1">
          <p className="text-ui-base font-medium">
            {projectCountLabel} ·{" "}
            {releaseCountReady
              ? zh
                ? `${releaseCount} 个 Release`
                : `${releaseCount} releases`
              : loadError || (!aireq.view && !aireq.pending)
                ? zh
                  ? "Release 数量不可用"
                  : "Release count unavailable"
                : zh
                  ? "Release 数量读取中…"
                  : "Loading Release count…"}
            <span role="status" className="sr-only">
              {loading && projectViews.length > 0
                ? zh
                  ? "正在读取项目与 Release…"
                  : "Loading projects and Releases…"
                : ""}
            </span>
          </p>
        </div>
        {canSaveRepository && (
          <Button ref={addProjectButton} onClick={() => openProject()}>
            <Plus className="size-4" />
            {zh ? "添加项目" : "Add project"}
          </Button>
        )}
      </AIReqSettingsTarget>
      <details className="text-ui-sm leading-6 text-remote-foreground-muted">
        <summary className="w-fit cursor-pointer rounded-sm border border-transparent hover:text-foreground focus-visible:border-remote-foreground-muted">
          {zh ? "项目与 Release 说明" : "About projects and releases"}
        </summary>
        <div className="space-y-2 pt-3">
          <p>
            {zh
              ? `共享配置 · 当前工号 ${employeeId} · 所有合法工号均可修改。`
              : `Shared configuration · Employee ${employeeId} · All valid employee IDs can edit.`}
          </p>
          <p>
            {zh
              ? "Release 用于归集需求。项目地址与默认分支用于读取项目代码。"
              : "Releases group requirements. The project address and default branch specify where to read code."}
          </p>
        </div>
      </details>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Label htmlFor="project-search" className="sr-only">
          {zh ? "搜索项目" : "Search projects"}
        </Label>
        <div className="relative min-w-60 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
          />
          <Input
            ref={searchInput}
            id="project-search"
            className="h-9 rounded-lg bg-surface pl-9"
            placeholder={zh ? "搜索项目名称或项目地址" : "Search by name or project address"}
            value={projectQuery}
            onChange={(event) => setProjectQuery(event.target.value)}
          />
        </div>
        {normalizedProjectQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setProjectQuery("");
              searchInput.current?.focus();
            }}
          >
            {zh ? "清除筛选" : "Clear filter"}
          </Button>
        )}
      </div>
      {filteredProjectViews.map(({ project, releases, groups }) => (
        <SettingsGroupCard key={project.id}>
          <article
            data-project-id={project.id}
            tabIndex={-1}
            className="rounded-xl focus:outline-none focus:ring-2 focus:ring-input-border-focused"
            ref={(element) => {
              if (element) projectElements.current.set(project.id, element);
              else projectElements.current.delete(project.id);
            }}
          >
            <header className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <FolderGit2 className="size-4 shrink-0 text-foreground-subtle" />
                  <h2 className="min-w-0 break-words text-ui-base font-medium">{project.name}</h2>
                  {aireq.selection.projectId === project.id && (
                    <Badge variant="secondary">{zh ? "当前项目" : "Current project"}</Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="shrink-0"
                  disabled={!canSaveRepository}
                  onClick={(event) => openProject(project, event.currentTarget)}
                  aria-label={zh ? `编辑项目 ${project.name}` : `Edit project ${project.name}`}
                >
                  {zh ? "编辑项目" : "Edit project"}
                </Button>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <p className="text-ui-sm text-remote-foreground-muted">
                    {zh ? "项目地址" : "Project address"}
                  </p>
                  <p className="select-text break-all font-mono text-ui-sm leading-5">
                    {project.repositoryUrl ?? (zh ? "尚未配置" : "Not configured")}
                  </p>
                </div>
                <p className="flex flex-wrap items-center gap-2 text-ui-sm text-foreground-subtle">
                  <GitBranch className="size-3.5" />
                  <span>
                    {zh ? "默认分支：" : "Default branch: "}
                    {project.defaultBranch}
                  </span>
                </p>
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <p className="text-ui-sm text-remote-foreground-muted">
                    {zh ? "工作目录" : "Working directory"}
                  </p>
                  <p className="select-text break-all font-mono text-ui-sm leading-5">
                    {project.workDirectory ?? (zh ? "尚未配置" : "Not configured")}
                  </p>
                </div>
              </div>
            </header>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
              <h3 className="text-ui-sm font-medium">
                {zh ? `Release · ${releases.length} 个` : `Releases · ${releases.length}`}
              </h3>
              <Button
                variant="outline"
                disabled={!canCreateRelease}
                onClick={(event) => openRelease(project.id, event.currentTarget)}
                aria-label={`为${project.name}添加 Release`}
              >
                <Plus className="size-3.5" />
                {zh ? "添加 Release" : "Add release"}
              </Button>
            </div>
            {releases.length ? (
              <details className="border-t border-border">
                <summary className="cursor-pointer px-4 py-2 text-ui-sm text-remote-foreground-muted hover:text-foreground focus-visible:bg-surface-hover">
                  {zh ? "查看 Release 明细" : "View release details"}
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {releases.map((release) => {
                    const srCount = groups.reduce(
                      (count, group) =>
                        group.releaseId === release.id ? count + group.srIds.length : count,
                      0,
                    );
                    return (
                      <li
                        key={release.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="break-words text-ui-base font-medium">{release.title}</p>
                          <p className="text-ui-sm text-foreground-subtle">
                            {zh
                              ? `需求（IR）${release.requirementCount} · 规格（SR）${srCount}`
                              : `Requirements (IR) ${release.requirementCount} · Specifications (SR) ${srCount}`}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {release.requirementCount
                            ? zh
                              ? "已有需求"
                              : "Has requirements"
                            : zh
                              ? "待规划"
                              : "To plan"}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ) : (
              <div className="border-t border-border px-4 py-2 text-ui-sm text-remote-foreground-muted">
                <p>
                  {zh
                    ? "尚无 Release，点击“添加 Release”开始整理本项目的需求。"
                    : "No releases yet. Choose “Add release” to organize this project's requirements."}
                </p>
              </div>
            )}
          </article>
        </SettingsGroupCard>
      ))}
      {releaseCountReady &&
        projects.length > 0 &&
        normalizedProjectQuery &&
        !filteredProjectViews.length && (
          <p role="status" className="text-ui-base text-foreground-subtle">
            {zh ? "没有匹配的项目。" : "No matching projects."}
          </p>
        )}
      {aireq.view && !loadError && !projects.length && (
        <p className="text-ui-base text-foreground-subtle">
          还没有项目。添加项目后即可创建 Release。
        </p>
      )}
      <p role="status" className="text-ui-base text-foreground-subtle">
        {message}
      </p>
      <Dialog
        open={projectOpen}
        onOpenChange={(open) => {
          if (!open && !savingRef.current) guard(() => setProjectOpen(false));
        }}
      >
        {/* 矮窗口中表单曾超出视口；限定弹窗高度，仅正文滚动，保留标题、关闭和底部动作。 */}
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-lg"
          onCloseAutoFocus={restoreDialogFocus}
        >
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>
              {projectId ? (zh ? "编辑项目" : "Edit project") : zh ? "添加项目" : "Add project"}
            </DialogTitle>
            <DialogDescription>
              {zh
                ? "设置项目的 Git 仓库和存放代码及最新文档的工作目录。"
                : "Set the Git repository and the working directory for code and current documents."}
            </DialogDescription>
          </DialogHeader>
          <form
            ref={projectForm}
            className="flex min-h-0 flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveProject();
            }}
          >
            <div className="min-h-0 space-y-4 overflow-y-auto">
              <AIReqProjectField
                id="project-name"
                label={zh ? "项目名称" : "Project name"}
                value={name}
                error={projectErrors.name}
                readOnly={saving}
                disabled={!canSaveRepository}
                onChange={(value) => {
                  setName(value);
                  clearProjectFieldError("name");
                }}
              />
              <AIReqProjectField
                id="project-repository"
                label={zh ? "项目地址" : "Project address"}
                value={repositoryUrl}
                error={projectErrors.repository}
                placeholder="ssh://git@git.example.internal/team/project.git"
                help={
                  zh
                    ? "填写 HTTP(S)、SSH 或 git@host:path 格式的远程仓库地址。"
                    : "Enter an HTTP(S), SSH, or git@host:path remote repository URL."
                }
                readOnly={saving}
                disabled={!canSaveRepository}
                onChange={(value) => {
                  setRepositoryUrl(value);
                  clearProjectFieldError("repository");
                }}
              />
              <AIReqProjectField
                id="project-default-branch"
                label={zh ? "默认分支" : "Default branch"}
                value={defaultBranch}
                error={projectErrors.branch}
                placeholder={zh ? "例如 main 或 master" : "For example, main or master"}
                readOnly={saving}
                disabled={!canSaveRepository}
                onChange={(value) => {
                  setDefaultBranch(value);
                  clearProjectFieldError("branch");
                }}
              />
              <AIReqProjectField
                id="project-work-directory"
                label={zh ? "工作目录" : "Working directory"}
                value={workDirectory}
                error={projectErrors.workDirectory}
                placeholder="/xxx/yyy"
                help={
                  zh
                    ? "填写服务端绝对路径。保存时克隆到 code/<项目名称>，并在 docs/areq 下维护最新文档。"
                    : "Use an absolute server path. Saving clones into code/<project name> and publishes current documents under docs/areq."
                }
                readOnly={saving}
                disabled={!canSaveRepository}
                onChange={(value) => {
                  setWorkDirectory(value);
                  clearProjectFieldError("workDirectory");
                }}
              />
              {projectError && (
                <p role="alert" className="text-ui-base text-destructive">
                  {projectError}
                </p>
              )}
            </div>
            <DialogFooter className="shrink-0">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => guard(() => setProjectOpen(false))}
              >
                {zh ? "取消" : "Cancel"}
              </Button>
              <Button type="submit" disabled={!canSave}>
                {saving
                  ? zh
                    ? "保存中…"
                    : "Saving…"
                  : projectId
                    ? zh
                      ? "保存配置"
                      : "Save configuration"
                    : zh
                      ? "添加项目"
                      : "Add project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AIReqReleaseDialog
        open={releaseOpen}
        onCloseAutoFocus={restoreDialogFocus}
        onOpenChange={(open) => {
          if (!open && !savingRef.current) guard(() => setReleaseOpen(false));
        }}
        projects={projects}
        releaseProjectId={releaseProjectId}
        releaseTitle={releaseTitle}
        releaseError={releaseError}
        releaseSaving={releaseSaving}
        canSave={canSave}
        zh={zh}
        onProjectChange={(value) => {
          setReleaseProjectId(value);
          setReleaseError("");
        }}
        onTitleChange={(value) => {
          setReleaseTitle(value);
          setReleaseError("");
        }}
        onCancel={() => guard(() => setReleaseOpen(false))}
        onSubmit={() => void saveRelease()}
      />
    </section>
  );
}
