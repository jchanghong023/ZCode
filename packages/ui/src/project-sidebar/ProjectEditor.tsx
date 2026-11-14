import { formatProjectError } from "@/project-sidebar/view.js";
import { useOptionalProjectDirectory } from "@/project-sidebar/ProjectDirectoryProvider.js";
import { useEffect, useRef, useState } from "react";
import { Folder, FolderPlus, X } from "lucide-react";
import type { IProjectService, VirtualProject } from "@/project-sidebar/contract.js";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { DirectoryBrowser } from "@/DirectoryBrowser.js";
import { useProjectDirectoryServices } from "@/project-sidebar/useProjectDirectoryServices.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { getPathLeaf } from "@/lib/path.js";
import { logger } from "@/logger.js";
import {
  ProjectFolderTrustDialog,
  type ProjectFolderTrustRequest,
} from "@/project-sidebar/ProjectFolderTrustDialog.js";

const FIELD_LABEL = "text-ui-sm font-medium text-foreground";

export function ProjectEditor({
  project,
  projects,
  service,
  onClose,
  onSaved,
  onDeleted,
}: {
  project: VirtualProject | null;
  projects: VirtualProject[];
  service: IProjectService;
  onClose(): void;
  onSaved(project: VirtualProject): Promise<void>;
  onDeleted?(): Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const sidebar = useOptionalProjectDirectory();
  const msg = (id: string) => intl.formatMessage({ id: `project.${id}` });
  const [name, setName] = useState(project?.name ?? "");
  const [nameEdited, setNameEdited] = useState(false);
  const [roots, setRoots] = useState(project?.roots.map((root) => root.rootPath) ?? []);
  const [primary, setPrimary] = useState(
    project?.roots.find((root) => root.isPrimary)?.rootPath ?? "",
  );
  const [browsing, setBrowsing] = useState(false);
  const directory = useProjectDirectoryServices(service);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<VirtualProject | null>(null);
  const [folderTrust, setFolderTrust] = useState<ProjectFolderTrustRequest | null>(null);
  const saveFlight = useRef<{ cancelTrust?: () => void } | null>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const confirm = useConfirmDialog();
  const epoch = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current++;
      saveFlight.current?.cancelTrust?.();
    };
  }, []);
  const current = (request: number) => alive.current && epoch.current === request;
  const addRoots = (values: string[]) => {
    const next = [...new Set([...roots, ...values.filter(Boolean)])];
    setRoots(next);
    if (!roots.length) setPrimary(next[0] ?? "");
    setBrowsing(false);
  };
  const browse = () => {
    // 浏览器没有本机目录选择框；项目根目录一律经后端 workspace 目录浏览选择。
    epoch.current += 1;
    setBrowsing(true);
  };
  const save = async () => {
    if (saveFlight.current) return;
    const flight: { cancelTrust?: () => void } = {};
    saveFlight.current = flight;
    const request = epoch.current;
    const canCommit = () => current(request);
    setBusy(true);
    setError(null);
    try {
      if (created) {
        await onSaved(created);
        if (canCommit()) onClose();
        return;
      }
      let restoreProject: VirtualProject | undefined;
      if (!project) {
        const deleted = projects.find(
          (candidate) =>
            candidate.deleted &&
            candidate.roots.length === roots.length &&
            candidate.roots.every((root) => roots.includes(root.rootPath)),
        );
        if (
          deleted &&
          (await confirm({
            title: msg("restore"),
            description: intl.formatMessage(
              { id: "project.restoreDescription" },
              { name: deleted.name },
            ),
          }))
        )
          restoreProject = deleted;
      }
      if (!canCommit()) return;
      if (!project && roots.length) {
        const accepted = await new Promise<boolean>((resolve) => {
          const finish = (value: boolean) => {
            if (!flight.cancelTrust) return;
            flight.cancelTrust = undefined;
            if (alive.current) setFolderTrust(null);
            resolve(value);
          };
          flight.cancelTrust = () => finish(false);
          setFolderTrust({
            roots: [...roots],
            restoring: Boolean(restoreProject),
            resolve: finish,
          });
        });
        logger.debug("[ProjectEditor] folder confirmation", { accepted, count: roots.length });
        if (!accepted || !canCommit()) return;
      }
      const saved = await service.saveProject({
        ...(project ? { hostId: project.hostId } : {}),
        ...(project ? { id: project.id } : {}),
        ...(restoreProject ? { restoreProjectId: restoreProject.id } : {}),
        ...(nameEdited ? { name: name.trim() } : {}),
        defaultName: msg("new"),
        roots,
        ...(primary ? { primaryRoot: primary } : {}),
      });
      if (!alive.current) return;
      if (!project) setCreated(saved);
      // 外层聊天可能已换代；保留已保存结果，但不继续导航或关闭新流程。
      if (!canCommit()) return;
      if (!project) sidebar?.preferences.prepend(saved);
      await onSaved(saved);
      // 草稿可能已被关闭或替换；旧结果不能关闭后来创建的表单。
      if (canCommit()) onClose();
    } catch (cause) {
      if (canCommit()) setError(formatProjectError(cause, intl.formatMessage));
    } finally {
      if (saveFlight.current === flight) saveFlight.current = null;
      if (alive.current) setBusy(false);
    }
  };
  const remove = async () => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      // 编辑器曾漏掉删除入口；复用 Host 的软删除，不触碰文件或任务。
      await service.deleteProject(project.id, project.hostId);
      await onDeleted?.();
      onClose();
    } catch (cause) {
      setError(formatProjectError(cause, intl.formatMessage));
    } finally {
      setBusy(false);
    }
  };
  const browserEpoch = epoch.current;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open)
          logger.debug("[ProjectEditor] close requested", {
            busy,
            confirming: Boolean(folderTrust),
          });
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-lg gap-5">
        <DialogTitle>
          {browsing ? msg("browse") : project ? msg("edit") : msg("create")}
        </DialogTitle>
        <DialogDescription className="sr-only">{msg("description")}</DialogDescription>
        {browsing ? (
          <div
            className="flex h-96 min-h-0 flex-col gap-2"
            data-testid="virtual-project-directory-browser"
          >
            <DirectoryBrowser
              embedded
              showSelectionActions
              selectLabel={msg("browse")}
              services={directory.services}
              onSelect={(path) => {
                if (current(browserEpoch)) addRoots([path]);
              }}
              onCancel={() => {
                epoch.current++;
                setBrowsing(false);
              }}
            />
          </div>
        ) : (
          <>
            <div className="grid min-w-0 gap-1.5">
              <label htmlFor="project-name" className={FIELD_LABEL}>
                {msg("name")}
              </label>
              <Input
                id="project-name"
                aria-label={msg("name")}
                placeholder={msg("new")}
                autoFocus
                disabled={busy || Boolean(created)}
                data-testid="virtual-project-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameEdited(true);
                }}
                className="h-9 rounded-lg max-md:text-mobile-input-safe"
              />
            </div>
            <fieldset disabled={busy || Boolean(created)} className="min-w-0">
              <legend className={`mb-1.5 ${FIELD_LABEL}`}>{msg("folders")}</legend>
              {/* 有目录时使用同一列表的末行添加，只有零目录才展示空态大卡片。 */}
              <div
                data-testid={roots.length ? "virtual-project-roots" : undefined}
                className={
                  roots.length
                    ? "min-w-0 overflow-hidden rounded-lg border border-border divide-y divide-border"
                    : undefined
                }
              >
                {roots.map((root) => (
                  <div
                    className="flex min-h-12 min-w-0 items-center gap-2 px-3 py-2"
                    key={root}
                    data-testid="virtual-project-root-row"
                  >
                    <Folder className="size-4 shrink-0 text-foreground-subtle" />
                    <span
                      className="min-w-0 flex-1 truncate text-ui-base"
                      title={root}
                      data-testid="virtual-project-root-name"
                    >
                      {getPathLeaf(root)}
                    </span>
                    {root === primary ? (
                      <span
                        data-testid="virtual-project-primary"
                        className="inline-flex h-7 shrink-0 items-center rounded-md border border-border px-2 text-ui-base text-foreground-subtle"
                      >
                        {msg("primaryBadge")}
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-foreground-subtle"
                        data-testid="virtual-project-set-primary"
                        onClick={() => setPrimary(root)}
                      >
                        {msg("setPrimary")}
                      </Button>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-foreground-subtle"
                      data-testid="virtual-project-remove-folder"
                      aria-label={msg("removeFolder")}
                      onClick={() => {
                        const next = roots.filter((item) => item !== root);
                        setRoots(next);
                        if (primary === root) setPrimary(next[0] ?? "");
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <button
                  type="button"
                  data-testid="virtual-project-browse"
                  aria-label={msg("browse")}
                  className={`group flex w-full items-center gap-2 text-ui-base transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 ${roots.length ? "min-h-12 px-3 py-2 text-left" : "min-h-32 flex-col justify-center rounded-lg border border-dashed border-border px-4 py-5 text-center hover:border-border-hover"}`}
                  onClick={() => {
                    void browse();
                  }}
                >
                  {roots.length ? (
                    <>
                      <FolderPlus className="size-4 shrink-0 text-foreground-subtle" />
                      <span>{msg("addSourceFolder")}</span>
                    </>
                  ) : (
                    <>
                      <span className="flex size-9 items-center justify-center rounded-full bg-surface text-foreground-subtle group-hover:text-foreground">
                        <FolderPlus className="size-4" />
                      </span>
                      <span className="font-medium">{msg("browse")}</span>
                      <span className="text-ui-sm text-foreground-subtle">{msg("browseHint")}</span>
                    </>
                  )}
                </button>
              </div>
            </fieldset>
            {error ? (
              <p role="alert" className="text-ui-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter className="flex-row flex-wrap items-center justify-end">
              {project ? (
                <Button
                  variant="ghost"
                  data-testid="virtual-project-editor-delete"
                  disabled={busy || Boolean(created)}
                  onClick={() => {
                    void remove();
                  }}
                  className="mr-auto bg-destructive-surface text-destructive-surface-foreground hover:bg-destructive-surface hover:text-destructive-surface-foreground"
                >
                  {msg("delete")}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                {msg("cancel")}
              </Button>
              <Button
                ref={saveButton}
                data-testid="virtual-project-save"
                onClick={() => {
                  void save();
                }}
                disabled={busy}
              >
                {project ? msg("save") : msg("create")}
              </Button>
            </DialogFooter>
          </>
        )}
        {/* 确认框须留在父弹层的 React 树内；兄弟节点的触摸取消会被延迟判为外部点击，连带关闭草稿。 */}
        {folderTrust ? (
          <ProjectFolderTrustDialog
            request={folderTrust}
            onClosed={() => {
              if (alive.current) saveButton.current?.focus();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
