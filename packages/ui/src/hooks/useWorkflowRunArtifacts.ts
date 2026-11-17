import type {
  WorkflowRunArtifactKind,
  WorkflowRunArtifactSummary,
  WorkflowRunArtifactVersion,
} from "@zcode/shared/zcode-protocol-v4";
import { orderArtifactsPrimaryFirst } from "@/app-shell/workflow-artifacts/artifactPresentation.js";
export interface WorkflowRunArtifactView {
  id: string;
  kind: WorkflowRunArtifactKind;
  title?: string;
  description?: string;
  contentType?: string;
  /** 最新版的字节数（内容产物才有）。 */
  bytes?: number;
  /** 工作区相对的原路径（`file` 才有）——「在工作区显示」按它定位。 */
  sourcePath?: string;
  /** 最新版号。 */
  version: number;
  /** 已提供的版本历史，按版本升序。 */
  versions?: readonly WorkflowRunArtifactVersion[];
  /** 预置看板的展示规格。 */
  spec?: unknown;
  /** 产物摘要中的报告条数。 */
  itemCount: number;
  /** run 的交付物。 */
  primary?: true;
}

function viewFromSummary(summary: WorkflowRunArtifactSummary): WorkflowRunArtifactView {
  return {
    id: summary.id,
    kind: summary.kind,
    ...(summary.title === undefined ? {} : { title: summary.title }),
    ...(summary.contentType === undefined ? {} : { contentType: summary.contentType }),
    ...(summary.bytes === undefined ? {} : { bytes: summary.bytes }),
    version: summary.version,
    itemCount: summary.itemCount ?? 0,
    ...(summary.primary === true ? { primary: true as const } : {}),
  };
}

export function artifactViewsFromSummaries(
  summaries: readonly WorkflowRunArtifactSummary[],
): readonly WorkflowRunArtifactView[] {
  return orderArtifactsPrimaryFirst(summaries.map(viewFromSummary));
}
