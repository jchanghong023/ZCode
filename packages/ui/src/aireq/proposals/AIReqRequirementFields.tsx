import { ChevronRight } from "lucide-react";
import { AIREQ_CLOUD_PROPOSAL_COLUMNS, type AIReqRequirementDetails } from "../contract.js";
import { proposalColumns } from "./proposalColumns.js";

const fieldLabels: Record<string, readonly [zh: string, en: string]> = {
  businessNo: ["需求编号", "Requirement ID"],
  name: ["标题", "Title"],
  delivererOwner: ["当前责任人", "Current owner"],
  owner: ["需求提出人", "Requester"],
  seId: ["设计责任人", "Design owner"],
  de: ["开发责任人", "Development owner"],
  te: ["测试责任人", "Test owner"],
  submitter: ["提交人", "Submitter"],
  createDate: ["创建时间", "Created at"],
  pi: ["PI", "PI"],
  piName: ["Release 名称", "Release name"],
  process: ["进展", "Status"],
  ...Object.fromEntries(
    AIREQ_CLOUD_PROPOSAL_COLUMNS.map((key) => [
      key,
      [proposalColumns[key].zh, proposalColumns[key].en],
    ]),
  ),
  estimatedWorkloadManday: ["预估工作量", "Estimated workload"],
  sumWorkloadManday: ["卷积工作量", "Total workload"],
  attachment: ["附件", "Attachments"],
};

// 业务栏按字段语义展示；原始字段仍保留云龙返回的完整值。
function businessFieldValue(name: string, raw: string | undefined, zh: boolean): string {
  if (!raw?.trim() || raw === "null") return "—";
  if (
    Object.hasOwn(proposalColumns, name) &&
    proposalColumns[name as keyof typeof proposalColumns].group === "option"
  ) {
    if (raw === "true") return zh ? "是" : "Yes";
    if (raw === "false") return zh ? "否" : "No";
  }
  if (name === "labels" && raw.trimStart().startsWith("[")) {
    try {
      const labels: unknown = JSON.parse(raw);
      if (Array.isArray(labels)) {
        if (!labels.length) return zh ? "无标签" : "No labels";
        const names = labels.map((label: unknown) =>
          typeof label === "string"
            ? label
            : label && typeof label === "object" && "name" in label
              ? label.name
              : undefined,
        );
        if (names.every((name) => typeof name === "string")) return names.join(zh ? "、" : ", ");
      }
    } catch {
      // 非标准标签值按云龙返回内容显示，不能误报为空。
    }
  }
  return raw;
}

const primaryFields = ["piName", "delivererOwner", "createDate"];
const optionalFields = ["priorityLevel", "labels"];
const disclosureClass =
  "flex cursor-pointer list-none items-center gap-2 rounded-sm py-3 font-medium focus-visible:outline-2 focus-visible:outline-input-border-focused [&::-webkit-details-marker]:hidden";
const chevronClass = "size-3.5 shrink-0 text-foreground-subtle group-open:rotate-90";

export function AIReqRequirementFields({
  fields,
  zh,
}: {
  fields: AIReqRequirementDetails["fields"];
  zh: boolean;
}) {
  const values = new Map(fields.map(({ name, value }) => [name, value]));
  const overview = [...primaryFields, ...optionalFields.filter((key) => values.has(key))];
  const other = Object.keys(fieldLabels).filter(
    (key) => !overview.includes(key) && values.has(key),
  );
  const label = zh ? "需求信息" : "Requirement information";

  function fieldRow(name: string) {
    return (
      <div
        key={name}
        className="grid grid-cols-[minmax(5.25rem,0.8fr)_minmax(0,1.35fr)] items-baseline gap-x-3 py-2"
      >
        <dt className="wrap-anywhere text-ui-caption text-foreground-subtle">
          {fieldLabels[name]?.[zh ? 0 : 1] ?? name}
        </dt>
        <dd className="wrap-anywhere whitespace-pre-wrap font-medium tabular-nums">
          {businessFieldValue(name, values.get(name), zh)}
        </dd>
      </div>
    );
  }
  return (
    <aside
      aria-label={label}
      tabIndex={0}
      className="min-h-0 min-w-0 overflow-auto overscroll-contain border-l border-border bg-surface px-5 py-5 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-input-border-focused lg:px-6"
    >
      <h2 className="mb-3 text-ui-lg font-semibold">{label}</h2>
      <dl className="mb-4 divide-y divide-border">{overview.map(fieldRow)}</dl>
      {other.length > 0 && (
        <details className="group border-t border-border">
          <summary className={disclosureClass}>
            <ChevronRight aria-hidden="true" className={chevronClass} />
            {zh ? "更多业务字段" : "More business fields"}
          </summary>
          <dl className="mb-3 divide-y divide-border">{other.map(fieldRow)}</dl>
        </details>
      )}
      <details className="group border-t border-border">
        <summary className={disclosureClass}>
          <ChevronRight aria-hidden="true" className={chevronClass} />
          {zh ? "原始字段" : "Raw fields"}
        </summary>
        <dl className="divide-y divide-border">
          {fields.map(({ name, value }) => (
            <div key={name} className="space-y-0.5 py-2 wrap-anywhere">
              <dt className="font-mono text-ui-caption text-foreground-subtle">{name}</dt>
              <dd className="whitespace-pre-wrap">{value === "" ? '""' : value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </aside>
  );
}
