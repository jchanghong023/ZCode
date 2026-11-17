import { Children, isValidElement, useMemo, useRef, type ComponentProps } from "react";
import MarkdownPreview, {
  type MarkdownPreviewProps,
} from "@uiw/react-markdown-preview/nohighlight";
import { createMathPlugin } from "@streamdown/math";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { PluggableList } from "unified";
import { MarkdownSelectionTooltip } from "@/v4/MarkdownSelectionTooltip.js";
import type { MarkdownSelectionTarget } from "@/lib/conversationSelectionReference.js";
import { CodeBlock, CodeBlockHeader } from "@/components/ai-elements/code-block.js";
import {
  MarkdownImage,
  MarkdownImageParagraph,
  normalizeConsecutiveMarkdownImageBlocks,
} from "@/components/ai-elements/markdown-image.js";
import {
  MarkdownTable,
  MarkdownTableBody,
  MarkdownTableCell,
  MarkdownTableHead,
  MarkdownTableHeader,
  MarkdownTableRow,
} from "@/components/ai-elements/markdown-table.js";
import {
  DEFAULT_CODE_PREVIEW_SETTINGS,
  type CodePreviewSettings,
} from "@/lib/codePreviewSettings.js";
import { windowsFileLinkEscapeRemarkPlugin } from "@/lib/windowsFileLinkEscapeRemarkPlugin.js";
import { resolveMarkdownFileLink } from "@/lib/markdownFileLink.js";
import { cn } from "@/components/lib/utils.js";
import { resolveTheme, type Theme } from "@/useTheme.js";

export interface MarkdownDocumentProps {
  children: string;
  className?: string;
  theme?: Theme;
  codePreviewSettings?: CodePreviewSettings;
  workspacePath?: string;
  showExportActions?: boolean;
  onOpenExternalUrl?: (url: string) => void;
}

const documentMath = createMathPlugin({ singleDollarTextMath: true });
const documentRemarkPlugins = [windowsFileLinkEscapeRemarkPlugin, documentMath.remarkPlugin];
// UIW 支持注释属性；先清洗生成树，再由可信公式插件产出 KaTeX，不能让文档注入样式或事件。
const documentRehypePlugins: PluggableList = [
  [
    rehypeSanitize,
    {
      ...defaultSchema,
      tagNames: [...(defaultSchema.tagNames ?? []), "svg", "path"],
      attributes: {
        ...defaultSchema.attributes,
        div: [...(defaultSchema.attributes?.div ?? []), ["className", /^markdown-alert(?:-|$)/]],
        p: [...(defaultSchema.attributes?.p ?? []), ["className", "markdown-alert-title"]],
        a: [
          ...(defaultSchema.attributes?.a ?? []).filter(
            (attribute) => !Array.isArray(attribute) || attribute[0] !== "className",
          ),
          "ariaHidden",
          ["className", "anchor", "data-footnote-backref"],
        ],
        svg: ["viewBox", "width", "height", "ariaHidden", ["className", "octicon", "octicon-link"]],
        path: ["d"],
      },
      protocols: { ...defaultSchema.protocols, src: ["http", "https", "file"] },
    },
  ],
  documentMath.rehypePlugin,
];

/** 静态文档与聊天分开排版；正文和业务版本仍由调用方持有。 */
export function MarkdownDocument({
  children,
  className,
  theme = "system",
  codePreviewSettings = DEFAULT_CODE_PREVIEW_SETTINGS,
  workspacePath,
  showExportActions = true,
  onOpenExternalUrl,
}: MarkdownDocumentProps) {
  const resolvedTheme = resolveTheme(theme);
  const codeTheme =
    resolvedTheme === "dark" ? codePreviewSettings.darkTheme : codePreviewSettings.lightTheme;
  const components = useMemo<NonNullable<MarkdownPreviewProps["components"]>>(
    () => ({
      a: ({ children: label, href, node: _node, ...props }) => {
        if (href?.startsWith("#")) {
          return (
            <a
              {...props}
              href={href}
              onClick={(event) => {
                event.preventDefault();
                // 在当前阅读器内定位，避免多个文档的同名标题跳到别的材料或改动 SPA 路由。
                const documentRoot = event.currentTarget.closest("[data-markdown-document]");
                const fragment = href.slice(1);
                const target = Array.from(
                  documentRoot?.querySelectorAll<HTMLElement>("[id]") ?? [],
                ).find((element) => {
                  // sanitize 会为 id 加防 DOM clobbering 前缀，href 仍保持原始锚点。
                  const id = element.id.replace(/^user-content-/, "");
                  return id === fragment || encodeURIComponent(id) === fragment;
                });
                target?.scrollIntoView({ block: "start" });
                target?.focus({ preventScroll: true });
              }}
            >
              {label}
            </a>
          );
        }
        if (href && /^https?:\/\//i.test(href) && onOpenExternalUrl) {
          return (
            <a
              {...props}
              href={href}
              onClick={(event) => {
                event.preventDefault();
                onOpenExternalUrl(href);
              }}
            >
              {label}
            </a>
          );
        }
        return <span title={href}>{label}</span>;
      },
      img: (props) => <MarkdownImage {...props} workspacePath={workspacePath} />,
      p: ({ node, ...props }) => {
        const meaningfulNodes =
          node?.children.filter(
            (child) => child.type !== "text" || child.value.trim().length > 0,
          ) ?? [];
        const hasImage = meaningfulNodes.some(
          (child) => child.type === "element" && child.tagName === "img",
        );
        const isGallery =
          meaningfulNodes.length >= 2 &&
          meaningfulNodes.every((child) => child.type === "element" && child.tagName === "img");
        // 图片加载/失败态是块级元素；单图或图文混排不能嵌在 p 中，画廊仍交给已有控件。
        return hasImage && !isGallery ? (
          <div {...props} className={cn("mb-4", props.className)} />
        ) : (
          <MarkdownImageParagraph {...props} node={node} />
        );
      },
      pre: ({ children: codeChildren }) => {
        const codeElement = Children.toArray(codeChildren).find(
          (child) => isValidElement(child) && child.type === "code",
        );
        if (!isValidElement<ComponentProps<"code">>(codeElement)) return null;
        const code = String(codeElement.props.children ?? "").replace(/\n$/, "");
        const language =
          /(?:^|\s)language-([^\s]+)/.exec(codeElement.props.className ?? "")?.[1] ?? "text";
        return (
          <CodeBlock
            code={code}
            language={language}
            appTheme={theme}
            theme={codeTheme}
            fontSizePx={codePreviewSettings.fontSizePx}
            showLineNumbers={codePreviewSettings.showLineNumbers}
            wrapLongLines={codePreviewSettings.wrapLongLines}
            showExportActions={showExportActions}
            renderMermaid
            className="my-4 border border-border bg-card"
          >
            <CodeBlockHeader className="pl-3 pr-2 pt-2" language={language} />
          </CodeBlock>
        );
      },
      table: (props) => <MarkdownTable {...props} showExportActions={showExportActions} />,
      tbody: MarkdownTableBody,
      td: MarkdownTableCell,
      th: MarkdownTableHead,
      thead: MarkdownTableHeader,
      tr: MarkdownTableRow,
    }),
    [codePreviewSettings, codeTheme, onOpenExternalUrl, showExportActions, theme, workspacePath],
  );
  const source = useMemo(() => normalizeConsecutiveMarkdownImageBlocks(children), [children]);
  const wrapperElement = {
    "data-color-mode": resolvedTheme,
    "data-markdown-document": "true",
  };
  return (
    <MarkdownPreview
      source={source}
      className={cn("zcode-markdown-document min-w-0 break-words", className)}
      wrapperElement={wrapperElement}
      disableCopy
      skipHtml
      remarkPlugins={documentRemarkPlugins}
      rehypePlugins={documentRehypePlugins}
      rehypeRewrite={(node) => {
        // UIW 内建锚点/icon 使用 HTML 的 class 属性；先转成 HAST className 才能安全保留样式。
        if (node.type !== "element") return;
        const classes = node.properties.class ?? node.properties.className;
        if (typeof classes === "string") {
          node.properties.className = classes.split(/\s+/);
        }
        delete node.properties.class;
      }}
      urlTransform={(url, key) =>
        url.startsWith("#") ||
        /^https?:\/\//i.test(url) ||
        (key === "src" && resolveMarkdownFileLink(workspacePath, url))
          ? url
          : ""
      }
      components={components}
    />
  );
}

interface MarkdownPreviewContentProps {
  content: string;
  sourceKey?: string;
  sourceTitle?: string;
  sourcePath?: string;
  selectionTarget?: MarkdownSelectionTarget;
  workspacePath?: string;
  /** 应用主题（store 耦合剥离）：透传给 markdown 渲染，缺省按 "system" 兜底。 */
  theme?: Theme;
  /** 代码预览设置（store 耦合剥离）：透传给 markdown 渲染，需保持引用稳定。 */
  codePreviewSettings?: CodePreviewSettings;
  onOpenBrowserUrl?: (url: string) => void;
}

export function MarkdownPreviewContent({
  content,
  sourceKey,
  sourceTitle,
  sourcePath,
  selectionTarget,
  workspacePath,
  theme,
  codePreviewSettings,
  onOpenBrowserUrl,
}: MarkdownPreviewContentProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectionScope = useMemo(
    // 文档与来源身份变化必须清除旧选区，不能删掉这些失效信号。
    () => ({
      content,
      sourceKey,
      sourcePath,
      workspaceKey: selectionTarget?.workspaceKey,
      sessionId: selectionTarget?.sessionId,
    }),
    [content, sourceKey, sourcePath, selectionTarget?.workspaceKey, selectionTarget?.sessionId],
  );
  return (
    <div
      ref={rootRef}
      data-markdown-preview="true"
      className="w-full h-full bg-background overflow-auto"
    >
      {selectionTarget && sourceKey ? (
        <MarkdownSelectionTooltip
          scopeKey={selectionScope}
          rootRef={rootRef}
          sourceKey={sourceKey}
          sourceTitle={sourceTitle ?? sourceKey}
          sourcePath={sourcePath}
          target={selectionTarget}
        />
      ) : null}
      <div className="mx-auto min-h-full w-full max-w-[900px] bg-background p-6">
        <MarkdownDocument
          workspacePath={workspacePath}
          theme={theme}
          codePreviewSettings={codePreviewSettings}
          onOpenExternalUrl={onOpenBrowserUrl}
        >
          {content}
        </MarkdownDocument>
      </div>
    </div>
  );
}
