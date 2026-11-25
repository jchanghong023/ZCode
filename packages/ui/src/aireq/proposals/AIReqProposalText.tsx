import { useId } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import type { AIReqRequirementGroup } from "../contract.js";

export function AIReqProposalText({
  item,
  search,
  submittedAt,
  zh,
}: {
  item: AIReqRequirementGroup;
  search: string;
  submittedAt: string;
  zh: boolean;
}) {
  const { title, originalText, submittedBy } = item;
  const readingId = useId();
  const separateOriginal = !!originalText && originalText !== title;
  const titleMatch = searchExcerpt(title, search);
  const originalMatch = separateOriginal ? searchExcerpt(originalText, search) : undefined;

  const expandLabel = zh ? "查看原始需求" : "Read original request";
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="block max-w-full cursor-pointer rounded-sm text-left font-semibold hover:underline hover:underline-offset-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-input-border-focused"
            aria-label={`${title} · ${expandLabel}`}
          >
            {titleMatch ? (
              <span className="wrap-anywhere">{titleMatch}</span>
            ) : (
              <span className="line-clamp-2 wrap-anywhere">{title}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-labelledby={readingId}
          className="w-120 max-w-(--radix-popover-content-available-width) gap-3 p-4"
        >
          <div
            role="region"
            aria-label={expandLabel}
            tabIndex={0}
            className="max-h-[min(50vh,24rem)] space-y-3 overflow-auto overscroll-contain rounded-sm p-0.5 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-input-border-focused"
          >
            <header className="space-y-1">
              <h2 id={readingId} className="wrap-anywhere text-ui-lg font-semibold">
                {title}
              </h2>
              <p className="wrap-anywhere text-ui-caption text-foreground-subtle">
                {zh ? "提交人" : "Submitted by"} {submittedBy} ·{" "}
                <time dateTime={item.createdAt}>{submittedAt}</time>
                {zh ? "（北京时间）" : " (Beijing time)"}
              </p>
            </header>
            {separateOriginal && (
              <p className="border-t border-border pt-3 whitespace-pre-wrap wrap-anywhere">
                {originalText}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {originalMatch && (
        <p className="mt-1 wrap-anywhere text-ui-caption text-foreground-subtle">{originalMatch}</p>
      )}
    </>
  );
}

function searchExcerpt(text: string, search: string) {
  if (!search) return;
  const folded = text.toLocaleLowerCase();
  const matchIndex = folded.indexOf(search);
  if (matchIndex < 0) return;
  let start = matchIndex;
  let end = matchIndex + search.length;
  // 大小写转换可能改变长度。用原始字素边界映射命中，避免因前置字符扩张而高亮错位。
  if (folded.length !== text.length) {
    start = 0;
    let foldedOffset = 0;
    for (const { segment, index } of new Intl.Segmenter().segment(text)) {
      foldedOffset += segment.toLocaleLowerCase().length;
      if (foldedOffset <= matchIndex) start = index + segment.length;
      if (foldedOffset < matchIndex + search.length) continue;
      end = index + segment.length;
      break;
    }
  }
  const prefix = Array.from(text.slice(0, start));
  const suffix = Array.from(text.slice(end));
  const before = prefix.slice(-16);
  const after = suffix.slice(0, 24);
  const leading = before.length < prefix.length;
  const trailing = after.length < suffix.length;
  return (
    <>
      {leading && "…"}
      {before.join("")}
      <mark className="bg-selected font-semibold text-foreground underline underline-offset-2">
        {text.slice(start, end)}
      </mark>
      {after.join("")}
      {trailing && "…"}
    </>
  );
}
