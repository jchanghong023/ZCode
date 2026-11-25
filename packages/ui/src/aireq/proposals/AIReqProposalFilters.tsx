import { ListFilter, Search, X } from "lucide-react";
import { useRef, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import type { AIReqReleaseSummary } from "../contract.js";
import { proposalProcessLabel } from "./proposalColumns.js";

export type ProposalFilters = {
  query: string;
  submitter: string;
  version: string;
  process: string;
};

export function AIReqProposalFilters({
  filters: { query, submitter, version, process },
  submitters,
  processes,
  releases,
  releaseId,
  searchInput,
  zh,
  children,
  onChange,
  onReleaseChange,
  onClear,
}: {
  filters: ProposalFilters;
  submitters: string[];
  processes: string[];
  releases: AIReqReleaseSummary[];
  releaseId?: string;
  searchInput: RefObject<HTMLInputElement | null>;
  zh: boolean;
  children: ReactNode;
  onChange: (field: keyof ProposalFilters, value: string) => void;
  onReleaseChange: (id?: string) => void;
  onClear: () => void;
}) {
  const moreButton = useRef<HTMLButtonElement>(null);
  const moreLabel = zh ? "更多筛选" : "More filters";
  const submitterLabel = zh ? "提交人" : "Submitter";
  const statusLabel = zh ? "定版状态" : "Confirmation status";
  const processLabel = zh ? "云龙进展" : "CloudDragon status";
  const searchLabel = zh ? "搜索标题、编号或原文" : "Search title, ID, or original text";
  const appliedFilters = [
    {
      field: "version" as const,
      active: version !== "all",
      label: statusLabel,
      value:
        version === "confirmed" ? (zh ? "已定版" : "Confirmed") : zh ? "未定版" : "Unconfirmed",
    },
    {
      field: "process" as const,
      active: process !== "all",
      label: processLabel,
      value: proposalProcessLabel(process.slice("process:".length), zh),
    },
  ].filter(({ active }) => active);
  const additionalCount = appliedFilters.length;
  const active = Boolean(query.trim() || releaseId || submitter !== "all" || additionalCount);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-32 max-w-44 flex-[1_1_9rem]">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-foreground-subtle"
          />
          <Input
            ref={searchInput}
            aria-label={searchLabel}
            placeholder={zh ? "搜索需求" : "Search requirements"}
            value={query}
            onChange={(event) => onChange("query", event.target.value)}
            className="h-8 rounded-lg pl-8"
          />
        </div>
        <Select
          value={releaseId ? `release:${releaseId}` : "all"}
          onValueChange={(value) =>
            onReleaseChange(value === "all" ? undefined : value.slice("release:".length))
          }
          disabled={!releases.length}
        >
          <SelectTrigger
            aria-label={zh ? "筛选 Release" : "Filter by Release"}
            size="lg"
            className="min-w-40 max-w-72 flex-[2_1_12rem]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value="all">{zh ? "全部需求" : "All requirements"}</SelectItem>
            {releases.map((release) => (
              <SelectItem key={release.id} value={`release:${release.id}`}>
                {release.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={submitter} onValueChange={(value) => onChange("submitter", value)}>
          <SelectTrigger
            size="lg"
            aria-label={submitterLabel}
            className="min-w-28 max-w-48 flex-[1_1_8rem]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value="all">{zh ? "全部提交人" : "All submitters"}</SelectItem>
            {submitters.map((id) => (
              <SelectItem key={id} value={`submitter:${id}`}>
                {id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                ref={moreButton}
                type="button"
                variant={additionalCount ? "secondary" : "outline"}
                size="lg"
              >
                <ListFilter aria-hidden="true" />
                {moreLabel}
                {additionalCount > 0 && (
                  <span className="ml-0.5 tabular-nums">{additionalCount}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" aria-label={moreLabel} className="w-64 gap-3 p-3">
              <div className="space-y-1.5">
                <p className="text-ui-caption font-medium">{statusLabel}</p>
                <Select value={version} onValueChange={(value) => onChange("version", value)}>
                  <SelectTrigger size="lg" aria-label={statusLabel} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value="all">{zh ? "全部状态" : "All states"}</SelectItem>
                    <SelectItem value="confirmed">{zh ? "已定版" : "Confirmed"}</SelectItem>
                    <SelectItem value="unconfirmed">{zh ? "未定版" : "Unconfirmed"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-ui-caption font-medium">{processLabel}</p>
                <Select value={process} onValueChange={(value) => onChange("process", value)}>
                  <SelectTrigger size="lg" aria-label={processLabel} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value="all">{zh ? "全部进展" : "All statuses"}</SelectItem>
                    {processes.map((value) => (
                      <SelectItem key={value} value={`process:${value}`}>
                        {proposalProcessLabel(value, zh)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                type="button"
                disabled={!active}
                className="justify-self-end"
                onClick={onClear}
              >
                {zh ? "清除筛选" : "Clear filters"}
              </Button>
            </PopoverContent>
          </Popover>
          {children}
        </div>
      </div>
      {additionalCount > 0 && (
        <ul
          aria-label={zh ? "已启用的附加筛选" : "Active advanced filters"}
          className="mt-2 flex flex-wrap gap-2"
        >
          {appliedFilters.map(({ field, label, value }) => (
            <li key={field}>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label={zh ? `取消筛选 ${label}：${value}` : `Remove filter ${label}: ${value}`}
                onClick={() => {
                  onChange(field, "all");
                  moreButton.current?.focus();
                }}
              >
                {label}
                {zh ? "：" : ": "}
                {value}
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
