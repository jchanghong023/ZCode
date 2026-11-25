import { useMemo, useRef, useState } from "react";
import { Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { Input } from "@/components/ui/input.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import type { AIReqRequirementGroup } from "../contract.js";
import {
  proposalColumns,
  proposalFilterLabel,
  proposalFilterValues,
  type ProposalColumn,
} from "./proposalColumns.js";

export interface ProposalFilterOptionsProps {
  column: ProposalColumn;
  items: readonly AIReqRequirementGroup[];
  selected: readonly string[];
  releaseTitles: ReadonlyMap<string, string>;
  collator: Intl.Collator;
  zh: boolean;
  onChange(values: string[]): void;
}

export function AIReqProposalColumnFilter(props: ProposalFilterOptionsProps) {
  const { column, selected, zh } = props;
  const label = proposalColumns[column][zh ? "zh" : "en"];
  const filterLabel = zh ? `筛选 ${label}` : `Filter by ${label}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={filterLabel}
          data-filtered={selected.length ? true : undefined}
          className="-mx-1 inline-flex min-h-8 max-w-[calc(100%+0.5rem)] items-center gap-1 rounded-sm px-1 text-left font-medium hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-input-border-focused data-[filtered=true]:bg-selected"
        >
          {label}
          <Filter
            aria-hidden="true"
            className={`size-3.5 shrink-0 ${selected.length ? "fill-current text-foreground" : "text-foreground-subtle"}`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={filterLabel}
        collisionPadding={8}
        className="w-64 max-w-[calc(100vw-1rem)] gap-2 p-2"
      >
        <AIReqProposalFilterOptions {...props} />
      </PopoverContent>
    </Popover>
  );
}

export function AIReqProposalFilterOptions({
  column,
  items,
  selected,
  releaseTitles,
  collator,
  zh,
  onChange,
  focusSearch = false,
  showClear = true,
}: ProposalFilterOptionsProps & { focusSearch?: boolean; showClear?: boolean }) {
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const values = new Set([
      ...selected,
      ...items.flatMap((item) => proposalFilterValues(item, column)),
    ]);
    return [...values]
      .map((value) => ({ value, label: proposalFilterLabel(column, value, releaseTitles, zh) }))
      .sort(
        (a, b) =>
          Number(Boolean(a.value)) - Number(Boolean(b.value)) || collator.compare(a.label, b.label),
      );
  }, [items, column, selected, releaseTitles, collator, zh]);
  const term = query.trim().toLocaleLowerCase();
  const matches = options.filter(
    ({ label, value }) =>
      label.toLocaleLowerCase().includes(term) || value.toLocaleLowerCase().includes(term),
  );
  const selection = new Set(selected);
  const checkedCount = matches.filter(({ value }) => selection.has(value)).length;
  const allChecked = matches.length > 0 && checkedCount === matches.length;

  function toggleValues(values: string[], checked: boolean) {
    const next = new Set(selected);
    for (const value of values) {
      if (checked) next.add(value);
      else next.delete(value);
    }
    onChange([...next]);
  }

  return (
    <>
      <div className="relative">
        <Input
          ref={searchInput}
          autoFocus={focusSearch}
          type="search"
          aria-label={zh ? "搜索筛选选项" : "Search filter options"}
          placeholder={zh ? "输入关键词" : "Enter keyword"}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          className="h-8 pl-8"
        />
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-2 left-2 size-4 text-foreground-subtle"
        />
      </div>
      <label className="flex min-h-8 cursor-pointer items-center gap-2 px-2">
        <Checkbox
          checked={allChecked || (checkedCount > 0 && "indeterminate")}
          disabled={!matches.length}
          onCheckedChange={(checked) =>
            toggleValues(
              matches.map(({ value }) => value),
              checked === true,
            )
          }
        />
        {zh ? "全选" : "Select all"}
      </label>
      <div className="max-h-56 min-h-0 overflow-y-auto overscroll-contain border-t border-border pt-1">
        {matches.map(({ value, label }) => (
          <label
            key={value}
            className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-hover"
          >
            <Checkbox
              checked={selection.has(value)}
              onCheckedChange={(checked) => toggleValues([value], checked === true)}
            />
            <span className="wrap-anywhere">{label}</span>
          </label>
        ))}
        {!matches.length && (
          <p role="status" className="px-2 py-2 text-ui-caption text-foreground-subtle">
            {zh ? "没有匹配的选项。" : "No matching options."}
          </p>
        )}
      </div>
      {showClear && selected.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          className="self-end"
          onClick={() => {
            onChange([]);
            searchInput.current?.focus();
          }}
        >
          {zh ? "清空选择" : "Clear selection"}
        </Button>
      )}
    </>
  );
}
