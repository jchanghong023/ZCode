# Markdown Preview Renderers

Chat messages continue to use `MessageResponse` / Streamdown in
`packages/ui/src/components/ai-elements/message.tsx`; chat typography and interaction
are unchanged by the document-reader replacement.

## Read-only document preview

File `.md` / `.markdown` previews, Markdown text previews, AIReq requirement / solution /
review materials, and Skill Markdown bodies use the shared `MarkdownDocument` in
`packages/ui/src/previewPaneMarkdownContent.tsx`, backed by
`@uiw/react-markdown-preview/nohighlight`. UIW owns static parsing and GitHub-style
headings, paragraphs, lists, inline code, alerts, footnotes, and anchor navigation.
Do not route these document bodies through the chat renderer.

- Body uses the scalable `text-ui-lg` role (16px with the default 14px UI setting),
  line-height 1.75, and UIW's relative heading hierarchy. File previews are centered,
  limited to 900px, and padded 24px; embedded materials keep their existing container.
- Colors follow application semantic tokens in light, dark, and system modes.
- Reuse existing `CodeBlock` (including Mermaid), math plugins, image preview, and
  `MarkdownTable` interactions. Code font, line numbers, theme and wrapping continue
  to consume the existing code-preview preferences; no new settings owner.
- AIReq materials remain read-only with no copy/download actions and no file/external
  navigation. File previews retain optional external-link routing; unsupported links
  remain inert. Heading / footnote anchors navigate within the current document.
- File selection references retain their existing owner and invalidation scope.
- Raw HTML stays disabled; sanitize UIW's comment-derived attributes and reject unsafe
  URL schemes. Only established image and link renderers may resolve workspace paths.

Acceptance: save before/after screenshots of the same real requirement material at
1440×1000 in both application themes; inspect heading hierarchy, body rhythm, wrapping,
and unchanged surrounding UI. Exercise tables, task lists, alerts, footnotes, inline /
block math, Mermaid, code settings, image preview, anchor navigation, and read-only
actions in a repeatable browser scenario. Run typecheck, lint and changed architecture
checks. Screenshots prove layout, not subjective absence of eye strain.

Verified 2026-11-16: identical `ir-auth` requirement material, 1440×1000 CSS pixels,
1.25 device scale and the same 912px split position, captured before and after in
both themes. Body changed from 14px / 21px line-height to 16px / 28px; H1 from 18px
to 32px, H2 now 24px. The actual material page had no browser runtime errors.
The temporary real-component browser scenario verified GFM task lists / alerts,
tables (including full preview and export-action toggling), two KaTeX formulas,
Mermaid SVG rendering, 18px code content, image-modal opening, external-link routing,
heading / footnote round trips without changing the route, and selected file text
entering the existing draft scope with its path. Raw scripts / unsafe links were
not rendered. The temporary scenario is removed after verification.

Integration notes: use UIW's nohighlight entry to retain the existing restricted
Shiki language/theme set. The package patch only corrects that entry's ESM type
metadata for NodeNext; runtime code is unchanged. Scoped adapters normalize UIW
anchor classes for sanitization, restore lists cleared by Tailwind preflight, and
avoid invalid paragraph/image loading markup and widthless SVG thumbnail collapse.

## Chat rendering

The chat type scale stays compact and explicit: body text, paragraphs, lists, links,
tables, and H3-H6 use `text-ui-base`; H1 uses `text-ui-xl`; H2 uses `text-ui-lg`;
inline code uses `text-ui-sm`. Fenced code uses the independent code font preference.

Strikethrough follows the GFM specification rather than GitHub's permissive
single-tilde extension: only `~~text~~` renders as strikethrough. A paired single
tilde such as `~text~` remains literal text in completed and streaming messages.

The markdown renderer now routes high-impact block elements through local UI
components instead of relying only on Streamdown defaults:

- Code fences use `CodeBlock` and `CodeViewer`, with syntax highlighting delayed
  while a message is streaming.
- Tables use `markdown-table.tsx` for the action toolbar, bordered container,
  horizontal scroll, edge shadow hint, and wrapping cell content. Tables should
  keep natural column sizing so many columns can still expand into horizontal
  scroll, while each cell has a readable max width so one long prose/URL/token
  wraps inside the cell instead of forcing the whole table wider. The bordered
  table frame should stay fixed around the viewport, while the wide table content
  scrolls inside that frame; edge shadows remain inside the frame to hint when
  more columns are available. The action toolbar order is copy,
  download, preview: copy writes a generated Markdown table, download saves CSV,
  and preview opens an app-modal table view whose width and height follow the
  table content until constrained by a 64px viewport margin on every side. When
  the preview table scrolls vertically, its header cells stay pinned to the top
  of the preview scroll viewport with an opaque semantic background. The virtual
  horizontal scrollbar may stick above the composer for tall tables in the main
  chat viewport, but tables in subagent prompt, thought, and output panels keep the
  scrollbar at the table bottom.
- Blockquotes use `markdown-blockquote.tsx` for the shared quote rail and text
  treatment.
- Ordered and unordered lists use `markdown-list.tsx` for consistent spacing,
  markers, and nested list rhythm.
- Links keep their primary click behavior and also expose a right-click menu.
  HTTP links open in the in-app browser pane by default and can be opened in the
  system browser from the menu. Workspace file and directory links use the same
  default open behavior as chat messages, then list installed local editors using
  the editor ordering from the workspace file tree and header editor controls.
- Images use `markdown-image.tsx` for Markdown grouping and the shared
  `image-preview-dialog.tsx` for preview interaction. A run containing at least two adjacent,
  image-only Markdown blocks is rendered as one gallery. Text, headings, lists,
  code, or other block content ends the run. At desktop widths the gallery keeps
  a fixed 176px thumbnail height and wraps onto additional rows when the available
  width is exhausted; the gallery does not introduce horizontal scrolling. Below
  the desktop breakpoint it wraps into two columns, and below the small breakpoint
  it wraps into one column. A single image keeps its natural aspect ratio while
  being constrained to at most half the message width and `max-h-90`. Clicking
  any rendered Markdown image opens an app-modal preview; gallery images can be
  traversed as one group with arrow-left/arrow-right controls placed on the left
  and right sides of the viewport and vertically centered on screen, plus keyboard
  arrows.
  The image is centered in a viewport-sized canvas. Once zoomed beyond the canvas,
  it supports bounded mouse or single-touch dragging; two-touch pinch adjusts zoom
  without allowing the image to be dragged completely out of view. Changing images
  resets zoom and position. The bottom toolbar is a compact pill containing only
  circular zoom-out and zoom-in buttons with the current zoom percentage between
  them. The preview supports bounded zoom and uses
  circular, bordered download and close buttons in the top-right corner, with
  download placed to the left of close.
  Both buttons fade their background surface to 80% opacity on hover. Downloading
  saves the currently visible preview image, including remote HTTP(S) and resolved
  local images. Desktop streams HTTP(S) sources in main after rejecting
  local/private/reserved initial and redirect destinations and pins the
  validated address set into each actual connection, with a 30-second
  timeout, five-redirect limit, and 50 MiB bound before writing the native Save
  As destination. Web uses a bounded response reader when CORS permits and otherwise
  delegates the HTTP(S) source to browser-native navigation. Cancellation is silent, while failures and
  successful saves provide explicit feedback. Local images continue to load through the
  injected `fileService`; HTTP(S) images continue to load directly in the browser.
  Browser Use / `node_repl` result images use the same thumbnail gallery and
  preview dialog while retaining tool-result grouping and result-derived filenames.

Keep new markdown block styling in these renderer components when possible.
`MessageResponse` should stay focused on connecting Streamdown component names to
the local renderers.
