import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { addReleaseProjects, initialCatalogue, nextIssueIdentity } from "./catalogue.mjs";

const globalFlags = ["project", "timeout", "compact", "debug", "help", "version"];
const commands = {
  "project list": { args: [], flags: ["name"] },
  "domain list": { args: [], flags: [] },
  "ir list": { args: [], flags: ["domain", "process", "page", "page-size", "all"] },
  "ir show": { args: ["IR"], flags: ["domain"] },
  "ir create": {
    args: [],
    flags: ["domain", "name", "description", "priority", "owner", "expected-date"],
  },
  "ir update": {
    args: ["IR"],
    flags: ["domain", "name", "description", "priority", "owner", "expected-date", "process"],
  },
  "comment list": { args: ["IR"], flags: ["domain"] },
  "comment add": { args: ["IR", "正文"], flags: ["domain"] },
  "comment delete": { args: ["IR", "评论ID"], flags: ["domain", "type"] },
};
const booleanFlags = new Set(["compact", "debug", "help", "version", "all"]);
const options = Object.fromEntries(
  [...new Set([...globalFlags, ...Object.values(commands).flatMap((c) => c.flags)])].map((flag) => [
    flag,
    { type: booleanFlags.has(flag) ? "boolean" : "string", multiple: flag === "domain" },
  ]),
);
options.help.short = "h";
const stages = ["初始", "分析", "开发", "测试", "完成"];
const defaultProject = "gmockdev01";
const version = "clouddragon (offline mock) 1.0";

class CliError extends Error {
  constructor(type, message) {
    super(message);
    this.name = type;
  }
}
function invalid(message) {
  throw new CliError("ArgumentError", message);
}
function missing(message) {
  throw new CliError("NotFoundError", message);
}
function positiveInt(raw, option) {
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1)
    invalid(`--${option} 需要正整数。`);
  return value;
}
function projectKey(raw = defaultProject) {
  if (/^https?:\/\//i.test(raw)) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      invalid("项目 URL 无效。");
    }
    const id = /(?:^|\/)project\/([A-Za-z0-9]+)(?:\/|$)/.exec(url.pathname)?.[1];
    if (!id) invalid("URL 缺少有效项目组 ID。");
    return id;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(raw)) invalid("项目组 ID 无效。");
  return raw;
}
function usage(resource, action) {
  const rows = Object.entries(commands).filter(
    ([key]) =>
      !resource || (action ? key === `${resource} ${action}` : key.startsWith(resource + " ")),
  );
  if (!rows.length) invalid("未知命令。");
  return [
    "clouddragon <资源> <动作> [选项]",
    ...rows.map(([key, spec]) =>
      [
        key,
        ...spec.args.map((name) => `<${name}>`),
        ...spec.flags.map((flag) => `[--${flag}${booleanFlags.has(flag) ? "" : " VALUE"}]`),
      ].join(" "),
    ),
    "全局选项  --project ID或URL  --timeout SECONDS  --compact  --debug  --help  --version",
  ].join("\n");
}
function checkedCommand(values, positionals) {
  const [resource, action, ...args] = positionals;
  const key = `${resource} ${action}`;
  if (!Object.hasOwn(commands, key)) invalid("未知或缺少命令。使用 --help 查看用法。");
  const spec = commands[key];
  if (args.length !== spec.args.length) invalid(`${key} 需要 ${spec.args.length} 个位置参数。`);
  for (const flag of Object.keys(values)) {
    if (!globalFlags.includes(flag) && !spec.flags.includes(flag))
      invalid(`${key} 不接受 --${flag}。`);
  }
  if (key !== "ir list" && values.domain?.length > 1) invalid("此命令只能指定一个需求域。");
  if (values.process !== undefined && !stages.includes(values.process)) invalid("未知进展。");
  if (values.priority !== undefined && !["高", "中", "低"].includes(values.priority))
    invalid("未知优先级。");
  if (values.name !== undefined && key.startsWith("ir ") && !values.name.trim())
    invalid("IR 名称不能为空。");
  const expected = values["expected-date"];
  if (
    expected &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(expected) ||
      !Number.isFinite(Date.parse(expected)) ||
      new Date(expected).toISOString().slice(0, 10) !== expected)
  )
    invalid("日期格式应为 YYYY-MM-DD。");
  if (key === "ir create" && (!values.name || !values.domain?.length))
    invalid("创建 IR 需要 --name 和 --domain。");
  if (key === "ir list" && values.all && values.page !== undefined)
    invalid("--all 与 --page 互斥。");
  if (values.page !== undefined) positiveInt(values.page, "page");
  if (values["page-size"] !== undefined) positiveInt(values["page-size"], "page-size");
  if (args.length && !/^IR\d+$/.test(args[0])) invalid("IR 业务号无效。");
  if (key === "comment add" && !args[1].trim()) invalid("评论正文不能为空。");
  return { key, args, projectId: projectKey(values.project), values };
}
function domainsFor(project, selections) {
  if (!selections) return project.domains;
  const ids = new Set(
    selections.map((value) => {
      const domain = project.domains.find((d) => d.id === value || d.name === value);
      if (!domain) missing(`找不到需求域 ${value}。`);
      return domain.id;
    }),
  );
  return project.domains.filter((domain) => ids.has(domain.id));
}
function listDomain(domain, issues, values) {
  const rows = issues
    .map((issue) => issue.record)
    .filter(
      (row) =>
        row.domain === domain.id &&
        (values.process === undefined || row.process === values.process),
    );
  const page = Number(values.page ?? 1);
  const size = Number(values["page-size"] ?? 200);
  const offset = (page - 1) * size;
  const items = values.all ? rows : rows.slice(offset, offset + size);
  return {
    ...domain,
    items,
    count: items.length,
    page: values.all ? null : page,
    page_size: size,
    total: values.all ? null : rows.length,
    next_page: !values.all && offset + size < rows.length ? page + 1 : null,
  };
}
function changesFor(values) {
  const fields = {
    name: "name",
    description: "description",
    priority: "priorityLevel",
    owner: "owner",
    "expected-date": "expectedImplementationDate",
    process: "process",
  };
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([flag]) => values[flag] !== undefined)
      .map(([flag, field]) => [field, values[flag]]),
  );
}
function execute(catalogue, { key, args, projectId, values }) {
  const project = catalogue.projects.find((p) => p.id === projectId);
  if (!project) missing(`找不到项目 ${projectId}。`);
  if (key === "project list") {
    const query = (values.name ?? "").toLowerCase();
    return {
      project: projectId,
      items: catalogue.projects
        .filter((p) => p.name.toLowerCase().includes(query))
        .map((p) => ({ id: p.id, name: p.name, current: p.id === projectId })),
    };
  }
  if (key === "domain list") return { project: projectId, items: project.domains };
  const selected = domainsFor(project, values.domain);
  const issues = catalogue.issues.filter((issue) => issue.projectId === projectId);
  if (key === "ir list")
    return { project: projectId, domains: selected.map((d) => listDomain(d, issues, values)) };
  const actor = process.env.ZCODE_CLOUDDRAGON_MOCK_ACTOR || "a00000001";
  if (key === "ir create") {
    const ir = {
      ...nextIssueIdentity(catalogue),
      domain: selected[0].id,
      description: "## 需求描述\n\n## 验收标准",
      priorityLevel: "中",
      owner: actor,
      process: "初始",
      creator: actor,
      submitter: actor,
      createDate: new Date().toISOString(),
      pi: null,
      piName: null,
      ...changesFor(values),
    };
    catalogue.issues.push({ projectId, record: ir, comments: [] });
    return { project: projectId, domain: ir.domain, id: ir.id, business_no: ir.businessNo, ir };
  }
  const issue = issues.find(
    (i) => i.record.businessNo === args[0] && selected.some((d) => d.id === i.record.domain),
  );
  if (!issue) missing(`当前项目和需求域中找不到 ${args[0]}。`);
  const ir = issue.record;
  const location = { project: projectId, domain: ir.domain, business_no: ir.businessNo };
  switch (key) {
    case "ir show":
      return { ...location, ir };
    case "ir update": {
      const updates = Object.entries(changesFor(values));
      if (!updates.length) invalid("至少需要一个更新字段。");
      if (values.process !== undefined && updates.length !== 1)
        invalid("进展和详情字段需分开更新。");
      const changed = {},
        before = {};
      for (const [field, value] of updates) {
        if (ir[field] === value) continue;
        before[field] = ir[field] ?? null;
        ir[field] = value;
        changed[field] = value;
      }
      if (changed.process) {
        const field = {
          分析: "turnAnalysisTime",
          开发: "completedAnalysisTime",
          测试: "turnTestTime",
          完成: "completedDate",
        }[ir.process];
        if (field) ir[field] = new Date().toISOString();
      }
      return { ...location, item_id: ir.id, changed, before, ir };
    }
    case "comment list":
      return { ...location, items: issue.comments };
    case "comment add": {
      const comment = {
        id: randomUUID(),
        type: "comment",
        detail: args[1],
        display_author: actor,
        createDate: new Date().toISOString(),
      };
      issue.comments.push(comment);
      return { ...location, comment };
    }
    case "comment delete": {
      const index = issue.comments.findIndex(
        (c) =>
          c.id === args[1] && (values.type === undefined || (c.type ?? "comment") === values.type),
      );
      if (index < 0) missing("该 IR 下找不到目标评论。");
      issue.comments.splice(index, 1);
      return { ...location, id: args[1] };
    }
    default:
      invalid("未知命令。");
  }
}

function run(command, timeout) {
  const path = process.env.ZCODE_CLOUDDRAGON_MOCK_DB
    ? resolve(process.env.ZCODE_CLOUDDRAGON_MOCK_DB)
    : fileURLToPath(new URL("../../.zcode-runtime/clouddragon.sqlite", import.meta.url));
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  try {
    db.exec(`PRAGMA busy_timeout = ${Math.min(2147483647, Math.ceil(timeout * 1000))}`);
    db.exec("CREATE TABLE IF NOT EXISTS catalogue (id INTEGER PRIMARY KEY, data TEXT NOT NULL)");
    // 每次 CLI 调用都是独立进程，读写同一事务可避免并发评论或 IR 更新互相覆盖。
    return db
      .transaction(() => {
        const stored = db.query("SELECT data FROM catalogue WHERE id = 1").get();
        const catalogue = stored ? JSON.parse(stored.data) : initialCatalogue();
        const seeded = !stored || addReleaseProjects(catalogue);
        const data = execute(catalogue, command);
        if (
          seeded ||
          ["ir create", "ir update", "comment add", "comment delete"].includes(command.key)
        ) {
          db.query("INSERT OR REPLACE INTO catalogue(id, data) VALUES (1, ?)").run(
            JSON.stringify(catalogue),
          );
        }
        return data;
      })
      .immediate();
  } finally {
    db.close();
  }
}

let debug = false;
try {
  let parsed;
  try {
    parsed = parseArgs({ args: process.argv.slice(2), options, allowPositionals: true });
  } catch (error) {
    invalid(error.message);
  }
  const { values, positionals } = parsed;
  debug = values.debug === true;
  if (values.help || values.version) {
    process.stdout.write((values.version ? version : usage(...positionals)) + "\n");
  } else {
    const command = checkedCommand(values, positionals);
    const timeout = Number(values.timeout ?? 20);
    if (!Number.isFinite(timeout) || timeout <= 0) invalid("--timeout 需要正数。");
    const data = run(command, timeout);
    process.stdout.write(
      JSON.stringify({ ok: true, data }, null, values.compact ? undefined : 2) + "\n",
    );
  }
} catch (error) {
  const type = error instanceof CliError ? error.name : "ExecutionError";
  process.stderr.write(
    JSON.stringify({ ok: false, error: { type, message: error.message } }) + "\n",
  );
  if (debug) process.stderr.write(error.stack + "\n");
  process.exitCode = type === "ArgumentError" ? 2 : 1;
}
