import { createUuid } from "@zcode/shared";
import {
  AIREQ_REQUIREMENT_COMMENT_MAX_LENGTH,
  type AIReqDataSource,
  type AIReqDocumentVersion,
  type AIReqRequirementComment,
} from "../contract.js";

export function documentComments(
  irId: string,
  version: AIReqDocumentVersion,
  content: string,
  batch: string,
): string[] {
  const header = (part: number, total: number) =>
    `【${irId} · V${version.number} · ${version.confirmation ? "已确认" : "草稿"} · 第${part}条／共${total}条 · ${batch}】\n\n`;
  const limit = AIREQ_REQUIREMENT_COMMENT_MAX_LENGTH;
  if (header(1, 1).length + content.length <= limit) return [header(1, 1) + content];
  // 总分条数不会超过正文长度；预留足够的序号位数，分条后再填入实际总数。
  const available = limit - header(content.length, content.length).length;
  if (available < 2) throw new Error("需求编号过长，无法生成云龙评论。");
  const parts: string[] = [];
  for (let start = 0; start < content.length; ) {
    let end = Math.min(start + available, content.length);
    if (end < content.length) {
      const fragment = content.slice(start, end);
      const lf = fragment.lastIndexOf("\n\n");
      const crlf = fragment.lastIndexOf("\r\n\r\n");
      const paragraphEnd = Math.max(lf < 0 ? 0 : lf + 2, crlf < 0 ? 0 : crlf + 4);
      if (paragraphEnd) end = start + paragraphEnd;
      else if (
        /[\uD800-\uDBFF]/.test(content.charAt(end - 1)) ||
        (content[end - 1] === "\r" && content[end] === "\n")
      )
        end--;
    }
    parts.push(content.slice(start, end));
    start = end;
  }
  return parts.map((part, index) => header(index + 1, parts.length) + part);
}

type Phase =
  | "idle"
  | "loading"
  | "unavailable"
  | "read-error"
  | "sending"
  | "unknown"
  | "remaining"
  | "done";
type Progress = {
  phase: Phase;
  sent: number;
  total: number;
  version?: number;
  failure?: unknown;
  // 评论读取早于本次写入时，不能用旧结果判定某一条尚未发送。
  commentsRevision: number;
};

type DeliverySource = Pick<AIReqDataSource, "readWorkflow" | "addRequirementComment">;
export class DocumentCommentDelivery {
  private parts: string[] = [];
  private progress: Progress = { phase: "idle", sent: 0, total: 0, commentsRevision: 0 };
  private listeners = new Set<() => void>();

  constructor(
    private readonly source: DeliverySource,
    private readonly target: { projectId: string; irId: string },
  ) {}
  snapshot = () => this.progress;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(change: Partial<Progress>) {
    this.progress = { ...this.progress, ...change };
    for (const listener of this.listeners) listener();
  }
  private finish(commentsRevision: number) {
    this.parts = [];
    this.update({ phase: "done", sent: this.progress.total, failure: undefined, commentsRevision });
  }

  observeComments(comments: AIReqRequirementComment[], revision: number) {
    const { phase, commentsRevision, sent } = this.progress;
    if (phase !== "unknown" || revision !== commentsRevision) return;
    // 此条可能已经成功但回执丢失；批次和分条标记保证上一轮相同正文不会被误认。
    const next = sent + Number(comments.some((item) => item.body === this.parts[sent]));
    if (next === this.parts.length) this.finish(commentsRevision);
    else this.update({ phase: "remaining", sent: next });
  }

  async send(): Promise<void> {
    const { phase } = this.progress;
    if (phase === "loading" || phase === "sending" || phase === "unknown") return;
    if (phase !== "remaining") {
      this.update({ phase: "loading", sent: 0, total: 0, failure: undefined, version: undefined });
      try {
        const { projectId, irId } = this.target;
        const view = await this.source.readWorkflow({ projectId });
        const ir = view.requirements.find(
          (item) => item.id === irId && item.projectId === projectId,
        );
        const file = view.materials.find(
          (item) =>
            item.projectId === projectId &&
            item.irId === irId &&
            item.path === ir?.documentPath &&
            item.kind === "ir" &&
            !item.srId,
        );
        if (
          !ir?.documentVersion ||
          !file?.valid ||
          file.error ||
          !file.content?.trim() ||
          file.content.includes("\0")
        ) {
          this.update({ phase: "unavailable" });
          return;
        }
        this.parts = documentComments(irId, ir.documentVersion, file.content, createUuid());
        this.update({ total: this.parts.length, version: ir.documentVersion.number });
      } catch (failure) {
        this.update({ phase: "read-error", failure });
        return;
      }
    }
    this.update({ phase: "sending", failure: undefined });
    const revision = this.progress.commentsRevision + 1;
    try {
      for (let index = this.progress.sent; index < this.parts.length; index++) {
        await this.source.addRequirementComment(this.target, this.parts[index]!);
        this.update({ sent: index + 1 });
      }
    } catch (failure) {
      this.update({ phase: "unknown", failure, commentsRevision: revision });
      return;
    }
    this.finish(revision);
  }
}

// 详情的弹窗可以重建；当前页面的发送归对应数据源和 IR 所有，关闭弹窗不会丢失待核对的分条。
const deliveries = new WeakMap<AIReqDataSource, Map<string, DocumentCommentDelivery>>();
export function documentCommentDelivery(source: AIReqDataSource, projectId: string, irId: string) {
  let targets = deliveries.get(source);
  if (!targets) {
    targets = new Map();
    deliveries.set(source, targets);
  }
  const key = JSON.stringify([projectId, irId]);
  let delivery = targets.get(key);
  if (!delivery) {
    delivery = new DocumentCommentDelivery(source, { projectId, irId });
    targets.set(key, delivery);
  }
  return delivery;
}
