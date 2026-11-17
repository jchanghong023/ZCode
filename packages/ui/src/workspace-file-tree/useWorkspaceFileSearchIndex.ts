import { useMemo } from "react";
import type { WorkspaceFileEntry } from "@zcode/shared";
import { packWorkspaceFileEntries } from "@zcode/shared/workspaceFileEntriesCodec";
import { useWorkspaceFileSearchFilterEntries } from "@/workspace-file-search/useWorkspaceFileSearchFilter.js";

export function useWorkspaceFileSearchResults({
  entries,
  query,
  workspacePath,
}: {
  entries: WorkspaceFileEntry[];
  query: string;
  workspacePath: string;
}): WorkspaceFileEntry[] {
  // 打分在 Web Worker 执行（与 @ 文件候选共用同一过滤语义与降级路径）。
  // 入参是树已解包的 entries（渲染复用），这里重新 pack 一次（~31ms@37 万）
  // 交给 worker——避免调用方为搜索单独维护一份 packed 状态。
  // requireQuery: true 保持"空 query 不出结果"的文件树搜索行为。
  const packed = useMemo(() => packWorkspaceFileEntries(entries), [entries]);
  const { items } = useWorkspaceFileSearchFilterEntries(
    packed,
    query,
    { requireQuery: true },
    workspacePath,
  );
  return items;
}
