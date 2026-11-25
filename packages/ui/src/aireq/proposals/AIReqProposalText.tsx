import type { ReactElement } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import type { AIReqRequirementGroup } from "../contract.js";
import { AIReqRequirementDetailsContent } from "./AIReqRequirementDetailsContent.js";

export function AIReqProposalText({
  item,
  search,
  zh,
}: {
  item: AIReqRequirementGroup;
  search: string;
  zh: boolean;
}) {
  const { title, originalText } = item;
  const separateOriginal = !!originalText && originalText !== title;
  const titleMatch = searchExcerpt(title, search);
  const originalMatch = separateOriginal ? searchExcerpt(originalText, search) : undefined;

  return (
    <>
      <AIReqProposalDetails item={item} zh={zh}>
        <button
          type="button"
          className="block max-w-full cursor-pointer rounded-sm text-left font-semibold hover:underline hover:underline-offset-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-input-border-focused"
          title={title}
          aria-label={`${title} · ${zh ? "查看需求详情" : "View requirement details"}`}
        >
          {titleMatch ? (
            <span className="wrap-anywhere">{titleMatch}</span>
          ) : (
            <span className="line-clamp-2 wrap-anywhere">{title}</span>
          )}
        </button>
      </AIReqProposalDetails>
      {originalMatch && (
        <p className="mt-1 wrap-anywhere text-ui-caption text-foreground-subtle">{originalMatch}</p>
      )}
    </>
  );
}

export function AIReqProposalDetails({
  item,
  zh,
  children,
}: {
  item: AIReqRequirementGroup;
  zh: boolean;
  children: ReactElement;
}) {
  const { title } = item;
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="z-[65]"
        className="z-[65] flex h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] max-w-[92rem] min-w-0 flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-16">
          <DialogTitle
            className="line-clamp-2 wrap-anywhere text-ui-lg font-semibold"
            title={title}
          >
            {title}
          </DialogTitle>
          <p className="font-mono text-ui-caption text-foreground-subtle">{item.id}</p>
        </DialogHeader>
        <AIReqRequirementDetailsContent projectId={item.projectId} irId={item.id} zh={zh} />
      </DialogContent>
    </Dialog>
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
