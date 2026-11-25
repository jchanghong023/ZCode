import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export type DeploymentZone = "yellow" | "red";

export class ProductionStore {
  readonly db: Database;
  readonly root: string;
  readonly exchange: string;
  constructor(
    readonly zone: DeploymentZone,
    root: string,
    exchange: string,
  ) {
    this.root = resolve(root);
    this.exchange = resolve(exchange);
    mkdirSync(this.root, { recursive: true });
    mkdirSync(this.exchange, { recursive: true });
    this.db = new Database(resolve(this.root, "aireq.sqlite"), { create: true, strict: true });
    try {
      this.db.exec(`PRAGMA busy_timeout=3000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
      PRAGMA locking_mode=EXCLUSIVE;
      CREATE TABLE IF NOT EXISTS records (name TEXT PRIMARY KEY, value TEXT NOT NULL);`);
      const previous = this.get<string>("zone");
      if (previous && previous !== zone) throw new Error("黄区和红区须使用独立的数据目录。");
      this.set("zone", zone);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  get<T>(name: string): T | undefined {
    const row = this.db
      .query<{ value: string }, [string]>("SELECT value FROM records WHERE name=?")
      .get(name);
    return row ? (JSON.parse(row.value) as T) : undefined;
  }
  set(name: string, value: unknown): void {
    this.db
      .query(
        "INSERT INTO records VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
      )
      .run(name, JSON.stringify(value));
  }
  entries<T>(prefix: string): [string, T][] {
    return this.db
      .query<{ name: string; value: string }, [string]>(
        "SELECT name,value FROM records WHERE instr(name,?)=1",
      )
      .all(prefix)
      .map((row) => [row.name.slice(prefix.length), JSON.parse(row.value) as T]);
  }
}

export let production: ProductionStore | undefined;
const initializers = new Set<(store: ProductionStore) => void>();

/** 支持服务先导入或先打开数据库；每个状态所有者在服务对外提供连接前恢复一次。 */
export function onProductionOpen(initialize: (store: ProductionStore) => void): void {
  if (production) initialize(production);
  else initializers.add(initialize);
}
export function openProduction(
  zone: DeploymentZone,
  root: string,
  exchange: string,
): ProductionStore {
  if (production) throw new Error("正式服务已启动。");
  const store = new ProductionStore(zone, root, exchange);
  production = store;
  try {
    for (const initialize of initializers) initialize(store);
    initializers.clear();
    return store;
  } catch (error) {
    store.db.close();
    production = undefined;
    throw error;
  }
}
