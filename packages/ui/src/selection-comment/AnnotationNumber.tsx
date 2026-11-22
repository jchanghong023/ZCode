import { cn } from "@/components/lib/utils.js";

/**
 * 正文标记与输入框引用列表共用编号气泡：
 * - comment：有评论，实心
 * - quote：仅原文，空心
 * - sent：已随消息发出，同形态换中性灰
 */
export type AnnotationNumberVariant = "comment" | "quote" | "sent-comment" | "sent-quote";

export function annotationVariant(
  comment: string | undefined,
  sent = false,
): AnnotationNumberVariant {
  const hasComment = Boolean(comment?.trim());
  if (sent) return hasComment ? "sent-comment" : "sent-quote";
  return hasComment ? "comment" : "quote";
}

export function AnnotationNumber({
  value,
  variant,
  highlighted = false,
  className,
}: {
  value: number;
  variant: AnnotationNumberVariant;
  highlighted?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-annotation-number-variant={variant}
      className={cn(
        "inline-flex size-4 shrink-0 select-none items-center justify-center rounded-full text-[10px] font-semibold leading-none tabular-nums transition-shadow",
        variant === "comment" && "bg-icon-blue text-white",
        variant === "quote" && "border border-icon-blue bg-background text-icon-blue",
        variant === "sent-comment" && "bg-foreground-subtlest text-background",
        variant === "sent-quote" &&
          "border border-foreground-subtlest bg-background text-foreground-subtle",
        highlighted && "ring-2 ring-icon-blue/35",
        className,
      )}
    >
      {value}
    </span>
  );
}
