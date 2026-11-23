export interface AIReqSketchButtonProps {
  disabled: boolean;
  dialog?: { open: boolean; onOpenChange: (open: boolean) => void };
  onAddFiles: (files: File[]) => string[];
  onReturnToComposer: () => void;
}
