import type { RefObject } from "react";
import type { ConversationSelectionTextAnchor } from "@/lib/conversationSelectionReference.js";
import type { AnnotationNumberVariant } from "@/selection-comment/AnnotationNumber.js";

export interface AnnotationMarkItem {
  id: string;
  number: number;
  variant: AnnotationNumberVariant;
  rowId: number;
  anchor: ConversationSelectionTextAnchor;
  text: string;
}

/** 正文编号只读；悬停与引用列表联动。引用与锚点由调用方持有。 */
export interface ConversationAnnotationMarksProps {
  rootRef: RefObject<HTMLElement | null>;
  items: readonly AnnotationMarkItem[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
}
