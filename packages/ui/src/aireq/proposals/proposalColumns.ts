import { readSafeLocalStorage } from "@/lib/browserEnvironment.js";
import {
  AIREQ_PROPOSAL_COLUMNS,
  type AIReqProposalColumn,
  type AIReqProposalTablePreferences,
  type AIReqRequirementGroup,
} from "../contract.js";

export const proposalFieldGroups = {
  basic: { zh: "基础信息", en: "Basics" },
  people: { zh: "用户字段", en: "People" },
  date: { zh: "日期字段", en: "Dates" },
  number: { zh: "数字字段", en: "Numbers" },
  option: { zh: "选项字段", en: "Options" },
  text: { zh: "文本字段", en: "Text" },
};

export const proposalColumns = {
  title: { zh: "标题", en: "Title", width: 176, group: "basic" },
  id: { zh: "需求编号", en: "Requirement ID", width: 148, group: "basic" },
  release: { zh: "PI", en: "PI", width: 100, group: "basic" },
  owner: { zh: "当前责任人", en: "Current owner", width: 108, group: "people" },
  version: { zh: "文档版本", en: "Document version", width: 116, group: "basic" },
  requester: { zh: "需求提出人", en: "Requester", width: 112, group: "people" },
  designOwner: { zh: "设计责任人", en: "Design owner", width: 112, group: "people" },
  developmentOwner: { zh: "开发责任人", en: "Development owner", width: 116, group: "people" },
  testingOwner: { zh: "测试责任人", en: "Test owner", width: 116, group: "people" },
  submitter: { zh: "提交人", en: "Submitter", width: 106, group: "people" },
  date: { zh: "创建时间", en: "Created at", width: 156, group: "date" },
  process: { zh: "进展", en: "Status", width: 88, group: "option" },
  dwellTime: { zh: "停留时间", en: "Time in status", width: 96, group: "date" },
  srCount: { zh: "SR 数量", en: "SR count", width: 96, group: "number" },
  domain: { zh: "需求空间", en: "Requirement domain", width: 136, group: "basic" },
  iterateId: { zh: "迭代", en: "Iteration", width: 128, group: "basic" },
  subType: { zh: "需求类型", en: "Requirement type", width: 120, group: "basic" },
  baseline: { zh: "基线状态", en: "Baseline status", width: 120, group: "basic" },
  creator: { zh: "创建人", en: "Creator", width: 112, group: "people" },
  relatedOwner: { zh: "关联责任人", en: "Related owner", width: 120, group: "people" },
  modifiedBy: { zh: "需求更新人", en: "Updated by", width: 120, group: "people" },
  developEndTime: {
    zh: "计划开发结束时间",
    en: "Planned development end",
    width: 172,
    group: "date",
  },
  testingEndTime: { zh: "计划测试结束时间", en: "Planned testing end", width: 172, group: "date" },
  expectedImplementationDate: {
    zh: "用户期望交付时间",
    en: "Expected delivery",
    width: 172,
    group: "date",
  },
  turnAnalysisTime: { zh: "转分析时间", en: "Entered analysis", width: 156, group: "date" },
  completedAnalysisTime: { zh: "转开发时间", en: "Entered development", width: 156, group: "date" },
  turnTestTime: { zh: "转测试时间", en: "Entered testing", width: 156, group: "date" },
  completedDate: { zh: "完成时间", en: "Completed at", width: 156, group: "date" },
  estimatedWorkloadManday: {
    zh: "预估|卷积工作量",
    en: "Estimated | total workload",
    width: 152,
    group: "number",
  },
  pmsWorkloadKloc: {
    zh: "预估代码行(KLOC)",
    en: "Estimated lines (KLOC)",
    width: 168,
    group: "number",
  },
  priorityLevel: { zh: "优先级", en: "Priority", width: 96, group: "option" },
  health_degree: { zh: "健康状态", en: "Health status", width: 114, group: "option" },
  needBreak: { zh: "是否需要分解", en: "Requires decomposition", width: 136, group: "option" },
  needDevelop: { zh: "是否需要代码开发", en: "Requires development", width: 164, group: "option" },
  isDecompose: { zh: "分解状态", en: "Decomposition status", width: 132, group: "option" },
  correspondingCategory: { zh: "所属领域", en: "Category", width: 132, group: "option" },
  industry: {
    zh: "是否涉及网络安全",
    en: "Involves network security",
    width: 160,
    group: "option",
  },
  pmsNetworkSecurityIdentity: {
    zh: "网络安全标识",
    en: "Network security designation",
    width: 175,
    group: "option",
  },
  implTracingState: {
    zh: "需求开发跟踪状态",
    en: "Development tracking",
    width: 180,
    group: "option",
  },
  isRelatedMicroService: {
    zh: "是否需要关联微服务",
    en: "Requires a microservice link",
    width: 168,
    group: "option",
  },
  isRelatedDoc: {
    zh: "是否需要关联文档",
    en: "Requires a document link",
    width: 168,
    group: "option",
  },
  isRelatedArc: {
    zh: "是否需要关联架构元素",
    en: "Requires an architecture link",
    width: 184,
    group: "option",
  },
  trustCategory: { zh: "需求分类", en: "Requirement category", width: 136, group: "option" },
  verificationPolicy: { zh: "验证策略", en: "Verification policy", width: 140, group: "option" },
  pmsStatus: { zh: "PMS状态", en: "PMS status", width: 120, group: "option" },
  serviceName: { zh: "微服务", en: "Microservice", width: 136, group: "text" },
  labels: { zh: "标签", en: "Labels", width: 136, group: "text" },
  noBreakReason: {
    zh: "无需分解原因",
    en: "Why decomposition is unnecessary",
    width: 170,
    group: "text",
  },
  noDevelopReason: {
    zh: "无需代码开发原因",
    en: "Why development is unnecessary",
    width: 176,
    group: "text",
  },
  demandSource: { zh: "需求来源", en: "Source", width: 136, group: "text" },
  rrBusinessNo: { zh: "关联RR", en: "Related RR", width: 142, group: "text" },
  pmsRRNumber: { zh: "下游RR编号", en: "Downstream RR number", width: 156, group: "text" },
  businessCode: { zh: "业务编码", en: "Business code", width: 130, group: "text" },
  targetCustomer: { zh: "目标用户", en: "Target users", width: 136, group: "text" },
  netype: { zh: "架构元素", en: "Architecture element", width: 136, group: "text" },
  board: { zh: "硬件单板信息", en: "Hardware board", width: 144, group: "text" },
  verificationPolicyDesc: {
    zh: "验证策略描述",
    en: "Verification policy description",
    width: 180,
    group: "text",
  },
  pmsPI: { zh: "PMS(PI)", en: "PMS (PI)", width: 128, group: "text" },
  systemid: { zh: "系统ID", en: "System ID", width: 122, group: "text" },
} satisfies Record<
  AIReqProposalColumn,
  { zh: string; en: string; width: number; group: keyof typeof proposalFieldGroups }
>;
export type ProposalColumn = AIReqProposalColumn;
export type ProposalSort = AIReqProposalTablePreferences["sort"];
export type ProposalTablePreferences = AIReqProposalTablePreferences;

const legacyCompactColumns: ProposalColumn[] = ["title", "id", "release", "owner", "version"];
const previousAdaptiveColumns: ProposalColumn[] = [
  "title",
  "id",
  "owner",
  "developmentOwner",
  "testingOwner",
  "version",
];
const priorityColumns: ProposalColumn[] = [
  "process",
  "dwellTime",
  "estimatedWorkloadManday",
  "developmentOwner",
  "testingOwner",
];
const optionalColumns = new Set(priorityColumns);
export const compactColumns: ProposalColumn[] = [
  "title",
  "id",
  "owner",
  ...priorityColumns,
  "version",
];
export const detailedColumns: ProposalColumn[] = [...AIREQ_PROPOSAL_COLUMNS];
export const defaultProposalSort: ProposalSort = { column: "date", direction: "descending" };
export const defaultProposalPreferences: ProposalTablePreferences = {
  autoFit: true,
  columns: compactColumns,
  sort: defaultProposalSort,
};

export function migrateCompactPreferences(
  saved: ProposalTablePreferences,
): ProposalTablePreferences {
  const previous = saved.autoFit
    ? previousAdaptiveColumns
    : saved.autoFit === undefined && saved.sort.column !== "release"
      ? legacyCompactColumns
      : undefined;
  if (
    !previous ||
    saved.columns.length !== previous.length ||
    !previous.every((column, index) => column === saved.columns[index])
  )
    return saved;
  return { ...saved, columns: compactColumns, autoFit: true };
}

export function visibleProposalColumns(
  { columns, autoFit }: ProposalTablePreferences,
  availableWidth: number,
  actionsWidth: number,
): ProposalColumn[] {
  if (!autoFit) return columns;
  // 宽度预算按精简列优先级消耗，与已保存的显示顺序无关。
  const baseWidth = columns.reduce(
    (width, column) => width + (optionalColumns.has(column) ? 0 : proposalColumns[column].width),
    actionsWidth,
  );
  let remaining = availableWidth - baseWidth;
  const included = new Set<ProposalColumn>();
  for (const column of priorityColumns) {
    const width = proposalColumns[column].width;
    if (remaining < width || !columns.includes(column)) continue;
    remaining -= width;
    included.add(column);
  }
  return columns.filter((column) => !optionalColumns.has(column) || included.has(column));
}

function isProposalColumn(value: unknown): value is ProposalColumn {
  return typeof value === "string" && Object.hasOwn(proposalColumns, value);
}

export function readLegacyProposalPreferences(key: string): ProposalTablePreferences | undefined {
  const stored = readSafeLocalStorage(key);
  if (!stored) return;
  try {
    const value = JSON.parse(stored);
    const columns = Array.isArray(value?.columns)
      ? [...new Set<ProposalColumn>(value.columns.filter(isProposalColumn))]
      : [];
    const validSort =
      isProposalColumn(value?.sort?.column) &&
      (value.sort.direction === "ascending" || value.sort.direction === "descending");
    if (!columns.length) return;
    return {
      // 保留旧自适应标记，才能区分旧预设和用户明确关闭自适应的列配置。
      ...(typeof value.autoFit === "boolean" ? { autoFit: value.autoFit } : {}),
      columns,
      sort:
        validSort &&
        (columns.includes(value.sort.column) ||
          (value.sort.column === "date" && value.sort.direction === "descending"))
          ? value.sort
          : defaultProposalSort,
    };
  } catch {
    return;
  }
}

const processLabels: Record<string, string> = {
  初始: "Initial",
  分析: "Analysis",
  开发: "Development",
  测试: "Testing",
  完成: "Complete",
};

const proposalPersonFields = {
  owner: "delivererOwner",
  requester: "owner",
  designOwner: "seId",
  developmentOwner: "de",
  testingOwner: "te",
} as const;

export function proposalPerson(
  item: AIReqRequirementGroup,
  column: keyof typeof proposalPersonFields,
) {
  return item[proposalPersonFields[column]];
}

export function proposalProcessLabel(value: string, zh: boolean): string {
  return zh ? value : Object.hasOwn(processLabels, value) ? processLabels[value]! : value;
}

export function proposalDate(value: unknown) {
  if (typeof value !== "string") return;
  // 云龙未带时区的日期时间按北京时间解释，避免浏览器时区影响排序和展示。
  const text = value.trim();
  const local = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text + "T00:00:00" : text;
  const source = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(local)
    ? local.replace(" ", "T") + "+08:00"
    : local;
  const timestamp = Date.parse(source);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

const statusStartFields = {
  分析: "turnAnalysisTime",
  开发: "completedAnalysisTime",
  测试: "turnTestTime",
  完成: "completedDate",
} as const;

export function proposalDwellTime(item: AIReqRequirementGroup, now: number): number | undefined {
  const status = item.process;
  const field = statusStartFields[status as keyof typeof statusStartFields];
  const enteredAt = proposalDate(
    status === "初始" ? item.createdAt : field && item.cloudFields?.[field],
  );
  return enteredAt === undefined || enteredAt > now ? undefined : now - enteredAt;
}

export function proposalColumnValue(
  item: AIReqRequirementGroup,
  column: ProposalColumn,
  releaseTitles: ReadonlyMap<string, string>,
  now: number,
): string | number | undefined {
  switch (column) {
    case "title":
      return item.title;
    case "id":
      return item.id;
    case "release":
      return releaseTitles.get(item.releaseId);
    case "owner":
    case "requester":
    case "designOwner":
    case "developmentOwner":
    case "testingOwner":
      return proposalPerson(item, column);
    case "version":
      return item.documentVersion?.number;
    case "submitter":
      return item.submittedBy || undefined;
    case "date":
      return proposalDate(item.createdAt);
    case "process":
      return item.process;
    case "dwellTime":
      return proposalDwellTime(item, now);
    case "srCount":
      return item.srIds.length;
    default: {
      const value =
        item.cloudFields?.[column] ??
        (column === "estimatedWorkloadManday" ? item.cloudFields?.sumWorkloadManday : undefined);
      if (value === undefined) return undefined;
      const { group } = proposalColumns[column];
      if (group === "date") return proposalDate(value);
      if (Array.isArray(value)) return value.join("、");
      if (group === "number" && typeof value !== "boolean" && Number.isFinite(Number(value)))
        return Number(value);
      return typeof value === "boolean" ? Number(value) : value;
    }
  }
}

export function compareProposalValues(
  a: string | number | undefined,
  b: string | number | undefined,
  direction: ProposalSort["direction"],
  collator: Intl.Collator,
): number {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  const comparison =
    typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
  return direction === "ascending" ? comparison : -comparison;
}

export type ProposalColumnFilters = Partial<Record<ProposalColumn, string[]>>;

const extraFilterColumns = new Set<ProposalColumn>([
  "release",
  "version",
  "labels",
  "domain",
  "iterateId",
  "serviceName",
  "subType",
  "baseline",
  "pmsPI",
]);

export function isFilterableProposalColumn(column: ProposalColumn): boolean {
  const { group } = proposalColumns[column];
  return group === "people" || group === "option" || extraFilterColumns.has(column);
}

export function proposalFilterValues(
  item: AIReqRequirementGroup,
  column: ProposalColumn,
): string[] {
  switch (column) {
    case "release":
      return [item.releaseId];
    case "version":
      // 无文档与已有但尚未定版的文档是不同的列表状态。
      if (!item.documentVersion) return [""];
      return [item.documentVersion.confirmation ? "confirmed" : "unconfirmed"];
    case "process":
      return [item.process ?? ""];
    case "submitter":
      return [item.submittedBy || ""];
    case "owner":
    case "requester":
    case "designOwner":
    case "developmentOwner":
    case "testingOwner":
      return [proposalPerson(item, column) ?? ""];
    default: {
      const field = column as keyof NonNullable<AIReqRequirementGroup["cloudFields"]>;
      const value = item.cloudFields?.[field];
      if (Array.isArray(value)) {
        const values = value.filter((entry) => entry.trim());
        return values.length ? values : [""];
      }
      return [String(value ?? "")];
    }
  }
}

export function proposalFilterLabel(
  column: ProposalColumn,
  value: string,
  releaseTitles: ReadonlyMap<string, string>,
  zh: boolean,
): string {
  if (!value && column !== "release" && column !== "version") return zh ? "未设置" : "Not set";
  switch (column) {
    case "release":
      // 筛选项保留 PI 作为键；旧条件中已不存在的 PI 也不能回退到内部编号。
      if (!value) return zh ? "未分配" : "Unassigned";
      return releaseTitles.get(value)?.trim() || (zh ? "未提供名称" : "Name not provided");
    case "version":
      if (!value) return zh ? "暂无文档" : "No documents";
      return value === "confirmed" ? (zh ? "已定版" : "Confirmed") : zh ? "未定版" : "Unconfirmed";
    case "process":
      return proposalProcessLabel(value, zh);
    default:
      if (proposalColumns[column].group === "option") {
        if (value === "true") return zh ? "是" : "Yes";
        if (value === "false") return zh ? "否" : "No";
      }
      return value;
  }
}
