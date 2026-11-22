import type { ArtifactPillData } from "./WorkflowArtifactPill.js";

export interface WorkflowCompletionArtifact extends ArtifactPillData {
  contentType?: string;
  bytes?: number;
  sourcePath?: string;
  /** 预置看板喂进来的条数；通知载荷上没有，只有活投影 / journal 补过之后才有。 */
  itemCount?: number;
  /** 预置看板的 spec（只有 journal 带得回来）；预览区据它画图。 */
  spec?: unknown;
  /** 作者写的一两句说明；只有交付物行念它（瓦片放不下）。 */
  description?: string;
  /** run 的交付物。 */
  primary?: true;
}

/** 内容拿不到时的纸页字形：一张小纸 + 右下角的扩展名徽字。诚实，不装饰。 */
export function ArtifactSheetGlyph({ badge }: { badge?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center" data-testid="workflow-artifact-sheet">
      <div className="flex aspect-[3/4] w-[38%] max-w-[72px] flex-col gap-1.5 rounded-[4px] border border-border bg-card p-2.5 shadow-[0_1px_0_var(--color-workflow-rule)]">
        <i className="block h-[5px] w-[55%] rounded-sm bg-surface-hover" />
        <i className="block h-[3px] rounded-sm bg-surface-hover" />
        <i className="block h-[3px] rounded-sm bg-surface-hover" />
        <i className="block h-[3px] w-[70%] rounded-sm bg-surface-hover" />
      </div>
      {badge === undefined ? null : (
        <span
          className="absolute bottom-2 right-2 rounded-[4px] bg-surface-hover px-1.5 py-0.5 font-mono text-ui-xs text-foreground-subtle"
          data-testid="workflow-artifact-sheet-badge"
        >
          {badge}
        </span>
      )}
    </div>
  );
}
