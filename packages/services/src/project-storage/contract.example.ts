import type { DatabaseSync } from "node:sqlite";
import type { ProjectStorageContract } from "./contract.js";

/**
 * Host 启动的真实序列：打开 App 库 → 版本化迁移 → 用同一连接读项目树。
 * 迁移 SQL、checksum 与备份目录都由启动入口注入；失败不发布 prepared，CLI 的 db.sqlite 不在此模块。
 */
export async function exampleProjectStorageStartup(
  port: ProjectStorageContract,
  db: DatabaseSync,
  backupDirectories: readonly string[],
) {
  const migration = await port.migrate(db, { backupDirectories });
  const tree = port.repository(db).readTree({ includeTasks: false });
  return { migration, projects: tree.projects.length };
}
