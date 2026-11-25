import { readSafeLocalStorage } from "@/lib/browserEnvironment.js";
import {
  AIREQ_PROPOSAL_COLUMNS,
  type AIReqProposalColumn,
  type AIReqProposalTablePreferences,
  type AIReqRequirementGroup,
} from "../contract.js";

export const proposalColumns = {
  title: { zh: "标题", en: "Title", width: 176 },
  id: { zh: "需求编号", en: "Requirement ID", width: 148 },
  release: { zh: "Release", en: "Release", width: 100 },
  owner: { zh: "当前责任人", en: "Current owner", width: 108 },
  version: { zh: "文档版本", en: "Document version", width: 116 },
  requester: { zh: "需求提出人", en: "Requester", width: 112 },
  designOwner: { zh: "设计责任人", en: "Design owner", width: 112 },
  developmentOwner: { zh: "开发责任人", en: "Development owner", width: 124 },
  testingOwner: { zh: "测试责任人", en: "Test owner", width: 112 },
  submitter: { zh: "提交人", en: "Submitter", width: 106 },
  date: { zh: "提交时间", en: "Submitted at", width: 156 },
  process: { zh: "云龙进展", en: "CloudDragon status", width: 136 },
  srCount: { zh: "SR 数量", en: "SR count", width: 96 },
} satisfies Record<AIReqProposalColumn, { zh: string; en: string; width: number }>;
export type ProposalColumn = AIReqProposalColumn;
export type ProposalSort = AIReqProposalTablePreferences["sort"];
export type ProposalTablePreferences = AIReqProposalTablePreferences;

export const compactColumns: ProposalColumn[] = ["title", "id", "release", "owner", "version"];
export const detailedColumns: ProposalColumn[] = [...AIREQ_PROPOSAL_COLUMNS];
export const defaultProposalSort: ProposalSort = { column: "date", direction: "descending" };
export const defaultProposalPreferences: ProposalTablePreferences = {
  columns: compactColumns,
  sort: defaultProposalSort,
};

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

export function proposalColumnValue(
  item: AIReqRequirementGroup,
  column: ProposalColumn,
  releaseTitles: ReadonlyMap<string, string>,
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
    case "date": {
      const value = Date.parse(item.createdAt);
      return Number.isFinite(value) ? value : undefined;
    }
    case "process":
      return item.process;
    case "srCount":
      return item.srIds.length;
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
