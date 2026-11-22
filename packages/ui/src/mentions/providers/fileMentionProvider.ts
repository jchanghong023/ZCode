import { useEffect, useMemo, useState } from "react";
import type { WebWorkspaceFileEntry } from "@zcode/services";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import { buildFileMentionMarkdown } from "@/mentions/mentionMarkdown.js";
import { WORKSPACE_FILE_SEARCH_DISPLAY_CAP } from "@zcode/shared/workspaceFileSearch";
import { getMentionGroupLimitForQuery } from "@/mentions/mentionSearch.js";
import type { MentionCategoryResult, MentionItem } from "@/mentions/mentionTypes.js";

export function isLocalWorkspaceForFileMentionIndex(workspaceIdentity?: string): boolean {
  return !workspaceIdentity?.trim();
}

function mapWorkspaceFileToMentionItem(entry: WebWorkspaceFileEntry, rootName: string): MentionItem {
  const name = entry.relativePath.slice(entry.relativePath.lastIndexOf("/") + 1);
  return {
    id: `file:${entry.path}`,
    category: "files",
    label: name,
    description: entry.relativePath,
    value: entry.relativePath,
    // Bugfix: 文件 mention 的标准转译格式需要保持 `[filename](path)`，
    // 之前这里误把整条 relativePath 当成链接文本，导致发送后回显和复制内容都退化成“长路径做标题”。
    // 这里恢复为只用 basename 做 label，路径只放在链接目标里，和输入框 node 样式保持一致。
    markdown: buildFileMentionMarkdown(entry.relativePath, name),
    keywords: [entry.relativePath, entry.path],
    data: {
      kind: "file",
      path: entry.path,
      relativePath: entry.relativePath,
      rootName,
    },
  };
}

export function useFileMentionProvider(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  query: string,
  enabled: boolean,
  emptyText: string,
  title: string,
  defaultPreviewLimit?: number,
  context?: { sessionId?: string | null; projectId?: string | null },
): MentionCategoryResult {
  const { services } = useWorkspaceServicesResolution(workspacePath, undefined, workspaceIdentity);
  const { fileService, projectService } = services;
  const sessionId = context?.sessionId;
  const projectId = context?.projectId;
  const [projectRevision, setProjectRevision] = useState(0);
  useEffect(() => {
    const subscription = services.broadcastService.onMessage((event) => {
      if (event.channel === "state:projects") setProjectRevision((value) => value + 1);
    });
    return () => subscription.dispose();
  }, [services]);
  const limit =
    getMentionGroupLimitForQuery(query, defaultPreviewLimit) ?? WORKSPACE_FILE_SEARCH_DISPLAY_CAP;
  // 连接实例也属于作用域：相同路径的远程重连不能接纳旧 Host 的查询结果。
  const scope = useMemo(
    () => ({
      fileService,
      projectService,
      workspacePath,
      workspaceIdentity,
      enabled,
      sessionId,
      projectId,
      projectRevision,
      error: null as Error | null,
    }),
    [
      fileService,
      projectService,
      workspacePath,
      workspaceIdentity,
      enabled,
      sessionId,
      projectId,
      projectRevision,
    ],
  );
  const [result, setResult] = useState<{
    scope: typeof scope;
    query: string;
    limit: number;
    entries: WebWorkspaceFileEntry[];
    loading: boolean;
    error: Error | null;
  } | null>(null);

  useEffect(() => {
    // 错误态等待面板/工作区/连接生命周期重置，避免 query 变化触发失败重试循环。
    if (!enabled || scope.error) return;
    let active = true;
    setResult({ scope, query, limit, entries: [], loading: true, error: null });
    const read = async (): Promise<WebWorkspaceFileEntry[]> => {
      if ((sessionId || projectId) && !projectService)
        throw new Error("project.service-unavailable");
      if (sessionId && projectService) {
        await projectService.resolveSessionDirectories({
          taskId: sessionId,
          workspacePath,
          workspaceIdentity,
        });
      } else if (projectId) {
        throw new Error("project.session-required");
      }
      if (!active) return [];
      const entries = await fileService.searchWorkspaceFiles({
        rootPath: workspacePath,
        query,
        limit,
      });
      const unique = new Map<string, WebWorkspaceFileEntry>();
      for (const entry of entries) {
        if (!unique.has(entry.path)) unique.set(entry.path, entry);
      }
      return [...unique.values()].slice(0, limit);
    };
    const search = async () => {
      try {
        const entries = await read();
        if (!active) return;
        setResult({ scope, query, limit, entries, loading: false, error: null });
      } catch (error) {
        if (!active) return;
        scope.error = error instanceof Error ? error : new Error(String(error));
        setResult({ scope, query, limit, entries: [], loading: false, error: scope.error });
      }
    };
    void search();
    // 查询、工作区、连接或面板生命周期变化都使已发出的异步响应失效。
    return () => {
      active = false;
    };
  }, [
    enabled,
    fileService,
    projectService,
    workspacePath,
    workspaceIdentity,
    sessionId,
    projectId,
    query,
    limit,
    scope,
  ]);

  const current =
    enabled && result?.scope === scope && result.query === query && result.limit === limit;
  const items = useMemo(() => {
    if (!current) return [];
    const rootName = workspacePath.split(/[\\/]/).filter(Boolean).at(-1) ?? workspacePath;
    return result.entries.map((entry) => mapWorkspaceFileToMentionItem(entry, rootName));
  }, [current, result, workspacePath]);
  return {
    items,
    loading: enabled && !scope.error && (!current || result.loading),
    error: enabled ? scope.error : null,
    emptyText,
    title,
  };
}
