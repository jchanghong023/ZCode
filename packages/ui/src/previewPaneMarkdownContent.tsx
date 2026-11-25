import { Children, createElement, isValidElement, useMemo, type ComponentProps } from "react";
import MarkdownPreview, {
  type MarkdownPreviewProps,
} from "@uiw/react-markdown-preview/nohighlight";
import { createMathPlugin } from "@streamdown/math";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { PluggableList } from "unified";
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
  /** 任务页内嵌材料需要把文档自身标题降级，页面 h1 仍唯一。 */
  headingLevelOffset?: 0 | 1 | 2 | 3;
  allowSanitizedHtml?: boolean;
}

type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
function createHeadingComponent(level: MarkdownHeadingLevel, offset: 0 | 1 | 2 | 3) {
  const tag = `h${Math.min(6, level + offset)}` as `h${MarkdownHeadingLevel}`;
  return ({ children, node: _node, ...props }: ComponentProps<"h2"> & { node?: unknown }) =>
    createElement(tag, props, children);
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
  headingLevelOffset = 0,
  allowSanitizedHtml = false,
}: MarkdownDocumentProps) {
  const resolvedTheme = resolveTheme(theme);
  const codeTheme =
    resolvedTheme === "dark" ? codePreviewSettings.darkTheme : codePreviewSettings.lightTheme;
  const components = useMemo<NonNullable<MarkdownPreviewProps["components"]>>(
    () => ({
      h1: createHeadingComponent(1, headingLevelOffset),
      h2: createHeadingComponent(2, headingLevelOffset),
      h3: createHeadingComponent(3, headingLevelOffset),
      h4: createHeadingComponent(4, headingLevelOffset),
      h5: createHeadingComponent(5, headingLevelOffset),
      h6: createHeadingComponent(6, headingLevelOffset),
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
    [
      codePreviewSettings,
      codeTheme,
      headingLevelOffset,
      onOpenExternalUrl,
      showExportActions,
      theme,
      workspacePath,
    ],
  );
  const source = useMemo(() => normalizeConsecutiveMarkdownImageBlocks(children), [children]);
  const wrapperElement = {
    "data-color-mode": resolvedTheme,
    "data-markdown-document": "true",
  };
  return (
    <MarkdownPreview
      source={source}
      className={cn("zcode-markdown-document min-w-0 break-words text-balance", className)}
      wrapperElement={wrapperElement}
      disableCopy
      skipHtml={!allowSanitizedHtml}
      pluginsFilter={(kind, plugins) =>
        // UIW 将 HTML 解析放在末尾。先解析再清洗，避免原始 HTML 绕过 sanitize。
        allowSanitizedHtml && kind === "rehype"
          ? [...plugins.slice(-1), ...plugins.slice(0, -1)]
          : plugins
      }
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
