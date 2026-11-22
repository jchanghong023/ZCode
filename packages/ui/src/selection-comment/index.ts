export { AnnotationNumber, annotationVariant } from "@/selection-comment/AnnotationNumber.js";
export { ConversationAnnotationMarks } from "@/selection-comment/ConversationAnnotationMarks.js";
export type { AnnotationMarkItem } from "@/selection-comment/contract.js";
export {
  ANNOTATION_UNDO_MS,
  deleteConversationAnnotationWithUndo,
  useConversationAnnotationScope,
} from "@/selection-comment/annotationActions.js";
export { describeSelectionTextAnchor } from "@/selection-comment/textAnchor.js";
