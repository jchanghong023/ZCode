import { formatUserFacingError } from "@/lib/errorMessage.js";
import { createUuid } from "@zcode/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { FolderGit2, GitBranch, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { SettingsGroupCard } from "@/settings/SettingsPageParts.js";
import type { AIReqProject, AIReqSettingsDraftActions, AIReqWorkflowView } from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { getEmployeeId } from "../identity.js";
import { useAIReq } from "../AIReqContext.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { AIReqSettingsTarget } from "./AIReqSettingsTarget.js";

export type AIReqProjectSettingsRequest =
  | { kind: "create" }
  | { kind: "project"; projectId: string };

function validateRepository(name: string, remote: string, branch: string) {
  if (!name.trim()) return "请输入项目名称。";
  const url = remote.trim();
  let valid = /^[^\s/@:]+@[^\s/:]+:[^\s]+$/.test(url);
  if (!valid && /^(?:https?|ssh|git):\/\/[^\s]+$/.test(url)) {
    try {
      valid = Boolean(new URL(url).hostname);
    } catch {
      valid = false;
    }
  }
  if (!valid)
    return "请输入含主机的 HTTP(S)、SSH、git URL 或 user@host:path 远程仓库地址；不支持本地路径。";
  const value = branch.trim();
  if (
    !value ||
    /[\s~^:?*[\\]/.test(value) ||
    value.includes("..") ||
    value.includes("@{") ||
    value.startsWith("-") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.endsWith(".lock") ||
    value.includes("//") ||
    value === "@" ||
    value.split("/").some((part) => part.startsWith("."))
  )
    return "请输入有效的默认分支名称。";
}

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
  const initialProject = useRef({ name: "", repositoryUrl: "", defaultBranch: "" });
  const initialReleaseProject = useRef("");
  const savingRef = useRef(false);
  const currentActions = useRef<AIReqSettingsDraftActions | null>(null);
  const repositoryOperation = useRef<{ payload: string; operationId: string } | null>(null);
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [projectError, setProjectError] = useState("");
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
  const [releaseSaving, setReleaseSaving] = useState(false);
  const [projectViews, setProjectViews] = useState<
    { project: AIReqProject; view: AIReqWorkflowView }[]
  >([]);
  const projectElements = useRef(new Map<string, HTMLElement>());
  const loadedSnapshot = useRef<{
    source: typeof source;
    view: AIReqWorkflowView | undefined;
    refreshKey: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const view = aireq?.view;
    setLoading(true);
    setLoadError("");
    Promise.all(
      (view?.projects ?? []).map(async (project) => ({
        project,
        view: await source.readWorkflow({ projectId: project.id }),
      })),
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
  const releaseCount = projectViews.reduce((count, item) => count + item.view.releases.length, 0);
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
        defaultBranch !== initialProject.current.defaultBranch)) ||
    (releaseOpen && (releaseTitle !== "" || releaseProjectId !== initialReleaseProject.current));
  const busy = saving || releaseSaving;
  const canSave =
    !busy &&
    (projectOpen
      ? canSaveRepository && Boolean(name.trim() && repositoryUrl.trim() && defaultBranch.trim())
      : releaseOpen &&
        canCreateRelease &&
        Boolean(releaseProjectId && releaseTitle.trim()) &&
        !aireq?.pending);
  const saveProject = async () => {
    if (!canSaveRepository || savingRef.current) return false;
    // 输入校验直接产生业务提示，远程异常则交给统一安全错误格式化，避免下发实现细节。
    const validationError = validateRepository(name, repositoryUrl, defaultBranch);
    if (validationError) {
      setProjectError(validationError);
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setProjectError("");
    try {
      const input = {
        projectId,
        name: name.trim(),
        repositoryUrl: repositoryUrl.trim(),
        defaultBranch: defaultBranch.trim(),
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
          (release) => release.title.toLowerCase() === releaseTitle.trim().toLowerCase(),
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
      if (result?.status !== "completed") {
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
  const openProject = useCallback((project?: AIReqProject) => {
    setProjectRevision(project?.revision ?? 0);
    repositoryOperation.current = null;
    setProjectId(project?.id);
    setName(project?.name ?? "");
    setRepositoryUrl(project?.repositoryUrl ?? "");
    setDefaultBranch(project?.defaultBranch ?? "");
    initialProject.current = {
      name: project?.name ?? "",
      repositoryUrl: project?.repositoryUrl ?? "",
      defaultBranch: project?.defaultBranch ?? "",
    };
    setProjectError("");
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
    zh,
  ]);
  if (!aireq) return null;
  const openRelease = (id: string) => {
    initialReleaseProject.current = id;
    setReleaseProjectId(id);
    setReleaseTitle("");
    setReleaseError("");
    setReleaseOpen(true);
  };
  return (
    <section className="space-y-6" data-testid="aireq-project-settings">
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
            {zh
              ? `${projects.length} 个项目 · ${
                  releaseCountReady
                    ? `${releaseCount} 个 Release`
                    : loadError
                      ? "Release 数量不可用"
                      : "Release 数量读取中…"
                }`
              : `${projects.length} projects · ${
                  releaseCountReady
                    ? `${releaseCount} releases`
                    : loadError
                      ? "Release count unavailable"
                      : "Loading Release count…"
                }`}
            <span role="status" className="sr-only">
              {loading && projectViews.length > 0
                ? zh
                  ? "正在读取项目与 Release…"
                  : "Loading projects and Releases…"
                : ""}
            </span>
          </p>
          <p className="text-ui-sm text-foreground-subtle">
            {zh
              ? "在项目卡片中编辑配置，或添加用于归集需求的 Release。"
              : "Edit a project below or add a release to organize its requirements."}
          </p>
        </div>
        {canSaveRepository && (
          <Button onClick={() => openProject()}>
            <Plus className="size-4" />
            {zh ? "添加项目" : "Add project"}
          </Button>
        )}
      </AIReqSettingsTarget>
      <div className="space-y-2 text-ui-sm leading-5 text-remote-foreground-muted">
        <p>
          {zh
            ? `共享配置 · 当前工号 ${employeeId} · 所有合法工号均可修改。`
            : `Shared configuration · Employee ${employeeId} · All valid employee IDs can edit.`}
        </p>
        <p>
          {zh
            ? "Release 用于归集需求，不是 Git 分支；沿用项目的仓库与默认分支。"
            : "A release groups requirements, is not a Git branch, and inherits its project's repository and default branch."}
        </p>
      </div>
      {projectViews.map(({ project, view }) => (
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
            <header className="space-y-3 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <FolderGit2 className="size-4 shrink-0 text-foreground-subtle" />
                  <h3 className="min-w-0 break-words text-ui-base font-medium">{project.name}</h3>
                  {aireq.selection.projectId === project.id && (
                    <Badge variant="secondary">{zh ? "当前项目" : "Current project"}</Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="shrink-0"
                  disabled={!canSaveRepository}
                  onClick={() => openProject(project)}
                  aria-label={zh ? `编辑项目 ${project.name}` : `Edit project ${project.name}`}
                >
                  {zh ? "编辑项目" : "Edit project"}
                </Button>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <p className="text-ui-sm text-remote-foreground-muted">
                    {zh ? "Git 仓库" : "Git repository"}
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
              </div>
            </header>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
              <h4 className="text-ui-sm font-medium">
                {zh ? `Release · ${view.releases.length} 个` : `Releases · ${view.releases.length}`}
              </h4>
              <Button
                variant="outline"
                disabled={!canCreateRelease}
                onClick={() => openRelease(project.id)}
                aria-label={`为${project.name}添加 Release`}
              >
                <Plus className="size-3.5" />
                {zh ? "添加 Release" : "Add release"}
              </Button>
            </div>
            {view.releases.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {view.releases.map((release) => {
                  const groups = view.groups.filter((group) => group.releaseId === release.id);
                  const draftCount = view.drafts.filter(
                    (group) => group.releaseId === release.id,
                  ).length;
                  const srCount = groups.reduce((count, group) => count + group.srIds.length, 0);
                  return (
                    <li
                      key={release.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="break-words text-ui-base font-medium">{release.title}</p>
                        {/* 计数展开领域术语；仅有提案时补充，避免重复的零值干扰扫描。 */}
                        <p className="text-ui-sm text-foreground-subtle">
                          {zh
                            ? `正式需求（IR）${groups.length} · 开发单元（SR）${srCount}`
                            : `Formal requirements (IR) ${groups.length} · Development units (SR) ${srCount}`}
                          {draftCount > 0 &&
                            (zh ? ` · 需求提案 ${draftCount}` : ` · Proposals ${draftCount}`)}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {groups.length
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
            ) : (
              <div className="border-t border-border px-4 py-4 text-ui-sm text-remote-foreground-muted">
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
      {aireq.view && !loadError && !projects.length && (
        <p className="text-ui-base text-foreground-subtle">
          还没有项目。配置 Git 仓库与默认分支后，即可创建 Release。
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
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>
              {projectId ? (zh ? "编辑项目" : "Edit project") : zh ? "添加项目" : "Add project"}
            </DialogTitle>
            <DialogDescription>
              {zh
                ? "配置项目名称、远程 Git 仓库与默认分支。"
                : "Set the project name, remote Git repository, and default branch."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveProject();
            }}
          >
            <div className="min-h-0 space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="project-name">{zh ? "项目名称" : "Project name"}</Label>
                {/* 禁用文本框会丢失 Enter 提交前的焦点；只读即可阻止并发编辑。 */}
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  readOnly={saving}
                  disabled={!canSaveRepository}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-repository">
                  {zh ? "Git 仓库地址" : "Git repository URL"}
                </Label>
                <Input
                  id="project-repository"
                  value={repositoryUrl}
                  onChange={(event) => setRepositoryUrl(event.target.value)}
                  placeholder="ssh://git@git.example.internal/team/project.git"
                  required
                  readOnly={saving}
                  disabled={!canSaveRepository}
                  aria-describedby="project-repository-help"
                />
                <p
                  id="project-repository-help"
                  className="text-ui-sm leading-5 text-remote-foreground-muted"
                >
                  {zh
                    ? "填写 HTTP(S)、SSH 或 git@host:path 格式的远程地址，不填写本地路径。"
                    : "Enter an HTTP(S), SSH, or git@host:path remote URL, not a local path."}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-default-branch">{zh ? "默认分支" : "Default branch"}</Label>
                <Input
                  id="project-default-branch"
                  value={defaultBranch}
                  onChange={(event) => setDefaultBranch(event.target.value)}
                  placeholder={zh ? "例如 main 或 master" : "For example, main or master"}
                  required
                  readOnly={saving}
                  disabled={!canSaveRepository}
                />
              </div>
              <p className="text-ui-sm leading-5 text-remote-foreground-muted">
                {zh
                  ? "保存仅记录项目配置，不检查仓库连接与默认分支。"
                  : "Saving records project settings without checking repository access or the default branch."}
              </p>
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
      <Dialog
        open={releaseOpen}
        onOpenChange={(open) => {
          if (!open && !savingRef.current) guard(() => setReleaseOpen(false));
        }}
      >
        {/* Release 同样将正文约束在视口内，避免大字号时主要动作被裁切。 */}
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>{zh ? "添加 Release" : "Add release"}</DialogTitle>
            <DialogDescription>
              {zh
                ? "用于归集同一版本的需求，不是 Git 分支。沿用所选项目的 Git 仓库与默认分支。"
                : "Group requirements for a version, not a Git branch. The release inherits the selected project's repository and default branch."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveRelease();
            }}
          >
            <div className="min-h-0 space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="release-project">{zh ? "所属项目" : "Project"}</Label>
                <Select
                  value={releaseProjectId}
                  disabled={releaseSaving}
                  onValueChange={(value) => {
                    setReleaseProjectId(value);
                    setReleaseError("");
                  }}
                >
                  <SelectTrigger id="release-project" size="lg" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 text-ui-sm text-foreground-subtle">
                <p className="break-all">
                  {zh ? "Git 仓库：" : "Git repository: "}
                  {projects.find((project) => project.id === releaseProjectId)?.repositoryUrl ??
                    (zh ? "尚未配置" : "Not configured")}
                </p>
                <p>
                  {zh ? "默认分支：" : "Default branch: "}
                  {projects.find((project) => project.id === releaseProjectId)?.defaultBranch}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="release-name">{zh ? "Release 名称" : "Release name"}</Label>
                <Input
                  id="release-name"
                  placeholder={
                    zh
                      ? "例如：2027.01 · 支付体验优化"
                      : "For example, 2027.01 · Payment improvements"
                  }
                  value={releaseTitle}
                  readOnly={releaseSaving}
                  onChange={(event) => {
                    setReleaseTitle(event.target.value);
                    setReleaseError("");
                  }}
                  required
                />
              </div>
              {releaseError && (
                <p role="alert" className="text-ui-base text-destructive">
                  {releaseError}
                </p>
              )}
            </div>
            <DialogFooter className="shrink-0">
              <Button
                type="button"
                variant="outline"
                disabled={releaseSaving}
                onClick={() => guard(() => setReleaseOpen(false))}
              >
                {zh ? "取消" : "Cancel"}
              </Button>
              <Button type="submit" disabled={!canSave}>
                {releaseSaving ? (zh ? "保存中…" : "Saving…") : zh ? "添加 Release" : "Add release"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
