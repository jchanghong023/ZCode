import { ListFilter, Search } from "lucide-react";
import { type RefObject } from "react";
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

type ProposalFilters = {
  query: string;
  submitter: string;
  version: string;
};

export function AIReqProposalFilters({
  filters: { query, submitter, version },
  submitters,
  releases,
  releaseId,
  searchInput,
  zh,
  onChange,
  onReleaseChange,
}: {
  filters: ProposalFilters;
  submitters: string[];
  releases: AIReqReleaseSummary[];
  releaseId?: string;
  searchInput: RefObject<HTMLInputElement | null>;
  zh: boolean;
  onChange: (field: keyof ProposalFilters, value: string) => void;
  onReleaseChange: (id?: string) => void;
}) {
  const additionalCount = Number(submitter !== "all") + Number(version !== "all");
  const moreLabel = zh ? "更多筛选" : "More filters";
  const submitterLabel = zh ? "提交人" : "Submitter";
  const statusLabel = zh ? "定版状态" : "Confirmation status";
  const searchLabel = zh ? "搜索标题、编号或原文" : "Search title, ID, or original text";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 @min-[480px]/conversation:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)_auto]">
      <div className="relative col-span-full min-w-0 @min-[480px]/conversation:col-span-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
        />
        <Input
          ref={searchInput}
          aria-label={searchLabel}
          placeholder={searchLabel}
          value={query}
          onChange={(event) => onChange("query", event.target.value)}
          className="h-8 rounded-lg pl-9"
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
          className="w-full min-w-0"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value="all">{zh ? "全部 Release" : "All releases"}</SelectItem>
          {releases.map((release) => (
            <SelectItem key={release.id} value={`release:${release.id}`}>
              {release.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant={additionalCount ? "secondary" : "outline"} size="lg">
            <ListFilter aria-hidden="true" />
            {moreLabel}
            {additionalCount > 0 && <span className="ml-0.5 tabular-nums">{additionalCount}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" aria-label={moreLabel} className="w-64 gap-3 p-3">
          <div className="space-y-1.5">
            <p className="text-ui-caption font-medium">{submitterLabel}</p>
            <Select value={submitter} onValueChange={(value) => onChange("submitter", value)}>
              <SelectTrigger size="lg" aria-label={submitterLabel} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="all">{zh ? "全部提交人" : "All submitters"}</SelectItem>
                {submitters.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
