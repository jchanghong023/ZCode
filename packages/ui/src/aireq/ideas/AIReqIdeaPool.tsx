import { useCallback, useEffect, useRef, useState } from "react";
import { createUuid } from "@zcode/shared";
import { MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqIdea, AIReqIdeaTransfer, AIReqIdeaTarget } from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { newestReleaseFirst } from "../projects/AIReqProjectDocumentsPage.js";
import { AIReqIdeaImportExport } from "./AIReqIdeaImportExport.js";

type Target = AIReqIdeaTarget & { key: string };
type Draft = {
  mode: "edit" | "transfer";
  idea?: AIReqIdea;
  text: string;
  targets: Target[];
  operationId: string;
  expectedRevision?: number;
};
const IDEA_DRAFT_OWNER = "idea-draft";

export function AIReqIdeaPool({
  onConfigureProject,
}: {
  onConfigureProject(projectId: string): void;
}) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [failed, setFailed] = useState(false);
  const [discard, setDiscard] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const resumeTarget = useRef<string | null>(null);
  const dialogReturnFocus = useRef<HTMLButtonElement | null>(null);
  const ideaMenuTriggers = useRef(new Map<string, HTMLButtonElement>());
  const addIdeaButton = useRef<HTMLButtonElement | null>(null);
  const receiptPanel = useRef<HTMLElement | null>(null);
  const ideaEntries = useRef(new Map<string, HTMLButtonElement>());
  const [savedIdea, setSavedIdea] = useState<{ text: string; at: string; actor?: string }>();
  const [locateIdea, setLocateIdea] = useState(false);
  const [transferred, setTransferred] = useState<AIReqIdeaTransfer[]>([]);
  const { setDraftNavigationGuard, settingsOpen } = ai;
  useEffect(() => {
    // 转入会移除原行，旧滚动位置可能让页头回执完全离开视口。
    if (savedIdea || transferred.length) receiptPanel.current?.scrollIntoView({ block: "nearest" });
  }, [savedIdea, transferred]);
  const dirty = Boolean(
    draft &&
    (draft.mode === "transfer"
      ? draft.targets.some((target) => target.projectId || target.releaseId)
      : draft.text !== (draft.idea?.originalText ?? "")),
  );
  const guardDraftNavigation = useCallback((next: () => void) => {
    if (submitting.current || pendingNavigation.current) return;
    pendingNavigation.current = next;
    setDiscard(true);
  }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    if (!settingsOpen) setDraftNavigationGuard(guardDraftNavigation, IDEA_DRAFT_OWNER);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      setDraftNavigationGuard(null, IDEA_DRAFT_OWNER);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty, busy, settingsOpen, setDraftNavigationGuard, guardDraftNavigation]);
  const open = (mode: Draft["mode"], trigger: HTMLButtonElement, idea?: AIReqIdea) => {
    dialogReturnFocus.current = trigger;
    resumeTarget.current = null;
    setFailed(false);
    setDraft({
      mode,
      idea: idea ? { ...idea } : undefined,
      text: idea?.originalText ?? "",
      targets: [{ key: createUuid(), projectId: "", releaseId: "" }],
      operationId: createUuid(),
      expectedRevision: ai.view?.revision,
    });
  };
  const changeTarget = (key: string, value: Partial<AIReqIdeaTarget>) =>
    setDraft(
      (current) =>
        current && {
          ...current,
          operationId: createUuid(),
          targets: current.targets.map((target) =>
            target.key === key ? { ...target, ...value } : target,
          ),
        },
    );
  const configureRelease = (target: Target) => {
    resumeTarget.current = target.key;
    // 这是转入的续步。只让当前草稿放行这次设置导航，其他草稿仍走既有门禁。
    setDraftNavigationGuard(null, IDEA_DRAFT_OWNER);
    try {
      onConfigureProject(target.projectId);
    } finally {
      setDraftNavigationGuard(guardDraftNavigation, IDEA_DRAFT_OWNER);
    }
  };
  const targets = draft?.targets ?? [];
  const view = ai.view;
  const duplicate = targets.some(
    (target, index) =>
      target.projectId &&
      target.releaseId &&
      targets
        .slice(0, index)
        .some(
          (prior) => prior.projectId === target.projectId && prior.releaseId === target.releaseId,
        ),
  );
  const targetsReady =
    targets.length > 0 &&
    targets.every(
      (target) =>
        view?.projects.some((project) => project.id === target.projectId) &&
        view.releases.some(
          (release) => release.projectId === target.projectId && release.id === target.releaseId,
        ),
    );
  const canSave = Boolean(
    ai.view &&
    draft &&
    !busy &&
    (draft.mode === "edit"
      ? draft.text.trim() && draft.text.trim() !== draft.idea?.originalText
      : targetsReady && !duplicate),
  );
  const save = async () => {
    if (!draft || !canSave || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const metadata = {
        operationId: draft.operationId,
        expectedRevision: draft.expectedRevision ?? ai.view!.revision,
      };
      const result = await ai.command(
        draft.mode === "transfer" && draft.idea
          ? {
              ...metadata,
              type: "transferIdea",
              ideaId: draft.idea.id,
              ideaRevision: draft.idea.revision,
              targets: draft.targets.map(({ projectId, releaseId }) => ({ projectId, releaseId })),
            }
          : draft.idea
            ? {
                ...metadata,
                type: "updateIdea",
                ideaId: draft.idea.id,
                ideaRevision: draft.idea.revision,
                originalText: draft.text,
              }
            : { ...metadata, type: "createIdea", originalText: draft.text },
      );
      if (!result) {
        setFailed(true);
        return;
      }
      // 转入回执已消费原想法；旧行可能在关闭后才卸载，不能按关闭瞬间的 DOM 存活判断返回目标。
      if (draft.mode === "transfer") dialogReturnFocus.current = addIdeaButton.current;
      setSavedIdea(
        draft.mode === "edit" && !draft.idea
          ? {
              text: draft.text.trim(),
              at: result.receipt.startedAt,
              actor: result.receipt.actorEmployeeId,
            }
          : undefined,
      );
      setTransferred(result.transferredRequirements ?? []);
      setDraft(null);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const normalized = query.trim().toLocaleLowerCase();
  const ideas = ai.view?.ideas ?? [];
  const visible = ideas.filter(
    (idea) =>
      !normalized ||
      idea.originalText.toLocaleLowerCase().includes(normalized) ||
      idea.id.toLocaleLowerCase().includes(normalized),
  );
  const savedEntry = ideas.find(
    (idea) =>
      idea.createdAt === savedIdea?.at &&
      idea.originalText === savedIdea.text &&
      (!savedIdea.actor || idea.submittedBy === savedIdea.actor),
  );
  useEffect(() => {
    if (!locateIdea || !savedEntry) return;
    ideaEntries.current.get(savedEntry.id)?.focus();
    setLocateIdea(false);
  }, [locateIdea, savedEntry]);
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]"
      aria-label={zh ? "想法池" : "Ideas"}
    >
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-8`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "想法池" : "Ideas"}</h1>
            <p className="mt-1.5 text-ui-sm text-foreground-subtle">
              {zh
                ? "先记录还没排期的需求，确定后再转入项目版本。"
                : "Capture unscheduled requests here, then move them into a release."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <AIReqIdeaImportExport ideas={visible} filtered={Boolean(normalized)} />
            <Button
              ref={addIdeaButton}
              disabled={!ai.view || ai.pending}
              onClick={(event) => open("edit", event.currentTarget)}
            >
              <Plus className="size-4" aria-hidden="true" />
              {zh ? "新增想法" : "Add idea"}
            </Button>
          </div>
        </div>
        {savedIdea && (
          <section
            ref={receiptPanel}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3"
          >
            <p role="status" className="flex-1">
              {zh ? "想法已保存" : "Idea saved"}
            </p>
            {savedEntry && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setLocateIdea(true);
                }}
              >
                {zh ? "查看想法" : "Find idea"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSavedIdea(undefined)}>
              {zh ? "关闭" : "Dismiss"}
            </Button>
          </section>
        )}
        {transferred.length > 0 && (
          <section
            className="space-y-2 rounded-xl border border-border bg-surface p-3"
            ref={receiptPanel}
            aria-label={zh ? "转入结果" : "Transfer result"}
          >
            <div className="flex items-center gap-2">
              <p role="status" className="flex-1 text-ui-base">
                {zh
                  ? `已转入 ${transferred.length} 个版本，原想法已移出想法池。`
                  : `Transferred to ${transferred.length} releases. The original idea has left the pool.`}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setTransferred([])}>
                {zh ? "关闭" : "Dismiss"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {transferred.map((target) => (
                <Button
                  key={target.irId}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    ai.select(
                      {
                        projectId: target.projectId,
                        irId: target.irId,
                        discussionPhase: "requirements",
                      },
                      target.releaseId,
                    )
                  }
                >
                  {zh ? "需求 Agent · " : "Requirements Agent · "}
                  {ai.view?.projects.find((project) => project.id === target.projectId)?.name ??
                    target.projectId}{" "}
                  ·{" "}
                  {ai.view?.releases.find(
                    (release) =>
                      release.id === target.releaseId && release.projectId === target.projectId,
                  )?.title ?? target.releaseId}
                </Button>
              ))}
            </div>
          </section>
        )}
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            aria-label={zh ? "搜索想法" : "Search ideas"}
            placeholder={zh ? "搜索原始需求…" : "Search requirements…"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {ai.view && (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card text-foreground">
            <table className="w-full text-left text-ui-base">
              <thead className="bg-card text-ui-sm text-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    {zh ? "原始需求" : "Original requirement"}
                  </th>
                  <th className="hidden px-4 py-3 font-medium @min-[640px]/conversation:table-cell">
                    {zh ? "提交人" : "Submitted by"}
                  </th>
                  <th className="hidden px-4 py-3 font-medium @min-[640px]/conversation:table-cell">
                    {zh ? "提交时间" : "Submitted"}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    {zh ? "操作" : "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((idea) => (
                  <tr key={idea.id} data-aireq-motion-row="" className="border-t border-border">
                    {/* 想法池此前漏接共享行标记；只平移需求正文，元数据和操作列保持原位。 */}
                    <td data-aireq-motion-cell="" className="max-w-lg px-4 py-4">
                      <Button
                        ref={(node) => {
                          if (node) ideaEntries.current.set(idea.id, node);
                          else ideaEntries.current.delete(idea.id);
                        }}
                        variant="link"
                        className="h-auto max-w-full justify-start whitespace-pre-wrap break-words p-0 text-left text-foreground"
                        onClick={(event) => open("edit", event.currentTarget, idea)}
                      >
                        {idea.originalText}
                      </Button>
                      <p className="mt-1 text-ui-sm text-foreground-subtle @min-[640px]/conversation:hidden">
                        {idea.submittedBy} · {new Date(idea.createdAt).toLocaleString(locale)}
                      </p>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-4 text-ui-caption text-foreground-subtle @min-[640px]/conversation:table-cell">
                      {idea.submittedBy}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-4 text-ui-sm text-foreground-subtle @min-[640px]/conversation:table-cell">
                      {new Date(idea.createdAt).toLocaleString(locale)}
                    </td>
                    <td className="px-2 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            ref={(node) => {
                              if (node) ideaMenuTriggers.current.set(idea.id, node);
                              else ideaMenuTriggers.current.delete(idea.id);
                            }}
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg text-foreground-subtle hover:text-foreground focus-visible:text-foreground"
                            aria-label={
                              zh
                                ? `${idea.originalText} 的更多操作`
                                : `More actions for ${idea.originalText}`
                            }
                          >
                            <MoreHorizontal aria-hidden="true" className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          onCloseAutoFocus={(event) => {
                            // 菜单项打开转入弹窗后已卸载，不能让菜单关闭回焦抢走表单焦点。
                            if (draft?.idea?.id === idea.id) event.preventDefault();
                          }}
                        >
                          <DropdownMenuItem
                            onSelect={() => {
                              const trigger = ideaMenuTriggers.current.get(idea.id);
                              if (trigger) open("transfer", trigger, idea);
                            }}
                          >
                            {zh ? "转入项目版本" : "Move to project releases"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p role="status" className="px-4 py-12 text-center text-ui-sm text-foreground-subtle">
                {ai.error
                  ? zh
                    ? "想法池读取失败，请重试。"
                    : "Could not read ideas. Retry."
                  : ai.pending
                    ? zh
                      ? "正在读取想法池…"
                      : "Loading ideas…"
                    : normalized
                      ? zh
                        ? "没有匹配的想法。"
                        : "No matching ideas."
                      : zh
                        ? "暂无想法。先记录需求，确定项目和版本后再转入。"
                        : "No ideas yet. Capture a requirement and move it when its project and release are known."}
              </p>
            )}
          </div>
        )}
        {ai.view && (
          <p role="status" className="text-ui-sm text-foreground-subtle">
            {normalized
              ? `${visible.length} / ${ideas.length}`
              : zh
                ? `共 ${ideas.length} 条想法`
                : `${ideas.length} ideas`}
          </p>
        )}
        <Dialog
          open={Boolean(draft) && !settingsOpen}
          onOpenChange={(value) => {
            if (!value && !submitting.current) ai.navigate(() => setDraft(null));
          }}
        >
          <DialogContent
            className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-2xl"
            onOpenAutoFocus={(event) => {
              const key = resumeTarget.current;
              if (!key) return;
              resumeTarget.current = null;
              const release = document.getElementById(`idea-release-${key}`);
              const target = release?.matches(":enabled")
                ? release
                : document.getElementById(`idea-configure-release-${key}`);
              if (target) {
                event.preventDefault();
                target.focus();
              }
              // 配置可能新增 Release；采用当前工作流基线，仍用原想法 revision 校验转入。
              setDraft((current) => current && { ...current, expectedRevision: undefined });
            }}
            onCloseAutoFocus={(event) => {
              // 受控弹窗没有 DialogTrigger；转入成功还会移除原行，需回到仍在页内的新增入口。
              event.preventDefault();
              if (resumeTarget.current) return;
              const trigger = dialogReturnFocus.current;
              if (trigger?.isConnected) trigger.focus();
              else addIdeaButton.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <DialogHeader>
              {/* 转入支持同项目多版本，生成的是独立提案；避免旧文案暗示必须跨项目或直接形成正式需求。 */}
              <DialogTitle>
                {draft?.mode === "transfer"
                  ? zh
                    ? "转入项目版本"
                    : "Move to project releases"
                  : draft?.idea
                    ? zh
                      ? "编辑想法"
                      : "Edit idea"
                    : zh
                      ? "新增想法"
                      : "Add idea"}
              </DialogTitle>
              <DialogDescription>
                {draft?.mode === "transfer"
                  ? zh
                    ? "可选择同一项目或不同项目的多个版本。全部转入成功后，原想法将移出想法池，每个目标版本生成一条独立提案。"
                    : "Choose multiple releases within the same project or across projects. Once all transfers succeed, the idea leaves the pool and each target release gets an independent proposal."
                  : zh
                    ? "记录原始需求，暂时不需要确定项目、版本或实施时间。"
                    : "Capture the original requirement without choosing a project, release or date."}
              </DialogDescription>
            </DialogHeader>
            {draft?.mode === "edit" ? (
              <div className="space-y-2">
                <Label htmlFor="idea-original-text">
                  {zh ? "原始需求" : "Original requirement"}
                </Label>
                <SettingsFormTextarea
                  id="idea-original-text"
                  value={draft.text}
                  disabled={busy}
                  className="min-h-40"
                  onChange={(event) => {
                    const text = event.target.value;
                    setDraft(
                      (current) => current && { ...current, text, operationId: createUuid() },
                    );
                  }}
                />
              </div>
            ) : (
              draft && (
                <div className="space-y-4">
                  <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-surface p-3 text-ui-base">
                    {draft.idea?.originalText}
                  </p>
                  {targets.map((target, index) => {
                    const releases = view?.releases
                      .filter((release) => release.projectId === target.projectId)
                      .sort(newestReleaseFirst);
                    const hasProject = view?.projects.some(({ id }) => id === target.projectId);
                    const needsRelease = hasProject && releases?.length === 0;
                    const releasePlaceholder = needsRelease
                      ? zh
                        ? "暂无版本"
                        : "No releases"
                      : zh
                        ? "选择版本"
                        : "Choose release";
                    return (
                      <div key={target.key} className="space-y-2">
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                          <div className="min-w-0 space-y-2">
                            <Label htmlFor={`idea-project-${target.key}`}>
                              {zh ? `目标项目 ${index + 1}` : `Project ${index + 1}`}
                            </Label>
                            <Select
                              value={target.projectId}
                              disabled={busy}
                              onValueChange={(projectId) =>
                                changeTarget(target.key, { projectId, releaseId: "" })
                              }
                            >
                              <SelectTrigger id={`idea-project-${target.key}`} className="w-full">
                                <SelectValue placeholder={zh ? "选择项目" : "Choose project"} />
                              </SelectTrigger>
                              <SelectContent>
                                {ai.view?.projects.map((project) => (
                                  <SelectItem key={project.id} value={project.id}>
                                    {project.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="min-w-0 space-y-2">
                            <Label htmlFor={`idea-release-${target.key}`}>
                              {/* 多目标必须与项目共用编号，否则读屏中的版本控件名称完全相同。 */}
                              {zh ? `目标版本 ${index + 1}` : `Release ${index + 1}`}
                            </Label>
                            <Select
                              value={target.releaseId}
                              disabled={busy || !releases?.length}
                              onValueChange={(releaseId) => changeTarget(target.key, { releaseId })}
                            >
                              <SelectTrigger id={`idea-release-${target.key}`} className="w-full">
                                <SelectValue placeholder={releasePlaceholder} />
                              </SelectTrigger>
                              <SelectContent>
                                {releases?.map((release, index) => (
                                  <SelectItem key={release.id} value={release.id}>
                                    {release.title}
                                    {index === 0 ? (zh ? "（最近版本）" : " (latest)") : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={zh ? `移除目标 ${index + 1}` : `Remove target ${index + 1}`}
                            disabled={busy || targets.length === 1}
                            onClick={() =>
                              setDraft(
                                (current) =>
                                  current && {
                                    ...current,
                                    operationId: createUuid(),
                                    targets: current.targets.filter(
                                      (item) => item.key !== target.key,
                                    ),
                                  },
                              )
                            }
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                        {needsRelease && (
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              id={`idea-release-help-${target.key}`}
                              className="text-ui-sm text-foreground-subtle"
                            >
                              {zh
                                ? "请先为此项目添加版本。返回后可继续转入。"
                                : "Add a release for this project, then return to continue."}
                            </p>
                            <Button
                              id={`idea-configure-release-${target.key}`}
                              aria-describedby={`idea-release-help-${target.key}`}
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => configureRelease(target)}
                            >
                              {zh ? "配置版本" : "Configure releases"}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      setDraft(
                        (current) =>
                          current && {
                            ...current,
                            operationId: createUuid(),
                            targets: [
                              ...current.targets,
                              { key: createUuid(), projectId: "", releaseId: "" },
                            ],
                          },
                      )
                    }
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {zh ? "添加目标项目／版本" : "Add project / release"}
                  </Button>
                  {duplicate && (
                    <p role="alert" className="text-ui-sm text-destructive">
                      {zh
                        ? "不能重复选择同一项目和版本。"
                        : "Each project and release combination must be unique."}
                    </p>
                  )}
                  {view && !view.projects.length && (
                    <p role="status" className="text-ui-sm text-foreground-subtle">
                      {zh
                        ? "请在项目配置中添加项目和版本后再转入。"
                        : "Add a project and release in project settings before transferring."}
                    </p>
                  )}
                </div>
              )
            )}
            {failed && (
              <div className="space-y-2">
                <p role="alert" className="text-ui-sm text-destructive">
                  {ai.error ??
                    (zh
                      ? "操作未完成，输入已保留。"
                      : "The operation did not complete. Your input is retained.")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || ai.pending}
                  onClick={async () => {
                    await ai.refresh();
                    setDraft((current) => current && { ...current, expectedRevision: undefined });
                  }}
                >
                  {zh ? "刷新版本后重试" : "Refresh before retrying"}
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => ai.navigate(() => setDraft(null))}
              >
                {zh ? "取消" : "Cancel"}
              </Button>
              <Button disabled={!canSave} onClick={() => void save()}>
                {busy
                  ? zh
                    ? "正在提交…"
                    : "Submitting…"
                  : draft?.mode === "transfer"
                    ? zh
                      ? "确认转入"
                      : "Confirm transfer"
                    : zh
                      ? "保存想法"
                      : "Save idea"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={discard}
          onOpenChange={(value) => {
            setDiscard(value);
            if (!value) pendingNavigation.current = null;
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {zh ? "放弃未保存的内容？" : "Discard unsaved changes?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {zh
                  ? draft?.mode === "transfer"
                    ? "所选目标版本尚未提交，离开将放弃选择。"
                    : "想法正文尚未保存，离开将放弃修改。"
                  : draft?.mode === "transfer"
                    ? "Leaving will discard your release choices."
                    : "Leaving will discard your changes to the idea."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  pendingNavigation.current = null;
                }}
              >
                {zh ? "继续编辑" : "Keep editing"}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  const next = pendingNavigation.current;
                  pendingNavigation.current = null;
                  setDraft(null);
                  setDraftNavigationGuard(null, IDEA_DRAFT_OWNER);
                  setDiscard(false);
                  next?.();
                }}
              >
                {zh ? "放弃修改" : "Discard changes"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
