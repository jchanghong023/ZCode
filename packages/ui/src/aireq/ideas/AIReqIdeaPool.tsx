import { useEffect, useRef, useState } from "react";
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

export function AIReqIdeaPool() {
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
  const dialogReturnFocus = useRef<HTMLButtonElement | null>(null);
  const ideaMenuTriggers = useRef(new Map<string, HTMLButtonElement>());
  const addIdeaButton = useRef<HTMLButtonElement | null>(null);
  const [transferred, setTransferred] = useState<AIReqIdeaTransfer[]>([]);
  const { setDraftNavigationGuard } = ai;
  const dirty = Boolean(
    draft &&
    (draft.mode === "transfer"
      ? draft.targets.some((target) => target.projectId || target.releaseId)
      : draft.text !== (draft.idea?.originalText ?? "")),
  );
  useEffect(() => {
    if (!dirty && !busy) return;
    setDraftNavigationGuard((next) => {
      if (submitting.current || pendingNavigation.current) return;
      pendingNavigation.current = next;
      setDiscard(true);
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      setDraftNavigationGuard(null);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty, busy, setDraftNavigationGuard]);
  const open = (mode: Draft["mode"], trigger: HTMLButtonElement, idea?: AIReqIdea) => {
    dialogReturnFocus.current = trigger;
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
  const targets = draft?.targets ?? [];
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
        ai.view?.projects.some((project) => project.id === target.projectId) &&
        ai.view.availableReleases.some(
          (release) => release.projectId === target.projectId && release.id === target.releaseId,
        ),
    );
  const canSave = Boolean(
    ai.view &&
    draft &&
    !busy &&
    (draft.mode === "edit" ? draft.text.trim() : targetsReady && !duplicate),
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
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]"
      aria-label={zh ? "想法池" : "Ideas"}
    >
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-8`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "想法池" : "Ideas"}</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <AIReqIdeaImportExport ideas={visible} />
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
        {transferred.length > 0 && (
          <section
            className="space-y-2 rounded-xl border border-border bg-surface p-3"
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
                    ai.navigate(() =>
                      ai.select(
                        { projectId: target.projectId, irId: target.irId },
                        target.releaseId,
                      ),
                    )
                  }
                >
                  {ai.view?.projects.find((project) => project.id === target.projectId)?.name ??
                    target.projectId}{" "}
                  ·{" "}
                  {ai.view?.availableReleases.find(
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
          // 原表格透出页面底色且正文沿用链接主色；与外观页统一卡片底色和主次文字角色。
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card text-foreground">
            <table className="w-full text-left text-ui-base">
              <thead className="bg-card text-ui-sm text-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    {zh ? "原始需求" : "Original requirement"}
                  </th>
                  <th className="px-4 py-3 font-medium">{zh ? "提交人" : "Submitted by"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "提交时间" : "Submitted"}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    {zh ? "操作" : "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((idea) => (
                  <tr
                    key={idea.id}
                    data-aireq-motion-row=""
                    className="group/row border-t border-border"
                  >
                    {/* 想法池此前漏接共享行标记；只平移需求正文，元数据和操作列保持原位。 */}
                    <td data-aireq-motion-cell="" className="max-w-lg px-4 py-4">
                      <Button
                        variant="link"
                        className="h-auto max-w-full justify-start whitespace-pre-wrap break-words p-0 text-left text-foreground-subtle hover:text-foreground"
                        onClick={(event) => open("edit", event.currentTarget, idea)}
                      >
                        {idea.originalText}
                      </Button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">{idea.submittedBy}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-ui-sm text-foreground-subtle">
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
                            // 行内操作统一默认隐藏（spec：全局想法池）：行悬停／键盘聚焦／菜单展开时显现，保持表格安静。
                            className="pointer-events-none size-8 rounded-lg text-foreground-subtle opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 hover:text-foreground focus-visible:pointer-events-auto focus-visible:text-foreground focus-visible:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100"
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
          open={Boolean(draft)}
          onOpenChange={(value) => {
            if (!value && !submitting.current) ai.navigate(() => setDraft(null));
          }}
        >
          <DialogContent
            className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-2xl"
            onCloseAutoFocus={(event) => {
              // 受控弹窗没有 DialogTrigger；转入成功还会移除原行，需回到仍在页内的新增入口。
              event.preventDefault();
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
                  {targets.map((target, index) => (
                    <div
                      key={target.key}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
                    >
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
                          disabled={busy || !target.projectId}
                          onValueChange={(releaseId) => changeTarget(target.key, { releaseId })}
                        >
                          <SelectTrigger id={`idea-release-${target.key}`} className="w-full">
                            <SelectValue placeholder={zh ? "选择版本" : "Choose release"} />
                          </SelectTrigger>
                          <SelectContent>
                            {ai.view?.availableReleases
                              .filter((release) => release.projectId === target.projectId)
                              .map((release) => (
                                <SelectItem key={release.id} value={release.id}>
                                  {release.title}
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
                                targets: current.targets.filter((item) => item.key !== target.key),
                              },
                          )
                        }
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
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
                  {(!ai.view?.projects.length ||
                    targets.some(
                      (target) =>
                        target.projectId &&
                        !ai.view?.availableReleases.some(
                          (release) => release.projectId === target.projectId,
                        ),
                    )) && (
                    <p role="status" className="text-ui-sm text-foreground-subtle">
                      {zh
                        ? "目标项目尚无可用版本，请在原有项目配置中添加后再转入。当前想法会保留。"
                        : "Add a release in project settings before transferring. The idea will remain in the pool."}
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
                  ? "原文和目标选择尚未提交，离开将放弃这些修改。"
                  : "The requirement or release choices have not been saved. Leaving will discard these changes."}
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
                  setDraftNavigationGuard(null);
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
