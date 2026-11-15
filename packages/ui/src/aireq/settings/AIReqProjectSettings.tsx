import { createUuid } from "@zcode/shared";
import { useEffect, useRef, useState } from "react";
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
import type { AIReqProject, AIReqWorkflowView } from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { getEmployeeId } from "../identity.js";
import { useAIReq } from "../AIReqContext.js";

function validateRepository(name: string, remote: string, branch: string) {
  if (!name.trim()) throw new Error("请输入项目名称。");
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
    throw new Error(
      "请输入含主机的 HTTP(S)、SSH、git URL 或 user@host:path 远程仓库地址；不支持本地路径。",
    );
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
    throw new Error("请输入有效的默认分支名称。");
}

export function AIReqProjectSettings() {
  const source = useAIReqDataSource();
  const aireq = useAIReq();
  const employeeId = getEmployeeId();
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>();
  const [projectRevision, setProjectRevision] = useState(0);
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [releaseSaving, setReleaseSaving] = useState(false);
  const [projectViews, setProjectViews] = useState<
    { project: AIReqProject; view: AIReqWorkflowView }[]
  >([]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    Promise.all(
      (aireq?.view?.projects ?? []).map(async (project) => ({
        project,
        view: await source.readWorkflow({ projectId: project.id }),
      })),
    )
      .then((views) => {
        if (active) setProjectViews(views);
      })
      .catch((cause) => {
        if (active) setLoadError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [source, aireq?.view, refreshKey]);
  if (!aireq) return null;
  const projects = aireq.view?.projects ?? [];
  const releaseCount = projectViews.reduce((count, item) => count + item.view.releases.length, 0);
  const canAdd = Boolean(
    employeeId === "j00808874" &&
    source.capabilities.settingsWrite &&
    source.projects?.saveRepository,
  );
  const canEdit = canAdd;
  const canSave = projectId ? canEdit : canAdd;
  const openProject = (project?: AIReqProject) => {
    setProjectRevision(project?.revision ?? 0);
    repositoryOperation.current = null;
    setProjectId(project?.id);
    setName(project?.name ?? "");
    setRepositoryUrl(project?.repositoryUrl ?? "");
    setDefaultBranch(project?.defaultBranch ?? "");
    setProjectError("");
    setMessage("");
    setProjectOpen(true);
  };
  const openRelease = (id: string) => {
    setReleaseProjectId(id);
    setReleaseTitle("");
    setReleaseError("");
    setReleaseOpen(true);
  };
  return (
    <section className="space-y-6" data-testid="aireq-project-settings">
      <p className="text-ui-sm leading-6 text-foreground-subtle">
        项目只配置 Git
        仓库和默认分支。当前只模拟保存，不拉取仓库，不配置本机目录。保存设置不触发拉取、创建分支或推送。
      </p>
      {loading && (
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-ui-base text-foreground-subtle">
            所有人查看同一份项目与 Release。当前工号：{employeeId}。
          </p>
          <p className="text-ui-sm text-foreground-subtle">
            {projects.length} 个项目 · {releaseCount} 个 Release
          </p>
        </div>
        {canAdd && (
          <Button onClick={() => openProject()}>
            <Plus className="size-4" />
            添加项目
          </Button>
        )}
      </div>
      {projectViews.map(({ project, view }) => (
        <SettingsGroupCard key={project.id}>
          <article data-project-id={project.id}>
            <header className="space-y-4 border-b border-border px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <FolderGit2 className="size-4 shrink-0 text-foreground-subtle" />
                  <h3 className="text-ui-base font-medium">{project.name}</h3>
                  <Badge variant="outline">Git 项目</Badge>
                  {aireq.selection.projectId === project.id && (
                    <Badge variant="secondary">当前项目</Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  disabled={!canEdit}
                  onClick={() => openProject(project)}
                  aria-label={`修改${project.name}仓库配置`}
                >
                  修改仓库配置
                </Button>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor={`repository-${project.id}`}>Git 仓库地址</Label>
                  <Input
                    id={`repository-${project.id}`}
                    value={project.repositoryUrl ?? "尚未配置"}
                    readOnly
                    className="font-mono text-ui-sm"
                  />
                </div>
                <p className="flex flex-wrap items-center gap-2 text-ui-sm text-foreground-subtle">
                  <GitBranch className="size-3.5" />
                  <span>默认分支：{project.defaultBranch}</span>
                  <span>· {view.releases.length} 个 Release</span>
                </p>
                {source.provenance.kind === "sample" && (
                  <p
                    className="text-ui-sm text-foreground-subtle"
                    data-testid={`repository-check-${project.id}`}
                  >
                    仓库连接：未检查 · 默认分支：未检查（原型未接入 Git
                    检查，配置已记录不等于检查通过）。
                  </p>
                )}
                <p className="text-ui-sm text-foreground-subtle">
                  仅共享模拟配置所有者（{source.backend?.owner ?? "j00808874"}）可修改项目与 Release
                  设置，其他账号只读。
                </p>
              </div>
              <Button
                variant="outline"
                disabled={
                  employeeId !== "j00808874" ||
                  !source.capabilities.workflowCommands.includes("createRelease")
                }
                onClick={() => openRelease(project.id)}
                aria-label={`为${project.name}添加 Release`}
              >
                <Plus className="size-3.5" />
                添加 Release
              </Button>
            </header>
            {view.releases.length ? (
              <ul className="divide-y divide-border">
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
                      <div className="min-w-0 space-y-1">
                        <p className="break-words text-ui-base font-medium">{release.title}</p>
                        {/* 修复原因：源版仅在存在提案时显示计数，避免零值占据 Release 摘要行。 */}
                        <p className="text-ui-sm text-foreground-subtle">
                          {groups.length} 个 IR · {srCount} 个 SR
                          {draftCount > 0 && ` · ${draftCount} 个需求提案`}
                        </p>
                        <p className="text-ui-sm text-foreground-subtle">
                          沿用项目 Git 仓库 · 默认分支 {project.defaultBranch}
                        </p>
                      </div>
                      <Badge variant="outline">{groups.length ? "已有需求" : "待规划"}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="space-y-2 px-4 py-6 text-ui-base text-foreground-subtle">
                <p>尚未添加 Release。创建第一个 Release，开始整理本项目的需求。</p>
                <Button
                  variant="outline"
                  disabled={
                    employeeId !== "j00808874" ||
                    !source.capabilities.workflowCommands.includes("createRelease")
                  }
                  onClick={() => openRelease(project.id)}
                >
                  添加第一个 Release
                </Button>
              </div>
            )}
          </article>
        </SettingsGroupCard>
      ))}
      {!loading && !loadError && !projects.length && (
        <p className="text-ui-base text-foreground-subtle">
          还没有项目。配置 Git 仓库与默认分支后，即可创建 Release。
        </p>
      )}
      <p role="status" className="text-ui-base text-foreground-subtle">
        {message}
      </p>
      {source.provenance.kind === "sample" && (
        <p className="text-ui-sm leading-6 text-foreground-subtle">
          项目、仓库配置与 Release
          由共享模拟后端内存持有，刷新保留、服务重启恢复。只检查输入格式，不连接 Git 或文件系统。
        </p>
      )}
      <Dialog
        open={projectOpen}
        onOpenChange={(open) => {
          if (!saving) setProjectOpen(open);
        }}
      >
        {/* 矮窗口中表单曾超出视口；限定弹窗高度，仅正文滚动，保留标题、关闭和底部动作。 */}
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>{projectId ? "修改仓库配置" : "添加项目"}</DialogTitle>
            <DialogDescription>
              配置远程 Git 仓库与默认分支，Release 沿用所属项目配置。保存仅记录配置，不执行 Git
              操作。
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!canSave || saving) return;
              setSaving(true);
              setProjectError("");
              try {
                validateRepository(name, repositoryUrl, defaultBranch);
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
                setMessage(
                  source.provenance.kind === "sample"
                    ? `已将“${name.trim()}”的配置保存到后端内存；仓库连接与默认分支未检查，未执行 Git 操作。`
                    : `已保存“${name.trim()}”的仓库配置；未执行 Git 操作。`,
                );
              } catch (cause) {
                setProjectError(cause instanceof Error ? cause.message : String(cause));
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="min-h-0 space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="project-name">项目名称</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  disabled={saving || !canSave}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-repository">Git 仓库地址</Label>
                <Input
                  id="project-repository"
                  value={repositoryUrl}
                  onChange={(event) => setRepositoryUrl(event.target.value)}
                  placeholder="ssh://git@git.example.internal/team/project.git"
                  required
                  disabled={saving || !canSave}
                  aria-describedby="project-repository-help"
                />
                <p id="project-repository-help" className="text-ui-sm text-foreground-subtle">
                  填写 HTTP(S)、SSH 或 git@host:path 格式的远程地址，不填写本地路径。
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-default-branch">默认分支</Label>
                <Input
                  id="project-default-branch"
                  value={defaultBranch}
                  onChange={(event) => setDefaultBranch(event.target.value)}
                  placeholder="例如 main 或 master"
                  required
                  disabled={saving || !canSave}
                />
              </div>
              {source.provenance.kind === "sample" && (
                <p className="text-ui-sm text-foreground-subtle">
                  仅校验输入格式；保存不会检查仓库连接或默认分支。原型不提供真实连接检查。
                </p>
              )}
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
                onClick={() => setProjectOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={
                  !canSave ||
                  saving ||
                  !name.trim() ||
                  !repositoryUrl.trim() ||
                  !defaultBranch.trim()
                }
              >
                {saving ? "保存中…" : projectId ? "保存配置" : "添加项目"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={releaseOpen}
        onOpenChange={(open) => {
          if (!releaseSaving) setReleaseOpen(open);
        }}
      >
        {/* Release 同样将正文约束在视口内，避免大字号时主要动作被裁切。 */}
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>添加 Release</DialogTitle>
            <DialogDescription>
              Release 属于所选项目，沿用其 Git 仓库和默认分支，不单独配置目录或仓库。
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!canAdd || releaseSaving || !releaseProjectId || !releaseTitle.trim()) return;
              setReleaseSaving(true);
              setReleaseError("");
              try {
                if (
                  (await source.readWorkflow({ projectId: releaseProjectId })).releases.some(
                    (release) => release.title.toLowerCase() === releaseTitle.trim().toLowerCase(),
                  )
                ) {
                  setReleaseError("此项目中已存在同名 Release，请使用其他名称。");
                  return;
                }
                const result = await aireq.command({
                  type: "createRelease",
                  projectId: releaseProjectId,
                  title: releaseTitle,
                });
                if (result?.status === "completed") {
                  setReleaseOpen(false);
                  setMessage(`已添加 Release“${releaseTitle.trim()}”。`);
                } else setReleaseError("未能添加 Release，请检查名称和所属项目。");
              } catch (cause) {
                setReleaseError(cause instanceof Error ? cause.message : String(cause));
              } finally {
                setReleaseSaving(false);
              }
            }}
          >
            <div className="min-h-0 space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="release-project">所属项目</Label>
                <Select
                  value={releaseProjectId}
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
                  Git 仓库：
                  {projects.find((project) => project.id === releaseProjectId)?.repositoryUrl ??
                    "尚未配置"}
                </p>
                <p>
                  默认分支：
                  {projects.find((project) => project.id === releaseProjectId)?.defaultBranch}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="release-name">Release 名称</Label>
                <Input
                  id="release-name"
                  placeholder="例如：2027.01 · 支付体验优化"
                  value={releaseTitle}
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
                onClick={() => setReleaseOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={
                  !canAdd ||
                  releaseSaving ||
                  !releaseTitle.trim() ||
                  !releaseProjectId ||
                  aireq.pending
                }
              >
                {releaseSaving ? "保存中…" : "添加 Release"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
