import { useCallback, useEffect, useRef, useState } from "react";
import type { SkillSummary, SkillsListResult } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { ChevronDown, CircleUserRound, Folder, WandSparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import {
  SettingsResourceGroupHeader,
  SettingsResourceList,
} from "@/settings/SettingsResourceGroup.js";
import { SettingsResourceHeaderActions } from "@/settings/SettingsResourceHeaderActions.js";
import { SettingsSearchInput } from "@/settings/SettingsSearchInput.js";
import { PluginSearchEmptyState } from "@/settings/PluginInstallEmptyState.js";
import { groupScopedSkillsBySource } from "@/settings/pluginCapabilityProjection.js";
import { useAIReqDataSource } from "../data-source.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqPersonalConfigScope } from "./AIReqPersonalConfigScope.js";

export function AIReqSkillsSettings() {
  const source = useAIReqDataSource();
  const aireq = useAIReq();
  const [scope, setScope] = useState("user");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SkillsListResult>();
  const [selected, setSelected] = useState<SkillSummary>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef({ value: 0 });
  const trigger = useRef<HTMLButtonElement | null>(null);
  const projectId = aireq?.selection.projectId;
  const workspace = source.resolveWorkspace(aireq?.view, aireq?.selection ?? {});
  const project = aireq?.view?.projects.find((item) => item.id === projectId);
  const workspacePath = project?.root ?? workspace.path ?? "";
  const refresh = useCallback(async () => {
    const owner = generation.current;
    const current = ++owner.value;
    setLoading(true);
    setError("");
    try {
      if (!source.skills) throw new Error("技能目录服务不可用。");
      const next = await source.skills.list({
        workspacePath,
        workspaceIdentity: workspace.identity,
      });
      if (current === owner.value) {
        setResult(next);
        setSelected((previous) =>
          previous ? next.skills.find((skill) => skill.id === previous.id) : undefined,
        );
      }
    } catch (cause) {
      if (current === owner.value) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (current === owner.value) setLoading(false);
    }
  }, [source, workspacePath, workspace.identity]);
  useEffect(() => {
    const owner = generation.current;
    setResult(undefined);
    setSelected(undefined);
    void refresh();
    return () => {
      ++owner.value;
    };
  }, [refresh]);
  useEffect(() => {
    const subscription = source.skillDesign?.subscribe(() => {
      void refresh();
    });
    return () => subscription?.dispose();
  }, [source, refresh]);
  const skills = (result?.skills ?? []).filter(
    (skill) =>
      (skill.scope === "plugin" ||
        (scope === "user" ? skill.scope === "user" : skill.scope === "workspace")) &&
      `${skill.name}\n${skill.description}\n${skill.path}\n${skill.pluginName ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  // 修复原因：源目录按已安装项和插件来源分组；仅筛 user/workspace 会静默丢掉插件技能。
  const localSkills = skills.filter((skill) => skill.scope !== "plugin");
  const pluginGroups = groupScopedSkillsBySource(skills, "已安装技能").filter(
    (group) => group.source === "plugin",
  );
  const renderSkill = (skill: SkillSummary) => (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-hover">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-foreground-subtle"
        aria-hidden="true"
      >
        <WandSparkles className="size-4" />
      </div>
      <Button
        variant="ghost"
        className="h-auto min-w-0 justify-start whitespace-normal px-0 text-left hover:bg-transparent"
        onClick={(event) => {
          trigger.current = event.currentTarget;
          setSelected(skill);
        }}
      >
        <span className="min-w-0">
          <span className="block truncate text-ui-base font-medium">{skill.name}</span>
          <span className="mt-0.5 block truncate text-ui-sm text-foreground-subtle">
            {skill.description || "暂无描述"}
          </span>
        </span>
      </Button>
      <span className="shrink-0 text-ui-sm text-foreground-subtle">模拟 · 只读</span>
    </div>
  );
  return (
    <section className="space-y-5" data-testid="aireq-skills-settings">
      <AIReqPersonalConfigScope />
      <p className="text-ui-base text-foreground-subtle">
        只读技能目录。设计和模拟保存请使用工作区独立的“Skill 设计”；这里不安装、启停或删除技能。
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {/* 修复原因：宽下拉框破坏技能工具栏的紧凑布局；沿用共享作用域胶囊，但保留模拟归属标签。 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label="技能作用域" className="rounded-full pl-2.5 pr-1.5">
              {scope === "user" ? (
                <CircleUserRound className="size-4" aria-hidden="true" />
              ) : (
                <Folder className="size-4" aria-hidden="true" />
              )}
              <span>{scope === "user" ? "共享模拟 profile" : "当前项目"}</span>
              <ChevronDown className="size-4 text-foreground-subtlest" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup value={scope} onValueChange={setScope}>
              <DropdownMenuRadioItem value="user">共享模拟 profile</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="project" disabled={!projectId}>
                当前项目
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex h-7 items-center gap-1 px-3 text-ui-base font-medium">
          <span>技能</span>
          <span className="text-ui-sm text-foreground-subtle">{skills.length}</span>
        </div>
        <SettingsSearchInput
          aria-label="搜索技能"
          placeholder="搜索名称、描述或路径"
          containerClassName="w-full sm:ml-auto sm:w-64"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          clearLabel="清空搜索"
          onClear={() => setQuery("")}
        />
        <SettingsResourceHeaderActions
          onRefresh={() => void refresh()}
          refreshing={loading}
          refreshLabel="刷新技能"
        />
      </div>
      {loading && (
        <p role="status" className="text-ui-sm text-foreground-subtle">
          正在读取技能目录…
        </p>
      )}
      {error && (
        <div role="alert" className="space-y-2 text-ui-sm text-destructive">
          <p>{error}</p>
          <Button variant="outline" onClick={() => void refresh()}>
            重试
          </Button>
        </div>
      )}
      {result && (
        <>
          {/* 修复原因：搜索空结果不应留下“已安装技能 0”分组，空态复用设置页的居中边框容器。 */}
          {localSkills.length > 0 && (
            <section className="space-y-4">
              <SettingsResourceGroupHeader title="已安装技能" count={localSkills.length} />
              <SettingsResourceList
                items={localSkills}
                getKey={(skill) => skill.id}
                renderItem={renderSkill}
              />
            </section>
          )}
          {pluginGroups.map((group) => (
            <section key={group.id} className="space-y-4">
              <SettingsResourceGroupHeader title={group.label} count={group.skills.length} />
              <SettingsResourceList
                items={group.skills}
                getKey={(skill) => skill.id}
                renderItem={renderSkill}
              />
            </section>
          ))}
          {!skills.length && (
            <PluginSearchEmptyState
              label={query.trim() ? "没有匹配的技能，请修改搜索条件。" : "此作用域尚无技能。"}
            />
          )}
          {result.diagnostics.length > 0 && (
            <details className="text-ui-sm">
              <summary className="cursor-pointer">目录诊断（{result.diagnostics.length}）</summary>
              <ul className="space-y-2 py-3">
                {result.diagnostics.map((item, index) => (
                  <li key={`${item.code}-${index}`} className="break-all">
                    {item.severity} · {item.message} {item.path}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>{selected?.description}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              {/* 修复原因：源详情将归属、状态及标准元信息分栏展示，正文保留原文而非仅渲染 Markdown。 */}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-ui-sm">
                {[
                  [
                    "归属",
                    selected.scope === "user"
                      ? "共享模拟 profile"
                      : selected.scope === "plugin"
                        ? (selected.pluginName ?? "插件")
                        : "当前项目",
                  ],
                  ["状态", selected.enabled ? "可用" : "未启用"],
                  ["版本", selected.metadata?.version],
                  ["标识", selected.metadata?.slug],
                  ["发布时间", selected.metadata?.publishedAt],
                  ["所有者", selected.metadata?.ownerId],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 space-y-1">
                    <dt className="text-foreground-subtle">{label}</dt>
                    <dd className="break-all">
                      {value == null || value === "" ? "—" : String(value)}
                    </dd>
                  </div>
                ))}
                <div className="col-span-2 space-y-1">
                  <dt className="text-foreground-subtle">模拟路径（不打开本机文件）</dt>
                  <dd className="break-all font-mono">{selected.path}</dd>
                </div>
                {selected.metadata && (
                  <div className="col-span-2 space-y-1">
                    <dt className="text-foreground-subtle">元信息</dt>
                    <dd className="break-all">
                      {Object.entries(selected.metadata)
                        .map(([key, value]) => `${key}: ${String(value)}`)
                        .join(" · ")}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="space-y-2">
                <h3 className="text-ui-base font-medium">技能内容（模拟）</h3>
                <pre className="whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-ui-sm text-foreground-subtle">
                  {selected.body}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
