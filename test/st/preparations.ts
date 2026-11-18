import { afterAll, beforeAll, it, type TestContext } from "vitest";
import { connectST } from "./client.js";
import { config } from "./config.js";
import { claimFixture } from "./fixtures.js";
import { createFormalFixture } from "./formal-fixtures.js";
import { serialSTStep } from "./execution.js";
import type { STFixture } from "./config.js";

declare module "vitest" {
  interface TaskMeta {
    stFormalPurpose?: string;
    stPriority?: number;
    stPreparation?: { startedAt: number; finishedAt: number };
  }
}

type Outcome = { ok: true; ref: STFixture } | { ok: false; error: unknown };

async function prepare(purpose: string): Promise<Outcome> {
  let c: Awaited<ReturnType<typeof connectST>> | undefined;
  let outcome: Outcome;
  try {
    c = await connectST();
    const ref =
      config.fixtures[purpose] === undefined
        ? await createFormalFixture(c, purpose)
        : await serialSTStep(() => claimFixture(c!, purpose));
    outcome = { ok: true, ref };
  } catch (error) {
    outcome = { ok: false, error };
  }
  try {
    await c?.close();
  } catch (error) {
    outcome = {
      ok: false,
      error: outcome.ok
        ? error
        : new AggregateError([outcome.error, error], "ST preparation and cleanup failed"),
    };
  }
  return outcome;
}

/** 一个 worker 内最多两份独立前置在途，断言仍串行；不会重放失败的 mutation。 */
export function useFormalPreparations(mode: "eager" | "case" = "eager") {
  const jobs = new Map<string, Promise<Outcome>>();
  let workers: Promise<void>[] = [];
  async function prepareTask(task: Pick<TestContext["task"], "meta">): Promise<Outcome> {
    const timing = { startedAt: Date.now(), finishedAt: 0 };
    task.meta.stPreparation = timing;
    try {
      return await prepare(String(task.meta.stFormalPurpose));
    } finally {
      timing.finishedAt = Date.now();
    }
  }
  // Vitest 要求首参使用解构，suite 只能从第二参取得。
  // oxlint-disable-next-line no-empty-pattern
  beforeAll(({}, suite) => {
    if (mode === "case") return;
    const plans = suite.tasks
      .filter(
        (task) =>
          task.type === "test" &&
          (task.mode === "run" || task.mode === "only") &&
          typeof task.meta.stFormalPurpose === "string",
      )
      .sort((a, b) => Number(a.meta.stPriority ?? 0) - Number(b.meta.stPriority ?? 0));
    const pending = plans.map((task) => {
      let resolve!: (value: Outcome) => void;
      jobs.set(
        task.id,
        new Promise<Outcome>((done) => {
          resolve = done;
        }),
      );
      return { task, resolve };
    });
    let next = 0;
    workers = Array.from(
      { length: Math.min(config.preparationConcurrency, pending.length) },
      async () => {
        for (;;) {
          const job = pending[next++];
          if (!job) return;
          // 结果总是兑现；准备失败由对应 case 报告。
          job.resolve(await prepareTask(job.task));
        }
      },
    );
  });
  afterAll(async () => {
    const results = await Promise.allSettled(workers);
    const errors = results.filter((result) => result.status === "rejected");
    if (errors.length)
      throw new AggregateError(
        errors.map((result) => result.reason),
        "ST preparation workers failed",
      );
  }, config.timeoutMs * 2);
  async function ready(id: string): Promise<STFixture> {
    const pending = jobs.get(id);
    if (!pending) throw new Error("ST case has no selected preparation plan");
    const outcome = await pending;
    if (!outcome.ok) throw outcome.error;
    return outcome.ref;
  }
  async function run<T>(id: string, signal: AbortSignal, body: () => Promise<T>): Promise<T> {
    if (jobs.has(id)) await ready(id);
    // 整个断言阶段独占，与其他前置的读取版本→写入阶段共用同一把锁。
    signal.throwIfAborted();
    return serialSTStep(() => {
      signal.throwIfAborted();
      return body();
    });
  }
  return {
    ready,
    test(
      name: string,
      options: { timeout: number; meta?: Record<string, unknown> },
      body: (context: Pick<TestContext, "task">) => Promise<void>,
    ) {
      it(name, options, ({ task, signal }) => {
        signal.throwIfAborted();
        if (mode === "case" && typeof task.meta.stFormalPurpose === "string")
          jobs.set(task.id, prepareTask(task));
        return run(task.id, signal, () => body({ task }));
      });
    },
  };
}
