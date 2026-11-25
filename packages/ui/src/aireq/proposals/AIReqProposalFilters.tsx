import { ArrowLeft, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import {
  AIReqProposalFilterOptions,
  type ProposalFilterOptionsProps,
} from "./AIReqProposalColumnFilter.js";
import {
  detailedColumns,
  isFilterableProposalColumn,
  proposalColumns,
  proposalFilterLabel,
  type ProposalColumn,
} from "./proposalColumns.js";

type ColumnFilterBarProps = Pick<
  ProposalFilterOptionsProps,
  "items" | "releaseTitles" | "collator" | "zh"
> & {
  applied: [ProposalColumn, string[]][];
  onChangeColumn(column: ProposalColumn, values: string[]): void;
};

const commonFilterColumns: ProposalColumn[] = [
  "subType",
  "domain",
  "process",
  "priorityLevel",
  "labels",
  "owner",
  "release",
  "version",
];
const otherFilterColumns = detailedColumns.filter(
  (field) => isFilterableProposalColumn(field) && !commonFilterColumns.includes(field),
);

export function AIReqProposalFilters({
  query,
  applied,
  hasFilters,
  releaseTitles,
  searchInput,
  items,
  collator,
  zh,
  children,
  onSearch,
  onChangeColumn,
  onClear,
}: ColumnFilterBarProps & {
  query: string;
  hasFilters: boolean;
  searchInput: RefObject<HTMLInputElement | null>;
  children: ReactNode;
  onSearch(value: string): void;
  onClear(): void;
}) {
  const [editing, setEditing] = useState(false);

  function restoreSearchFocus() {
    searchInput.current?.focus();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {applied.map(([column, values]) => (
        <FilterChip
          key={column}
          label={proposalColumns[column][zh ? "zh" : "en"]}
          value={values
            .map((value) => proposalFilterLabel(column, value, releaseTitles, zh))
            .join(zh ? " | " : ", ")}
          zh={zh}
          onRemove={() => {
            onChangeColumn(column, []);
            restoreSearchFocus();
          }}
        />
      ))}
      {!editing && query.trim() && (
        <FilterChip
          label={zh ? "关键词" : "Keyword"}
          value={query.trim()}
          zh={zh}
          onEdit={() => {
            setEditing(true);
            restoreSearchFocus();
          }}
          onRemove={() => {
            onSearch("");
            restoreSearchFocus();
          }}
        />
      )}
      <AddProposalFilter
        applied={applied}
        items={items}
        releaseTitles={releaseTitles}
        collator={collator}
        zh={zh}
        onChangeColumn={onChangeColumn}
        query={query}
        editing={editing}
        searchInput={searchInput}
        onEditingChange={setEditing}
        onSearch={onSearch}
      />
      <div className="ml-auto flex items-center gap-2">
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => {
              onClear();
              restoreSearchFocus();
            }}
          >
            {zh ? "清除筛选" : "Clear filters"}
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  value,
  zh,
  onRemove,
  onEdit,
}: {
  label: string;
  value: string;
  zh: boolean;
  onRemove(): void;
  onEdit?(): void;
}) {
  const summary = `${label}${zh ? "：" : ": "}${value}`;
  return (
    <div
      data-aireq-theme-chip
      className="inline-flex h-8 max-w-[min(100%,28rem)] min-w-0 items-center gap-1 rounded-lg bg-secondary pl-2.5 text-ui-caption text-secondary-foreground"
    >
      {onEdit ? (
        <button
          type="button"
          title={summary}
          aria-label={zh ? "编辑关键词" : "Edit keyword"}
          className="min-w-0 truncate rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-input-border-focused"
          onClick={onEdit}
        >
          <span className="text-foreground-subtle">
            {label}
            {zh ? "：" : ": "}
          </span>
          <span className="font-medium">{value}</span>
        </button>
      ) : (
        <span className="min-w-0 truncate" title={summary}>
          <span className="text-foreground-subtle">
            {label}
            {zh ? "：" : ": "}
          </span>
          <span className="font-medium">{value}</span>
        </span>
      )}
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="mr-0.5 shrink-0"
        aria-label={zh ? `移除 ${summary}` : `Remove ${summary}`}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

function AddProposalFilter({
  items,
  applied,
  releaseTitles,
  collator,
  zh,
  onChangeColumn,
  query,
  editing,
  searchInput,
  onEditingChange,
  onSearch,
}: ColumnFilterBarProps & {
  query: string;
  editing: boolean;
  searchInput: RefObject<HTMLInputElement | null>;
  onEditingChange(editing: boolean): void;
  onSearch(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [column, setColumn] = useState<ProposalColumn>();
  const [fieldSearch, setFieldSearch] = useState("");
  const [draft, setDraft] = useState<string[]>([]);
  const fieldInput = useRef<HTMLInputElement>(null);
  const name = (field: ProposalColumn) => proposalColumns[field][zh ? "zh" : "en"];
  const label = zh ? "添加筛选条件" : "Add filter";
  const searchLabel = zh ? "搜索标题、编号或原文" : "Search title, ID, or original text";
  const term = fieldSearch.trim().toLocaleLowerCase();
  const sections = [
    { label: zh ? "常用字段" : "Common fields", fields: commonFilterColumns },
    { label: zh ? "其他字段" : "Other fields", fields: otherFilterColumns },
  ]
    .map((section) => ({
      ...section,
      fields: section.fields.filter(
        (field) =>
          name(field).toLocaleLowerCase().includes(term) || field.toLowerCase().includes(term),
      ),
    }))
    .filter(({ fields }) => fields.length);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setColumn(undefined);
      setFieldSearch("");
      setDraft([]);
    }
  }

  function focusFields() {
    setColumn(undefined);
    requestAnimationFrame(() => fieldInput.current?.focus());
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      {column && !applied.some(([field]) => field === column) && (
        <FilterChip label={name(column)} value="" zh={zh} onRemove={() => changeOpen(false)} />
      )}
      <div className="relative min-w-40 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-2 left-2 size-4 text-foreground-subtle"
        />
        <PopoverTrigger asChild>
          <Input
            ref={searchInput}
            type="text"
            role="combobox"
            aria-label={searchLabel}
            aria-description={
              zh ? "点击或按向下键添加筛选条件" : "Click or press Down Arrow to add a filter"
            }
            placeholder={
              zh
                ? "点击添加筛选条件，或输入标题、编号搜索"
                : "Click to add a filter or search titles and IDs"
            }
            value={editing ? query : ""}
            onChange={(event) => {
              onEditingChange(true);
              changeOpen(false);
              onSearch(event.currentTarget.value);
            }}
            onBlur={() => onEditingChange(false)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                onEditingChange(false);
                changeOpen(false);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                focusFields();
              }
            }}
            className="h-8 bg-transparent pr-8 pl-8"
          />
        </PopoverTrigger>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-2 right-2 size-4 text-foreground-subtle"
        />
      </div>
      <PopoverContent
        align="start"
        aria-label={label}
        collisionPadding={8}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="w-64 max-w-[calc(100vw-1rem)] gap-2 p-2"
      >
        {column ? (
          <>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={zh ? "返回筛选字段" : "Back to fields"}
                onClick={focusFields}
              >
                <ArrowLeft aria-hidden="true" />
              </Button>
              <span className="font-medium">{name(column)}</span>
            </div>
            <AIReqProposalFilterOptions
              key={column}
              column={column}
              items={items}
              releaseTitles={releaseTitles}
              collator={collator}
              selected={draft}
              zh={zh}
              onChange={setDraft}
              focusSearch
              showClear={false}
            />
            <div className="flex justify-end gap-2 border-t border-border pt-2">
              <Button
                type="button"
                onClick={() => {
                  onChangeColumn(column, draft);
                  changeOpen(false);
                }}
              >
                {zh ? "确定" : "Apply"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!draft.length}
                onClick={() => setDraft([])}
              >
                {zh ? "清空" : "Clear"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Input
              ref={fieldInput}
              type="search"
              aria-label={zh ? "搜索筛选字段" : "Search filter fields"}
              placeholder={zh ? "搜索筛选字段" : "Search filter fields"}
              value={fieldSearch}
              onChange={(event) => setFieldSearch(event.currentTarget.value)}
            />
            <div className="max-h-64 overflow-y-auto overscroll-contain">
              {sections.map(({ label: heading, fields }) => (
                <section key={heading} aria-label={heading}>
                  <h3 className="px-2 pt-2 pb-1 text-ui-caption font-medium text-foreground-subtle">
                    {heading}
                  </h3>
                  {fields.map((field) => (
                    <Button
                      key={field}
                      type="button"
                      variant="ghost"
                      className="w-full justify-between"
                      onClick={() => {
                        setDraft(
                          applied.find(([selectedField]) => selectedField === field)?.[1] ?? [],
                        );
                        setColumn(field);
                      }}
                    >
                      {name(field)}
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  ))}
                </section>
              ))}
              {!sections.length && (
                <p role="status" className="px-2 py-2 text-ui-caption text-foreground-subtle">
                  {zh ? "没有匹配的字段。" : "No matching fields."}
                </p>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
