import { MarkdownDocument, type MarkdownDocumentProps } from "@/previewPaneMarkdownContent.js";
import { useZCodeStore } from "@/store/StoreProvider.js";

/** 材料使用独立文档阅读器；只读策略不影响聊天消息或正文原生选择。 */
export function AIReqMarkdownDocument({
  theme,
  codePreviewSettings,
  headingLevelOffset = 1,
  ...props
}: Omit<MarkdownDocumentProps, "workspacePath" | "showExportActions" | "onOpenExternalUrl">) {
  const storeTheme = useZCodeStore((state) => state.theme);
  const storeCodeSettings = useZCodeStore((state) => state.codePreviewSettings);
  return (
    <MarkdownDocument
      {...props}
      headingLevelOffset={headingLevelOffset}
      theme={theme ?? storeTheme}
      codePreviewSettings={codePreviewSettings ?? storeCodeSettings}
      showExportActions={false}
    />
  );
}
