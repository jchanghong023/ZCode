import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AIReqProposalTablePreferences } from "@zcode/services/aireq";
import { getEmployeeId, isEmployeeId } from "./identity.js";
import { businessRule } from "./errors.js";
import { proposalTablePreferencesSchema } from "./wire-schemas.js";

export function createProposalTablePreferencesStore(workspacePath: string) {
  const directory = join(workspacePath, ".zcode-runtime", "aireq", "proposal-table");
  const pending = new Map<string, Promise<unknown>>();

  function employeePath(): string {
    const employeeId = getEmployeeId();
    if (!isEmployeeId(employeeId)) throw businessRule("连接身份无效，请重新进入工作区。");
    return join(directory, `${employeeId}.json`);
  }

  async function readFileValue(path: string): Promise<AIReqProposalTablePreferences | null> {
    try {
      return proposalTablePreferencesSchema.parse(JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  return {
    async read() {
      const path = employeePath();
      await pending.get(path);
      return readFileValue(path);
    },
    async save(preferences: AIReqProposalTablePreferences, initializeOnly: boolean) {
      const path = employeePath();
      const save = Promise.resolve(pending.get(path)).then(async () => {
        if (initializeOnly) {
          const existing = await readFileValue(path);
          if (existing) return existing;
        }
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = `${path}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, JSON.stringify(preferences), { flag: "wx", mode: 0o600 });
          await rename(temporary, path);
        } finally {
          await rm(temporary, { force: true });
        }
        return preferences;
      });
      const settled = save.then(
        () => undefined,
        () => undefined,
      );
      pending.set(path, settled);
      try {
        return await save;
      } finally {
        if (pending.get(path) === settled) pending.delete(path);
      }
    },
  };
}
