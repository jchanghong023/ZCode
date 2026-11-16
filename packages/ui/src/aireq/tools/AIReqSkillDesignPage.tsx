import type { PanelImperativeHandle } from "react-resizable-panels";
import { AIReqSkillFilePreview } from "./AIReqSkillFilePreview.js";
import { createUuid } from "@zcode/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileCode2,
  MessageSquare,
  WandSparkles,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from "@/components/ui/resizable.js";
import { Button } from "@/components/ui/button.js";
import { Label } from "@/components/ui/label.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import { AIReqSessionPane } from "../conversation/AIReqSessionPane.js";
import type { ExternalTextInsertRequest } from "@/v4/ConversationComposer.js";
import { useAIReqDataSource } from "../data-source.js";
import { useAIReq } from "../AIReqContext.js";
import type {
  AIReqSettingsDraftActions,
  AIReqSkillDesignDraft,
  AIReqSkillDesignPreview,
} from "../contract.js";
import type { SkillSummary } from "@zcode/shared";
import { AIReqSkillBriefForm } from "./AIReqSkillBriefForm.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME } from "../shell/pageLayout.js";
import { cn } from "@/components/lib/utils.js";

type SkillDesignPageProps = {
  active: boolean;
  onDraftActionsChange: (actions: AIReqSettingsDraftActions | null) => void;
};

type ComposerInputPreview = { text: string; summary: string };

const skillDesignPanels = ["skill-brief", "skill-conversation"];

export function AIReqSkillDesignPage({ active, onDraftActionsChange }: SkillDesignPageProps) {
  const source = useAIReqDataSource();
  const aireq = useAIReq();
  const project = aireq?.view?.projects.find((item) => item.id === aireq.selection.projectId);
  const developmentRoot = project
    ? source.projects?.readDevelopmentRoot(project.id, source.backend?.owner)
    : undefined;
  return (
    <section
      className={cn(AIREQ_PAGE_CONTENT_CLASSNAME, "flex min-h-0 flex-1 flex-col overflow-hidden bg-background pb-4 lg:pb-4")}
      aria-label="Skill 设计"
    >
      {source.skillDesign ? (
        <SkillDesignEditor
          key={`${source.backend?.id}:${project?.id ?? "personal"}`}
          projectId={project?.id ?? "personal"}
          projectName={project?.name ?? "未选择项目"}
          workspacePath={developmentRoot ?? source.backend?.configDirectory ?? ""}
          developmentRoot={developmentRoot}
          active={active}
          onDraftActionsChange={onDraftActionsChange}
        />
      ) : (
        <p role="status" className="text-ui-sm text-foreground-subtle">
          技能设计暂不可用，请稍后重试。
        </p>
      )}
    </section>
  );
}

function SkillDesignEditor({
  projectId,
  projectName,
  workspacePath,
  developmentRoot,
  active,
  onDraftActionsChange,
}: {
  projectId: string;
  projectName: string;
  workspacePath: string;
  developmentRoot?: string;
} & SkillDesignPageProps) {
  const source = useAIReqDataSource();
  const design = source.skillDesign!;
  const [session, setSession] = useState<{ id: string; identity: string }>();
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setSession(undefined);
    setLoadError("");
    void (async () => {
      try {
        const id = await design.session(projectId);
        const identity = await design.workspaceIdentity(projectId);
        if (active) setSession({ id, identity });
      } catch (cause) {
        if (active) setLoadError(cause instanceof Error ? cause.message : "加载技能设计会话失败。");
      }
    })();
    return () => {
      active = false;
    };
  }, [design, projectId, attempt]);
  if (loadError)
    return (
      <div className="space-y-2">
        <p role="alert" className="text-ui-sm text-destructive">
          {loadError}
        </p>
        <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
          重试
        </Button>
      </div>
    );
  if (!session)
    return (
      <p role="status" className="text-ui-sm text-foreground-subtle">
        正在加载技能设计会话…
      </p>
    );
  return (
    <ReadySkillDesignEditor
      key={session.id}
      {...{ projectId, projectName, workspacePath, developmentRoot }}
      active={active}
      onDraftActionsChange={onDraftActionsChange}
      sessionId={session.id}
      identity={session.identity}
    />
  );
}

function ReadySkillDesignEditor({
  projectId,
  projectName,
  workspacePath,
  developmentRoot,
  sessionId,
  identity,
  active: editorActive,
  onDraftActionsChange,
}: {
  projectId: string;
  projectName: string;
  workspacePath: string;
  developmentRoot?: string;
  sessionId: string;
  identity: string;
} & SkillDesignPageProps) {
  const source = useAIReqDataSource();
  const design = source.skillDesign!;
  const scope = useMemo(
    () => ({ workspacePath, workspaceIdentity: `${identity}:skill-design` }),
    [workspacePath, identity],
  );
  const [draft, setDraft] = useState<AIReqSkillDesignDraft>();
  const [preview, setPreview] = useState<AIReqSkillDesignPreview>();
  const [temporaryDirectory, setTemporaryDirectory] = useState("");
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  const active = useRef(true);
  const draftVersion = useRef(0);
  const pendingDraftSaves = useRef(0);
  const [pendingDraftSaveCount, setPendingDraftSaveCount] = useState(0);
  const draftSave = useRef<Promise<void>>(Promise.resolve());
  const draftSaveError = useRef<unknown>(undefined);
  const [draftUnsettled, setDraftUnsettled] = useState(false);
  const [discardedRevision, setDiscardedRevision] = useState<number>();
  const currentActions = useRef<AIReqSettingsDraftActions | null>(null);
  const [tab, setTab] = useState("chat");
  const briefPanel = useRef<PanelImperativeHandle | null>(null);
  const [briefOpen, setBriefOpen] = useState(true);
  const [composerInputPreview, setComposerInputPreview] = useState<ComposerInputPreview>();
  const [insertRequest, setInsertRequest] = useState<ExternalTextInsertRequest | null>(null);
  const requestId = useRef(0);
  const pendingInsert = useRef<(ExternalTextInsertRequest & { summary: string }) | null>(null);
  const lastFilledText = useRef<string | undefined>(undefined);
  const [fillError, setFillError] = useState("");
  const [selectedFile, setSelectedFile] = useState("SKILL.md");
  const [saveTarget, setSaveTarget] = useState<"project" | "user">(
    developmentRoot ? "project" : "user",
  );
  const previewRevision = useRef<number | undefined>(undefined);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const saveOperation = useRef<{ key: string; id: string } | undefined>(undefined);
  const targetName = preview?.name ?? "";
  const validName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(targetName) && targetName.length <= 64;
  const targetDirectory = !preview
    ? undefined
    : saveTarget === "user"
      ? source.backend?.userSkillsDirectory
        ? `${source.backend.userSkillsDirectory}/${targetName}`
        : undefined
      : developmentRoot
        ? `${developmentRoot}/.omp/skills/${targetName}`
        : undefined;
  const collision = skills.some((skill) => skill.path === `${targetDirectory}/SKILL.md`);
  const file = preview?.files.find((item) => item.path === selectedFile) ?? preview?.files[0];
  const generationStatus = savedPath
    ? `第 ${preview?.revision} 版已保存。`
    : preview
      ? `第 ${preview.revision} 版 · 待确认保存`
      : "";
  const updateDraft = (next: AIReqSkillDesignDraft) => {
    setDraft(next);
    setDraftUnsettled(true);
    setNotice("");
    const version = ++draftVersion.current;
    pendingDraftSaves.current++;
    setPendingDraftSaveCount(pendingDraftSaves.current);
    const save = draftSave.current.then(async () => {
      await design.saveDraft(sessionId, next);
    });
    draftSave.current = save.catch(() => {});
    return save
      .then(
        () => {
          if (version === draftVersion.current) {
            draftSaveError.current = undefined;
            if (active.current) setError("");
            if (active.current) setDraftUnsettled(false);
          }
          return true;
        },
        (cause) => {
          if (version === draftVersion.current) {
            draftSaveError.current = cause;
            if (active.current)
              setError(cause instanceof Error ? cause.message : "保存技能说明失败。");
          }
          return false;
        },
      )
      .finally(() => {
        pendingDraftSaves.current--;
        if (active.current) setPendingDraftSaveCount(pendingDraftSaves.current);
      });
  };
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  useEffect(() => {
    active.current = true;
    let disposed = false;
    let revision = 0;
    const refresh = async () => {
      const request = ++revision;
      const editVersion = draftVersion.current;
      const canReadDraft = pendingDraftSaves.current === 0 && !draftSaveError.current;
      try {
        const [nextDraft, next, directory, nextSkills] = await Promise.all([
          design.read(sessionId),
          design.readPreview(sessionId),
          design.temporaryDirectory(sessionId),
          design.listSkills(workspacePath),
        ]);
        if (disposed || request !== revision) return;
        // 表单编辑由本地序列保护；对话追加 notes 则仍以服务端事实更新。
        setDraft((current) =>
          canReadDraft && pendingDraftSaves.current === 0 && editVersion === draftVersion.current
            ? nextDraft
            : current
              ? { ...current, notes: nextDraft.notes }
              : current,
        );
        if (previewRevision.current !== next?.revision) {
          setSavedPath("");
          setNotice("");
          setFillError("");
          pendingInsert.current = null;
          setInsertRequest(null);
        }
        previewRevision.current = next?.revision;
        setPreview(next);
        setSavedPath(
          next?.savedReceipt?.revision === next?.revision ? (next?.savedReceipt?.path ?? "") : "",
        );
        if (next?.savedReceipt?.revision === next?.revision && next?.savedReceipt)
          setSaveTarget(next.savedReceipt.target);
        setTemporaryDirectory(directory);
        setSkills(nextSkills);
        if (!draftSaveError.current) setError("");
        setLoading(false);
      } catch (cause) {
        if (disposed || request !== revision) return;
        setError(cause instanceof Error ? cause.message : "加载技能设计数据失败。");
        setLoading(false);
      }
    };
    const subscription = design.subscribe((id) => {
      if (id === sessionId) void refresh();
    });
    void refresh();
    return () => {
      disposed = true;
      active.current = false;
      subscription.dispose();
    };
  }, [design, sessionId, workspacePath, refreshAttempt]);
  const handleInsertApplied = useCallback((appliedId: number) => {
    const pending = pendingInsert.current;
    if (pending?.requestId !== appliedId) return;
    lastFilledText.current = pending.text;
    // 摘要只能跟随原生 editor 已提交且落入原 scope 的 ACK，不能把待处理请求当作正文事实。
    setComposerInputPreview({ text: pending.text, summary: pending.summary });
    pendingInsert.current = null;
    setFillError("");
    setInsertRequest(null);
    setNotice("已准备好，尚未发送。请到右侧核对后发送。");
  }, []);
  const fillComposer = async () => {
    setTab("chat");
    if (pendingInsert.current || filling || !draft) return;
    setNotice("");
    setFillError("");
    setFilling(true);
    try {
      await draftSave.current;
      if (draftSaveError.current) throw draftSaveError.current;
      const text = await design.prompt(sessionId, draft);
      if (!active.current) return;
      const request: ExternalTextInsertRequest & { summary: string } = {
        requestId: ++requestId.current,
        text,
        mode: "append",
        replaceText: lastFilledText.current,
        summary: draft.goal.trim() || "已整理技能说明，可展开核对全部内容。",
      };
      pendingInsert.current = request;
      setInsertRequest(request);
    } catch (cause) {
      if (active.current)
        setFillError(cause instanceof Error ? cause.message : "生成聊天说明失败。");
    } finally {
      if (active.current) setFilling(false);
    }
  };
  useEffect(() => {
    if (!insertRequest) return;
    const timer = window.setTimeout(() => {
      if (pendingInsert.current?.requestId !== insertRequest.requestId) return;
      pendingInsert.current = null;
      setInsertRequest(null);
      setNotice("");
      setFillError("聊天输入框尚未就绪，未确认填入成功。请稍后重试；表单内容已保留。");
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [insertRequest]);
  const save = async () => {
    if (!targetDirectory || !preview || !validName || collision || savedPath || saving) return false;
    const revision = preview.revision;
    const key = `${sessionId}:${revision}:${saveTarget}:${targetName}`;
    if (saveOperation.current?.key !== key) saveOperation.current = { key, id: createUuid() };
    const operationId = saveOperation.current.id;
    setSaving(true);
    try {
      await draftSave.current;
      if (draftSaveError.current) throw draftSaveError.current;
      const receipt = await design.savePreview(
        sessionId,
        developmentRoot ?? "",
        targetName,
        saveTarget,
        revision,
        operationId,
      );
      if (!active.current || previewRevision.current !== revision) return false;
      setSavedPath(receipt.path);
      setError("");
      setNotice("");
      setFillError("");
      return true;
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : "保存失败。");
      return false;
    } finally {
      if (active.current) setSaving(false);
    }
  };
  const unsavedPreview = Boolean(preview && !savedPath && preview.revision !== discardedRevision);
  const dirty = draftUnsettled || unsavedPreview;
  // 说明待结算不能绕过预览校验；失败与在途写入分开，失败后仍可显式丢弃离开。
  const canSave =
    !saving && (!unsavedPreview || Boolean(targetDirectory && validName && !collision));
  const canDiscard = pendingDraftSaveCount === 0 && !saving;
  // 禁用保存时在离开弹窗说明当前预览的具体阻断原因，避免用户面对无反馈的按钮。
  const saveBlockedReason = !unsavedPreview
    ? undefined
    : !validName
      ? "技能标识无效，请取消并返回对话调整标识。"
      : collision
        ? "所选目标已有同名技能，请取消并返回对话调整标识或选择其他保存目标。"
        : !targetDirectory
          ? "保存目标不可用，请取消并返回临时文件预览选择有效目标。"
          : undefined;
  currentActions.current = {
    canSave,
    canDiscard,
    save: async () => {
      if (!canSave) return false;
      await draftSave.current;
      if (draftSaveError.current && (!draft || !(await updateDraft(draft)))) return false;
      return unsavedPreview ? save() : true;
    },
    discard: () => {
      if (pendingDraftSaves.current || saving) return;
      // 丢弃仅接纳离开，不清除失败或草稿，也不伪造写入成功；返回后仍可明确重试。
      setDraftUnsettled(false);
      setDiscardedRevision(preview?.revision);
    },
  };
  useEffect(() => {
    onDraftActionsChange(
      dirty
        ? {
            canSave,
            canDiscard,
            saveBlockedReason,
            save: () => currentActions.current?.save() ?? false,
            discard: () => currentActions.current?.discard(),
          }
        : null,
    );
    return () => onDraftActionsChange(null);
  }, [dirty, canSave, canDiscard, saveBlockedReason, onDraftActionsChange]);
  if (loading)
    return (
      <p role="status" className="text-ui-sm text-foreground-subtle">
        正在加载技能设计数据…
      </p>
    );
  if (!draft)
    return (
      <div className="space-y-2">
        <p role="alert" className="text-ui-sm text-destructive">
          {error || "加载技能设计数据失败。"}
        </p>
        <Button variant="outline" onClick={() => setRefreshAttempt((value) => value + 1)}>
          重试
        </Button>
      </div>
    );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" data-testid="aireq-skill-design">
      {error && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-ui-sm text-destructive">
            {error}
          </p>
          {Boolean(draftSaveError.current) && (
            <Button
              variant="ghost"
              disabled={pendingDraftSaveCount > 0 || saving}
              onClick={() => void updateDraft(draft)}
            >
              重试保存说明
            </Button>
          )}
          <Button variant="ghost" onClick={() => setRefreshAttempt((value) => value + 1)}>
            重新读取
          </Button>
        </div>
      )}
      <ResizablePanelGroup
        layoutId="aireq-skill-design-layout-v1"
        panelIds={skillDesignPanels}
        className="min-h-0 flex-1"
      >
        <ResizablePanel
          id="skill-brief"
          panelRef={briefPanel}
          defaultSize="40%"
          minSize="280px"
          maxSize="60%"
          collapsible
          collapsedSize="0px"
          onResize={(size) => setBriefOpen(size.asPercentage > 0)}
        >
          <AIReqSkillBriefForm
            draft={draft}
            briefOpen={briefOpen}
            temporaryDirectory={temporaryDirectory}
            fillError={fillError}
            insertPending={Boolean(insertRequest)}
            notice={notice}
            filling={filling}
            updateDraft={updateDraft}
            fillComposer={fillComposer}
          />
        </ResizablePanel>
        {briefOpen && <ResizableHandle />}
        <ResizablePanel id="skill-conversation" defaultSize="60%" minSize="360px">
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border"
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={briefOpen ? "收起技能说明" : "展开技能说明"}
                  title={briefOpen ? "收起技能说明" : "展开技能说明"}
                  aria-expanded={briefOpen}
                  aria-controls="skill-design-brief"
                  onClick={() => {
                    if (briefPanel.current?.isCollapsed()) briefPanel.current.expand();
                    else briefPanel.current?.collapse();
                  }}
                >
                  {briefOpen ? (
                    <PanelLeftClose className="size-4" />
                  ) : (
                    <PanelLeftOpen className="size-4" />
                  )}
                </Button>
                <TabsList aria-label="技能设计工作区">
                  <TabsTrigger value="chat">
                    <MessageSquare className="size-3.5" />
                    设计对话
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    <FileCode2 className="size-3.5" />
                    临时文件预览
                    {preview && (
                      <span className="text-ui-sm text-foreground-subtle">
                        {preview.files.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>
              <span
                role="status"
                className="text-ui-sm text-foreground-subtle"
                data-testid="skill-design-generation-status"
              >
                {generationStatus}
              </span>
            </div>
            <TabsContent
              forceMount
              value="chat"
              className={tab === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
            >
              <div className="relative min-h-0 flex-1" data-testid="skill-design-chat">
                <V4PaneConversationProvider scope={scope} sessionId={sessionId}>
                  <AIReqSessionPane
                    paneId={`skill-designer-${projectId}`}
                    sessionId={sessionId}
                    rootSessionId={sessionId}
                    workspacePath={scope.workspacePath}
                    workspaceIdentity={scope.workspaceIdentity}
                    embedded
                    focused={editorActive && tab === "chat"}
                    conversationEmptyState={
                      <div className="mx-auto flex min-h-64 max-w-md flex-col items-center justify-center gap-3 px-6 py-8 text-center">
                        <WandSparkles className="size-6 text-foreground-subtle" />
                        <h2 className="text-ui-lg font-medium">从一个任务开始设计技能</h2>
                        <p className="text-ui-base leading-6 text-foreground-subtle">
                          {/* 收起说明面板后不再指向不可见的左侧区域。 */}
                          {briefOpen ? "在左侧整理目标，" : "展开“技能说明”整理目标，"}
                          或直接在下方描述需求。 核对内容并发送后，再预览和确认保存。
                        </p>
                      </div>
                    }
                    composerPlaceholder="描述想设计的技能，或补充修改要求…"
                    composerAriaLabel="技能设计对话输入"
                    composerInputPreview={composerInputPreview}
                    externalTextInsertRequest={insertRequest}
                    onExternalTextInsertApplied={handleInsertApplied}
                  />
                </V4PaneConversationProvider>
              </div>
            </TabsContent>
            <TabsContent
              forceMount
              value="preview"
              className={tab === "preview" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
            >
              <div
                className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
                data-testid="skill-design-preview"
              >
                {!preview ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <FileCode2 className="size-6 text-foreground-subtle" />
                    <p className="text-ui-base">尚未生成临时文件</p>
                    <p className="max-w-sm text-ui-sm text-foreground-subtle">
                      在设计对话中发送技能需求。文件生成后会显示在这里，核对后再选择保存位置。
                    </p>
                    <Button variant="outline" onClick={() => setTab("chat")}>
                      返回设计对话
                    </Button>
                  </div>
                ) : (
                  <>
                    <Select value={file?.path} onValueChange={setSelectedFile}>
                      <SelectTrigger className="w-full" aria-label="选择临时技能文件">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {preview.files.map((item) => (
                          <SelectItem key={item.path} value={item.path}>
                            {item.path}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="px-0 text-foreground-subtle">
                          <ChevronDown className="size-3" />
                          查看完整文件路径
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <p className="break-all font-mono text-ui-sm text-foreground-subtle">
                          {preview.directory}/{file?.path}
                        </p>
                      </CollapsibleContent>
                    </Collapsible>
                    {file && (
                      <AIReqSkillFilePreview file={file} workspacePath={scope.workspacePath} />
                    )}
                  </>
                )}
              </div>
              {preview && (
                <div
                  className="shrink-0 space-y-2 border-t border-border p-3"
                  data-testid="skill-design-save-target"
                >
                  <p className="text-ui-sm">
                    技能标识（模型推荐）：
                    <span className="font-mono">{preview?.name ?? "发送后由模型推荐"}</span>
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="skill-save-scope">保存到</Label>
                    <Select
                      value={saveTarget}
                      disabled={Boolean(savedPath) || saving}
                      onValueChange={(value) => {
                        setSaveTarget(value as "project" | "user");
                        if (!draftSaveError.current) setError("");
                      }}
                    >
                      <SelectTrigger id="skill-save-scope" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="project" disabled={!developmentRoot}>
                          项目技能 · 当前有效项目
                        </SelectItem>
                        <SelectItem value="user">共享模拟 profile 技能</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-ui-sm text-foreground-subtle">
                    {saveTarget === "project"
                      ? `当前项目：${projectName}`
                      : `共享技能归属：${source.backend?.owner ?? "Web 启动者"}`}
                  </p>
                  <p className="break-all font-mono text-ui-sm text-foreground-subtle">
                    {targetDirectory ??
                      "文件生成后显示保存路径。项目技能需选择有效项目，共享技能可独立保存。"}
                  </p>
                  {preview && (
                    <p className="text-ui-sm text-foreground-subtle">
                      将保存第 {preview.revision} 版的全部 {preview.files.length}{" "}
                      个文件，不覆盖同名技能。
                    </p>
                  )}
                  {preview && !validName && (
                    <p role="alert" className="text-ui-sm text-destructive">
                      标识只能包含小写字母、数字和连字符，最长 64 个字符。
                    </p>
                  )}
                  {collision && !savedPath && (
                    <p role="alert" className="text-ui-sm text-destructive">
                      所选目标已有同名技能，请返回对话让模型推荐其他标识，再预览保存。
                    </p>
                  )}
                  {savedPath && (
                    <p role="status" className="break-all text-ui-sm text-foreground-subtle">
                      演示已保存全部文件到 {savedPath}。
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setTab("chat");
                      }}
                    >
                      继续讨论修改
                    </Button>
                    <Button
                      disabled={
                        !targetDirectory ||
                        !preview ||
                        collision ||
                        !validName ||
                        Boolean(savedPath) ||
                        saving
                      }
                      onClick={save}
                    >
                      确认保存技能
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
