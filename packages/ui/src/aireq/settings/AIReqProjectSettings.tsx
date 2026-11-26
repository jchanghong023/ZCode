import { formatUserFacingError } from "@/lib/errorMessage.js";
import { createUuid } from "@zcode/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { SettingsGroupCard } from "@/settings/SettingsPageParts.js";
import type { AIReqProject, AIReqSettingsDraftActions } from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { useAIReq } from "../AIReqContext.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { AIReqProjectField } from "./AIReqProjectField.js";
import { validateRepository, type ProjectFieldErrors } from "./projectValidation.js";

export type AIReqProjectSettingsRequest = { kind: "project"; projectId: string };

type RepositoryFields = { repositoryUrl: string; defaultBranch: string; workDirectory: string };
type ProjectDraft = RepositoryFields & { id: string; name: string; revision: number };

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
  const ai = useAIReq();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [draft, setDraft] = useState<ProjectDraft>();
  const baseline = useRef<ProjectDraft>(undefined);
  const savingRef = useRef(false);
  const currentActions = useRef<AIReqSettingsDraftActions | null>(null);
  const repositoryOperation = useRef<{ payload: string; operationId: string } | null>(null);
  const [projectError, setProjectError] = useState("");
  const [projectErrors, setProjectErrors] = useState<ProjectFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [targetError, setTargetError] = useState("");
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const projectForm = useRef<HTMLFormElement>(null);
  const dialogTrigger = useRef<HTMLButtonElement>(null);
  const projectElements = useRef(new Map<string, HTMLElement>());
  const projects = ai?.view?.projects;
  const pending = ai?.pending;
  const readError = ai?.error;
  const search = query.trim().toLocaleLowerCase();
  const filtered = projects?.filter((project) =>
    `${project.name} ${project.repositoryUrl ?? ""} ${project.workDirectory ?? ""}`
      .toLocaleLowerCase()
      .includes(search),
  );
  const projectName = projects?.find((project) => project.id === draft?.id)?.name ?? draft?.name;
  const saveRepository = source.projects?.saveRepository;
  const canSaveRepository = Boolean(saveRepository);
  const dirty = Boolean(
    draft &&
    baseline.current &&
    (draft.repositoryUrl !== baseline.current.repositoryUrl ||
      draft.defaultBranch !== baseline.current.defaultBranch ||
      draft.workDirectory !== baseline.current.workDirectory),
  );
  const canSave = Boolean(
    draft &&
    canSaveRepository &&
    dirty &&
    !saving &&
    draft.repositoryUrl.trim() &&
    draft.defaultBranch.trim() &&
    draft.workDirectory.trim(),
  );

  const updateDraft = (
    field: keyof RepositoryFields,
    errorField: keyof ProjectFieldErrors,
    value: string,
  ) => {
    setDraft((current) => current && { ...current, [field]: value });
    setProjectError("");
    setProjectErrors((previous) => ({ ...previous, [errorField]: undefined }));
  };

  const saveProject = async () => {
    if (!draft || !canSave || !saveRepository || savingRef.current) return false;
    setProjectError("");
    const errors = validateRepository(
      draft.repositoryUrl,
      draft.defaultBranch,
      draft.workDirectory,
    );
    if (Object.keys(errors).length) {
      setProjectErrors(errors);
      const fieldId = errors.repository
        ? "project-repository"
        : errors.branch
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
        projectId: draft.id,
        repositoryUrl: draft.repositoryUrl.trim(),
        defaultBranch: draft.defaultBranch.trim(),
        workDirectory: draft.workDirectory.trim(),
        expectedRevision: draft.revision,
      };
      const payload = JSON.stringify([
        input.projectId,
        input.repositoryUrl,
        input.defaultBranch,
        input.workDirectory,
      ]);
      if (repositoryOperation.current?.payload !== payload)
        repositoryOperation.current = { payload, operationId: createUuid() };
      await saveRepository({ ...input, operationId: repositoryOperation.current.operationId });
      setDraft(undefined);
      setMessage(zh ? "项目配置已保存。" : "Project configuration saved.");
      void ai?.refresh();
      return true;
    } catch (cause) {
      setProjectError(
        formatUserFacingError(
          cause,
          zh ? "保存项目配置失败。" : "Could not save project configuration.",
        ),
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  currentActions.current = {
    canSave,
    canDiscard: !saving,
    save: saveProject,
    discard: () => setDraft(undefined),
  };
  useEffect(() => {
    onDraftActionsChange(
      dirty || saving
        ? {
            canSave,
            canDiscard: !saving,
            save: () => currentActions.current?.save() ?? false,
            discard: () => currentActions.current?.discard(),
          }
        : null,
    );
  }, [dirty, saving, canSave, onDraftActionsChange]);
  useEffect(() => () => onDraftActionsChange(null), [onDraftActionsChange]);

  const openProject = (project: AIReqProject, trigger: HTMLButtonElement) => {
    dialogTrigger.current = trigger;
    const initial = {
      id: project.id,
      name: project.name,
      revision: project.revision,
      repositoryUrl: project.repositoryUrl ?? "",
      defaultBranch: project.defaultBranch,
      workDirectory: project.workDirectory ?? "",
    };
    repositoryOperation.current = null;
    baseline.current = initial;
    setDraft(initial);
    setProjectErrors({});
    setProjectError("");
    setMessage("");
  };
  const restoreDialogFocus = useCallback((event: Event) => {
    const target = dialogTrigger.current?.isConnected ? dialogTrigger.current : searchInput.current;
    if (!target?.isConnected || target.closest("[inert]")) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!active || !request || pending || !projects || readError) return;
    if (search) {
      setQuery("");
      return;
    }
    const element = projectElements.current.get(request.projectId);
    if (element) {
      setTargetError("");
      element.scrollIntoView({ block: "start" });
      element.focus({ preventScroll: true });
    } else {
      setTargetError(
        zh ? "云龙目录中没有此项目。" : "This project is missing from the CloudDragon directory.",
      );
    }
    onRequestHandled(request);
  }, [active, request, pending, projects, readError, search, zh, onRequestHandled]);

  if (!ai) return null;
  const notConfigured = zh ? "尚未配置" : "Not configured";
  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-foreground-subtle" />
          <Label htmlFor="project-settings-search" className="sr-only">
            {zh ? "搜索项目" : "Search projects"}
          </Label>
          <Input
            id="project-settings-search"
            ref={searchInput}
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={zh ? "搜索项目名称或仓库地址" : "Search by project name or repository"}
          />
        </div>
        <Button variant="outline" disabled={ai.pending} onClick={() => void ai.refresh()}>
          <RefreshCw className="size-4" />
          {zh ? "刷新项目" : "Refresh projects"}
        </Button>
      </div>
      {ai.pending && !projects && (
        <p role="status">{zh ? "正在读取云龙项目…" : "Loading CloudDragon projects…"}</p>
      )}
      {targetError && (
        <p role="alert" className="text-destructive">
          {targetError}
        </p>
      )}
      {ai.error && (
        <p role="alert" className="text-destructive">
          {ai.error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {filtered?.map((project) => {
        const releases = ai.view?.releases.filter((item) => item.projectId === project.id) ?? [];
        return (
          <article
            key={project.id}
            ref={(element) => {
              if (element) projectElements.current.set(project.id, element);
              else projectElements.current.delete(project.id);
            }}
            tabIndex={-1}
          >
            <SettingsGroupCard>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h2 className="wrap-anywhere font-medium">{project.name}</h2>
                  {(!project.repositoryUrl || !project.workDirectory) && (
                    <p className="text-ui-sm text-foreground-subtle">
                      {zh ? "代码源待配置" : "Code source needs configuration"}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  disabled={!canSaveRepository}
                  onClick={(event) => openProject(project, event.currentTarget)}
                >
                  {zh ? "编辑配置" : "Edit configuration"}
                </Button>
                <dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-ui-sm">
                  <dt className="text-foreground-subtle">
                    {zh ? "仓库地址" : "Repository address"}
                  </dt>
                  <dd className="wrap-anywhere">{project.repositoryUrl ?? notConfigured}</dd>
                  <dt className="text-foreground-subtle">{zh ? "默认分支" : "Default branch"}</dt>
                  <dd className="wrap-anywhere">{project.defaultBranch}</dd>
                  <dt className="text-foreground-subtle">
                    {zh ? "工作目录" : "Working directory"}
                  </dt>
                  <dd className="wrap-anywhere">{project.workDirectory ?? notConfigured}</dd>
                  {releases.length > 0 && (
                    <>
                      <dt className="text-foreground-subtle">Release</dt>
                      <dd>
                        <ul className="flex flex-wrap gap-x-3 gap-y-1">
                          {releases.map((release) => (
                            <li key={release.id} className="wrap-anywhere">
                              {release.title}
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            </SettingsGroupCard>
          </article>
        );
      })}
      {projects && !filtered?.length && !ai.pending && !ai.error && (
        <p className="text-foreground-subtle">
          {search
            ? zh
              ? "没有匹配的项目。"
              : "No matching projects."
            : zh
              ? "暂无名称包含「开发」的云龙项目。"
              : "No CloudDragon projects have “开发” in their name."}
        </p>
      )}
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open && !savingRef.current) guard(() => setDraft(undefined));
        }}
      >
        {/* 矮窗口中表单曾超出视口；限定弹窗高度，仅正文滚动，保留标题、关闭和底部动作。 */}
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-lg"
          onCloseAutoFocus={restoreDialogFocus}
        >
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>{zh ? "编辑项目配置" : "Edit project configuration"}</DialogTitle>
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
              <div className="space-y-1">
                <p className="text-ui-sm text-foreground-subtle">
                  {zh ? "项目名称 · 来自云龙" : "Project name · CloudDragon"}
                </p>
                <p className="wrap-anywhere font-medium">{projectName}</p>
              </div>
              <AIReqProjectField
                id="project-repository"
                label={zh ? "仓库地址" : "Repository address"}
                value={draft?.repositoryUrl ?? ""}
                error={projectErrors.repository}
                placeholder="ssh://git@example.com/team/project.git"
                help={
                  zh
                    ? "填写 HTTP(S)、SSH 或 git@host:path 格式的远程仓库地址。"
                    : "Enter an HTTP(S), SSH, or git@host:path remote repository URL."
                }
                readOnly={saving}
                disabled={!canSaveRepository}
                onChange={(value) => updateDraft("repositoryUrl", "repository", value)}
              />
              <AIReqProjectField
                id="project-default-branch"
                label={zh ? "默认分支" : "Default branch"}
                value={draft?.defaultBranch ?? ""}
                error={projectErrors.branch}
                placeholder={zh ? "例如 main 或 master" : "For example, main or master"}
                readOnly={saving}
                disabled={!canSaveRepository}
                onChange={(value) => updateDraft("defaultBranch", "branch", value)}
              />
              <AIReqProjectField
                id="project-work-directory"
                label={zh ? "工作目录" : "Working directory"}
                value={draft?.workDirectory ?? ""}
                error={projectErrors.workDirectory}
                placeholder="/xxx/yyy"
                help={
                  zh
                    ? "填写服务端绝对路径。最新需求文档位于此目录的 docs/areq 下。"
                    : "Enter an absolute server path. The latest requirements documents are stored under docs/areq."
                }
                readOnly={saving}
                disabled={!canSaveRepository}
                onChange={(value) => updateDraft("workDirectory", "workDirectory", value)}
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
                onClick={() => guard(() => setDraft(undefined))}
              >
                {zh ? "取消" : "Cancel"}
              </Button>
              <Button type="submit" disabled={!canSave}>
                {saving ? (zh ? "保存中…" : "Saving…") : zh ? "保存配置" : "Save configuration"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
