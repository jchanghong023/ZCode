import type {
  CommandAck,
  ConversationDelta,
  ReturnedConversationInput,
  WireConversationRow,
} from "@zcode/shared/zcode-protocol-v4";
import type { ProductionStore } from "../aireq/contract.js";
import type { MockSession, MockQueuedInput } from "../mock/runtime.js";

type Receipt = { digest: string; ack: CommandAck };
export type NativeAttachment = {
  actor: string;
  sessionId: string;
  workspaceKey: string;
  fileName: string;
  mime: string;
  bytes: Buffer;
  returnedToDraft?: true;
};
export type NativeUpload = Omit<NativeAttachment, "bytes" | "returnedToDraft"> & {
  totalBytes: number;
  totalChunks: number;
  checksum: string;
  chunks: Buffer[];
  ref?: string;
};

type StoredSession = Omit<
  MockSession,
  "activeTurn" | "rows" | "returnedInputs" | "queuedInputs"
> & {
  interrupted: boolean;
  returnedInputs: [string, ReturnedConversationInput[]][];
  queuedInputs: Pick<MockQueuedInput, "actor" | "item">[];
};

/** SQLite mirrors the native projection, not SDK internals. Session rows and attachment bytes are separate from frequently changed headers. */
export class NativeStorage {
  private readonly prefix: string;
  private pending?: { committed: Array<() => void>; rolledBack: Array<(error: unknown) => void> };
  constructor(
    private readonly store: ProductionStore,
    private readonly scope: "team" | "chat",
  ) {
    this.prefix = "native:" + scope + ":";
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS native_rows (
        scope TEXT NOT NULL, session TEXT NOT NULL, id INTEGER NOT NULL, row TEXT NOT NULL,
        PRIMARY KEY(scope,session,id)
      );
      CREATE TABLE IF NOT EXISTS native_bytes (
        scope TEXT NOT NULL, owner TEXT NOT NULL, part INTEGER NOT NULL, bytes BLOB NOT NULL,
        PRIMARY KEY(scope,owner,part)
      );`);
  }
  transaction<T>(fn: () => T): T {
    if (this.pending) return fn();
    const committed: Array<() => void> = [];
    const rolledBack: Array<(error: unknown) => void> = [];
    this.pending = { committed, rolledBack };
    let result: T;
    try {
      result = this.store.db.transaction(fn)();
    } catch (error) {
      for (const undo of rolledBack.reverse()) undo(error);
      throw error;
    } finally {
      this.pending = undefined;
    }
    for (const notify of committed) notify();
    return result;
  }
  afterCommit(fn: () => void) {
    if (this.pending) this.pending.committed.push(fn);
    else fn();
  }
  onRollback(fn: (error: unknown) => void): void {
    this.pending?.rolledBack.push(fn);
  }
  waitForCommit(): Promise<void> {
    if (!this.pending) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.afterCommit(resolve);
      this.onRollback(reject);
    });
  }
  saveReceipt(key: string, value: Receipt) {
    this.store.set(this.prefix + "receipt:" + key, value);
  }
  checkpoint(session: MockSession) {
    // 接纳命令在同步事务中只会追加新行。保留尾部长度和可变的队列/配置，不为每次输入复制整段历史。
    const count = session.rows.length;
    const before = {
      ...session,
      config: { ...session.config },
      queuedInputs: [...session.queuedInputs],
      returnedInputs: session.returnedInputs && new Map(session.returnedInputs),
    };
    this.onRollback(() => {
      const abandoned = session.activeTurn !== before.activeTurn ? session.activeTurn : null;
      session.rows.length = count;
      for (const key of Object.keys(session))
        if (!Object.hasOwn(before, key)) Reflect.deleteProperty(session, key);
      Object.assign(session, before);
      abandoned?.controller.abort();
    });
  }
  saveSession(session: MockSession, deltas?: ConversationDelta[]) {
    const { rows, activeTurn, returnedInputs, queuedInputs, ...meta } = session;
    this.transaction(() => {
      this.store.set(this.prefix + "session:" + session.sessionId, {
        ...meta,
        interrupted: !!activeTurn,
        returnedInputs: [...(returnedInputs ?? [])],
        queuedInputs: queuedInputs
          .filter((q) => !q.documentReview)
          .map(({ actor, item }) => ({ actor, item })),
      } satisfies StoredSession);
      if (!deltas) {
        this.store.db
          .query("DELETE FROM native_rows WHERE scope=? AND session=? AND id>?")
          .run(this.scope, session.sessionId, rows.at(-1)?.rowId ?? -1);
        for (const row of rows) this.saveRow(session.sessionId, row);
        return;
      }
      for (const delta of deltas) {
        if (delta.op === "row.removed") {
          this.store.db
            .query("DELETE FROM native_rows WHERE scope=? AND session=? AND id>=?")
            .run(this.scope, session.sessionId, delta.fromRowId);
          continue;
        }
        const row =
          delta.op === "row.appended" || delta.op === "row.upserted"
            ? delta.row
            : delta.op === "row.delta"
              ? rows.find((r) => r.rowId === delta.rowId)
              : undefined;
        if (row) this.saveRow(session.sessionId, row);
      }
    });
  }
  private saveRow(id: string, row: WireConversationRow) {
    this.store.db
      .query("INSERT OR REPLACE INTO native_rows(scope,session,id,row) VALUES (?,?,?,?)")
      .run(this.scope, id, row.rowId, JSON.stringify(row));
  }
  saveUpload(key: string, upload: NativeUpload) {
    const { chunks: _chunks, ...meta } = upload;
    this.store.set(this.prefix + "upload:" + key, meta);
  }
  saveChunk(key: string, index: number, bytes: Buffer) {
    this.store.db
      .query("INSERT INTO native_bytes(scope,owner,part,bytes) VALUES (?,?,?,?)")
      .run(this.scope, "upload:" + key, index, bytes);
  }
  saveAttachment(ref: string, attachment: NativeAttachment) {
    const { bytes, ...meta } = attachment;
    this.store.set(this.prefix + "attachment:" + ref, meta);
    this.store.db
      .query("INSERT INTO native_bytes(scope,owner,part,bytes) VALUES (?,?,0,?)")
      .run(this.scope, "attachment:" + ref, bytes);
  }
  returnAttachment(ref: string) {
    const key = this.prefix + "attachment:" + ref;
    const value = this.store.get<Omit<NativeAttachment, "bytes">>(key);
    if (value && !value.returnedToDraft) this.store.set(key, { ...value, returnedToDraft: true });
  }
  remove(kind: "attachment" | "upload", id: string) {
    this.store.db
      .query("DELETE FROM native_bytes WHERE scope=? AND owner=?")
      .run(this.scope, kind + ":" + id);
    this.store.db.query("DELETE FROM records WHERE name=?").run(this.prefix + kind + ":" + id);
  }
  private bytes(key: string): Buffer[] {
    return this.store.db
      .query<{ bytes: Uint8Array }, [string, string]>(
        "SELECT bytes FROM native_bytes WHERE scope=? AND owner=? ORDER BY part",
      )
      .all(this.scope, key)
      .map(({ bytes }) => Buffer.from(bytes));
  }
  restore(
    sessions: Map<string, MockSession>,
    receipts: Map<string, Receipt>,
    uploads: Map<string, NativeUpload>,
    attachments: Map<string, NativeAttachment>,
  ) {
    for (const [id, meta] of this.store.entries<Omit<NativeAttachment, "bytes">>(
      this.prefix + "attachment:",
    )) {
      const [bytes] = this.bytes("attachment:" + id);
      if (!bytes) throw new Error("无法恢复已提交附件。");
      attachments.set(id, { ...meta, bytes });
    }
    for (const [id, meta] of this.store.entries<Omit<NativeUpload, "chunks">>(
      this.prefix + "upload:",
    ))
      uploads.set(id, { ...meta, chunks: this.bytes("upload:" + id) });
    for (const [id, value] of this.store.entries<Receipt>(this.prefix + "receipt:"))
      receipts.set(id, value);
    for (const [id, meta] of this.store.entries<StoredSession>(this.prefix + "session:")) {
      const { interrupted, returnedInputs, queuedInputs, ...snapshot } = meta;
      const rows = this.store.db
        .query<{ row: string }, [string, string]>(
          "SELECT row FROM native_rows WHERE scope=? AND session=? ORDER BY id",
        )
        .all(this.scope, id)
        .map((record) => JSON.parse(record.row) as WireConversationRow);
      const session: MockSession = {
        ...snapshot,
        rows,
        returnedInputs: new Map(returnedInputs),
        queuedInputs: [],
        activeTurn: null,
      };
      if (interrupted || queuedInputs.length) {
        // 服务重启丢失了 SDK 的活跃执行，只恢复投影和提交者各自的输入，不能重放工具或用户消息。
        this.transaction(() => {
          const now = Date.now();
          for (const row of rows) {
            if (!markInterrupted(row, now)) continue;
            this.saveRow(id, row);
          }
          for (const { actor, item } of queuedInputs) {
            const returned = session.returnedInputs!.get(actor) ?? [];
            const { sourceCommandId, text, attachments: refs, conversationQuotes } = item;
            returned.push({ sourceCommandId, text, attachments: refs, conversationQuotes });
            session.returnedInputs!.set(actor, returned);
            for (const { ref } of refs) {
              const attachment = attachments.get(ref);
              if (attachment) {
                attachment.returnedToDraft = true;
                this.returnAttachment(ref);
              }
            }
          }
          session.phase = "completedInterrupted";
          session.revision++;
          session.seq++;
          this.saveSession(session);
        });
      }
      sessions.set(id, session);
    }
  }
}
function markInterrupted(row: WireConversationRow, now: number): boolean {
  if (row.kind === "turnHeader" && row.state === "running") {
    row.state = "completedInterrupted";
    row.endedAt = now;
    return true;
  }
  if ((row.kind === "assistantText" || row.kind === "reasoning") && row.state === "streaming") {
    row.state = "interrupted";
    return true;
  }
  if (
    row.kind === "toolCall" &&
    ["inputStreaming", "pendingApproval", "running"].includes(row.status)
  ) {
    row.status = "cancelled";
    row.endedAt = now;
    return true;
  }
  if (row.kind === "subagent" && row.status === "running") {
    row.status = "cancelled";
    row.endedAt = now;
    return true;
  }
  return false;
}
