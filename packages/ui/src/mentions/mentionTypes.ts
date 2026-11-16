export type MentionCategory =
  | "files"
  | "skills"
  | "commands"
  | "subagents"
  | "sessions"
  /** 历史设计模式点选的页面元素（不进 @ 候选面板，只由点选插入） */
  | "elements";

export interface MentionItemData {
  kind?: "file" | "directory";
  path?: string;
  relativePath?: string;
  /** 只用于候选展示；执行路径与 canonical 链接不依赖 root 名。 */
  rootName?: string;
  scope?: "built-in" | "workspace" | "user" | "plugin";
  source?: "built-in" | "user" | "plugin";
  model?: string;
}

export interface MentionItem {
  id: string;
  category: MentionCategory;
  label: string;
  description: string;
  value: string;
  markdown: string;
  keywords?: string[];
  data?: MentionItemData;
  /**
   * 仅供面板渲染的本地化展示名。
   * `label` 同时是面板文案与 chip/markdown 载体的 label，直接本地化 `label` 会让
   * composer chip 与消息气泡（按 markdown label 重建）显示不一致；面板展示名单独走此字段。
   */
  displayLabel?: string;
  /** 禁选态：面板可见但不可选择。 */
  disabled?: boolean;
  /** 禁选原因，展示在候选行右侧弱信息位。 */
  disabledReason?: string;
}

export interface MentionCategoryResult {
  items: MentionItem[];
  groups?: Array<{ id: string; title: string; items: MentionItem[] }>;
  loading: boolean;
  error: Error | null;
  emptyText: string;
  title: string;
  refresh?: () => Promise<void>;
}
