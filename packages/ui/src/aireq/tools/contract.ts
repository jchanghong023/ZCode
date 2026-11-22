export interface AIReqSketchButtonProps {
  disabled: boolean;
  onAddFiles: (files: File[]) => string[];
  onReturnToComposer: () => void;
}
