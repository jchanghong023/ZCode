import { isIP } from "node:net";
import type { AIReqPresenceRow, AIReqPresenceSnapshot } from "@zcode/services/aireq";

function normalizeIP(value: string): string {
  const trimmed = value.trim();
  if (isIP(trimmed) !== 6) return trimmed;
  // IPv6 的展开／压缩写法与 IPv4-mapped 地址应归为同一个来源，避免重复行及代理匹配遗漏。
  let normalized = trimmed.toLowerCase();
  try {
    normalized = new URL(`http://[${trimmed}]/`).hostname.slice(1, -1);
  } catch {
    return normalized;
  }
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(normalized);
  if (!mapped) return normalized;
  const high = Number.parseInt(mapped[1]!, 16);
  const low = Number.parseInt(mapped[2]!, 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/** Forwarded headers only become evidence when the immediate peer is explicitly trusted. */
export function presenceIP(
  peer: string | undefined,
  forwarded: string | undefined,
  trustedProxies: readonly string[],
): string | null {
  const direct = normalizeIP(peer ?? "");
  if (!isIP(direct)) return null;
  const trusted = new Set(trustedProxies.map(normalizeIP));
  if (!trusted.has(direct) || !forwarded) return direct;
  const chain = forwarded.split(",").map(normalizeIP);
  if (chain.some((ip) => !isIP(ip))) return direct;
  let source = direct;
  for (let index = chain.length - 1; index >= 0 && trusted.has(source); index -= 1) {
    source = chain[index]!;
  }
  return source;
}

/** One process owner; connection disposal never removes another tab's presence. */
export class AIReqPresence {
  private revision = 0;
  private readonly rows = new Map<string, AIReqPresenceRow & { connections: number }>();

  constructor(private readonly changed: (snapshot: AIReqPresenceSnapshot) => void) {}

  read(): AIReqPresenceSnapshot {
    const rows = [...this.rows.values()]
      .map(({ employeeId, ip }) => ({ employeeId, ip }))
      .sort(
        (a, b) =>
          a.employeeId.localeCompare(b.employeeId) || (a.ip ?? "").localeCompare(b.ip ?? ""),
      );
    return {
      revision: this.revision,
      employeeCount: new Set(rows.map((row) => row.employeeId)).size,
      rows,
    };
  }

  connect(employeeId: string, ip: string | null): () => void {
    const key = JSON.stringify([employeeId, ip]);
    const existing = this.rows.get(key);
    if (existing) existing.connections += 1;
    else {
      this.rows.set(key, { employeeId, ip, connections: 1 });
      this.publish();
    }
    let connected = true;
    return () => {
      if (!connected) return;
      connected = false;
      const row = this.rows.get(key)!;
      row.connections -= 1;
      if (row.connections === 0) {
        this.rows.delete(key);
        this.publish();
      }
    };
  }

  private publish() {
    this.revision += 1;
    this.changed(this.read());
  }
}
