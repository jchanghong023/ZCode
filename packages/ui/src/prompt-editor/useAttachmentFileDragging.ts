import { useEffect, useRef, useState } from "react";

function hasExternalFileDrag(dataTransfer: DataTransfer): boolean {
  return (
    Array.from(dataTransfer.types).includes("Files") ||
    Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file")
  );
}

export function useAttachmentFileDragging(): boolean {
  const [externalFileDragging, setExternalFileDragging] = useState(false);
  const resetDragFeedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const clearResetDragFeedbackTimer = () => {
      if (resetDragFeedbackTimerRef.current === null) {
        return;
      }

      window.clearTimeout(resetDragFeedbackTimerRef.current);
      resetDragFeedbackTimerRef.current = null;
    };
    const resetDragFeedback = () => {
      clearResetDragFeedbackTimer();
      setExternalFileDragging(false);
    };
    const scheduleDragFeedbackReset = () => {
      clearResetDragFeedbackTimer();
      // 取消拖拽时浏览器可能不派发 drop/dragend，心跳停止后清除高亮。
      resetDragFeedbackTimerRef.current = window.setTimeout(resetDragFeedback, 300);
    };
    const handleGlobalDragOver = (event: DragEvent) => {
      if (!event.dataTransfer) {
        return;
      }
      // 有些拖拽路径不会先触发目标输入框的 dragover。
      // 监听窗口级 dragover 后，只要拖拽数据可识别，就提前亮出所有可投放输入框。
      if (hasExternalFileDrag(event.dataTransfer)) {
        setExternalFileDragging(true);
        scheduleDragFeedbackReset();
      }
    };
    const handleDocumentDragLeave = (event: DragEvent) => {
      if (event.relatedTarget !== null) {
        return;
      }

      resetDragFeedback();
    };

    window.addEventListener("dragover", handleGlobalDragOver);
    window.addEventListener("dragend", resetDragFeedback);
    window.addEventListener("drop", resetDragFeedback);
    window.addEventListener("blur", resetDragFeedback);
    if (typeof document !== "undefined") {
      document.addEventListener("dragleave", handleDocumentDragLeave);
    }
    return () => {
      clearResetDragFeedbackTimer();
      window.removeEventListener("dragover", handleGlobalDragOver);
      window.removeEventListener("dragend", resetDragFeedback);
      window.removeEventListener("drop", resetDragFeedback);
      window.removeEventListener("blur", resetDragFeedback);
      if (typeof document !== "undefined") {
        document.removeEventListener("dragleave", handleDocumentDragLeave);
      }
    };
  }, []);

  return externalFileDragging;
}
