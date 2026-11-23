import { Search } from "lucide-react";
import { type RefObject } from "react";
import { Input } from "@/components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";

type ProposalFilters = {
  query: string;
  submitter: string;
  version: string;
};

export function AIReqProposalFilters({
  filters: { query, submitter, version },
  submitters,
  searchInput,
  zh,
  onChange,
}: {
  filters: ProposalFilters;
  submitters: string[];
  searchInput: RefObject<HTMLInputElement | null>;
  zh: boolean;
  onChange: (field: keyof ProposalFilters, value: string) => void;
}) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-2 @min-[620px]/conversation:grid-cols-[minmax(0,1fr)_10rem_11rem]">
      <div className="relative col-span-2 min-w-0 @min-[620px]/conversation:col-span-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
        />
        <Input
          ref={searchInput}
          aria-label={zh ? "搜索需求名称或原始需求" : "Search requirement name or original request"}
          placeholder={
            zh ? "搜索需求名称或原始需求" : "Search requirement name or original request"
          }
          value={query}
          onChange={(event) => onChange("query", event.target.value)}
          className="h-9 rounded-lg bg-surface pl-9"
        />
      </div>
      <Select value={submitter} onValueChange={(value) => onChange("submitter", value)}>
        <SelectTrigger
          aria-label={zh ? "筛选提交人" : "Filter by submitter"}
          className="h-9 w-full min-w-0 rounded-lg bg-surface"
        >
          <SelectValue>
            {submitter === "all" ? (zh ? "全部提交人" : "All submitters") : submitter}
          </SelectValue>
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
      <Select value={version} onValueChange={(value) => onChange("version", value)}>
        <SelectTrigger
          aria-label={zh ? "筛选定版状态" : "Filter by confirmation status"}
          className="h-9 w-full min-w-0 rounded-lg bg-surface"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value="all">{zh ? "全部定版状态" : "All confirmation states"}</SelectItem>
          <SelectItem value="confirmed">{zh ? "已定版" : "Confirmed"}</SelectItem>
          <SelectItem value="unconfirmed">{zh ? "未定版" : "Unconfirmed"}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
