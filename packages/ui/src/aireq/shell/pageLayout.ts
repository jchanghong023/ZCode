import { cn } from "@/components/lib/utils.js";

/** 主工作页与提案会话共用较宽的列，避免进入讨论后内容左右跳动。 */
export const AIREQ_CONTENT_WIDTH_CLASSNAME = "w-full px-6";
export const AIREQ_PAGE_CONTENT_CLASSNAME = cn(
  "mx-auto min-w-0 px-2 pb-8 lg:pb-10",
  AIREQ_CONTENT_WIDTH_CLASSNAME,
);

export const AIREQ_PAGE_TITLE_CLASSNAME =
  "text-ui-page-title font-semibold tracking-tight text-foreground";
