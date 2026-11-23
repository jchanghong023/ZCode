import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
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
  const titleRef = useRef<HTMLParagraphElement>(null);
  const originalRef = useRef<HTMLParagraphElement>(null);
  const readingId = useId();
  const [isClipped, setIsClipped] = useState(false);
  const separateOriginal = originalText !== title;
  const titleMatch = searchExcerpt(title, search);
  const originalMatch = separateOriginal ? searchExcerpt(originalText, search) : undefined;

  useLayoutEffect(() => {
    const elements = [titleRef.current, originalRef.current].filter(
      (element): element is HTMLParagraphElement => element !== null,
    );
    const measure = () =>
      setIsClipped(elements.some((element) => element.scrollHeight > element.clientHeight + 1));
    const observer = new ResizeObserver(measure);
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [title, originalText, search]);

  const showFullText = isClipped || titleMatch?.shortened || originalMatch?.shortened;
  const expandLabel = zh ? "展开原文" : "Expand original text";
  return (
    <>
      <p
        ref={titleRef}
        className={`wrap-anywhere font-semibold ${titleMatch ? "" : "line-clamp-2"}`}
        title={`${title}\n${zh ? "提交人" : "Submitted by"} ${submittedBy} · ${submittedAt}`}
      >
        {titleMatch?.content ?? title}
      </p>
      {separateOriginal && (
        <p
          ref={originalRef}
          className={`mt-1 wrap-anywhere text-ui-caption text-foreground-subtle group-hover/row:text-foreground group-aria-[current=true]/row:text-foreground ${originalMatch ? "" : "line-clamp-2 whitespace-pre-wrap"}`}
        >
          {originalMatch?.content ?? originalText}
        </p>
      )}
      {showFullText && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="mt-1 px-0.5 text-ui-caption text-foreground underline underline-offset-2"
              aria-label={`${expandLabel} · ${title}`}
            >
              {expandLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            aria-labelledby={readingId}
            className="w-96 max-w-(--radix-popover-content-available-width) gap-2"
          >
            <h2 id={readingId} className="font-medium">
              {zh ? "原始需求" : "Original request"}
            </h2>
            <div
              role="region"
              aria-label={zh ? "完整原文" : "Full text"}
              tabIndex={0}
              className="max-h-[min(40vh,16rem)] space-y-2 overflow-auto overscroll-contain rounded-sm p-0.5 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-input-border-focused"
            >
              {separateOriginal && <p className="wrap-anywhere font-medium">{title}</p>}
              <p className="whitespace-pre-wrap wrap-anywhere">{originalText}</p>
            </div>
          </PopoverContent>
        </Popover>
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
  // 先截取命中附近的前后文，命中本身保留完整，避免两行裁切再次隐藏搜索依据。
  return {
    shortened: leading || trailing,
    content: (
      <>
        {leading && "…"}
        {before.join("")}
        <mark className="bg-selected font-semibold text-foreground underline underline-offset-2">
          {text.slice(start, end)}
        </mark>
        {after.join("")}
        {trailing && "…"}
      </>
    ),
  };
}
