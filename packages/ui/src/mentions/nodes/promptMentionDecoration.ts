import { resolveFileDisplayDescriptor } from "@/lib/fileDisplay.js";
import type { MentionCategory, MentionItemData } from "@/mentions/mentionTypes.js";
import {
  COMMAND_MENTION_ICON_NODE,
  COMPACT_COMMAND_MENTION_ICON_NODE,
  createMentionSvgIcon,
  GOAL_COMMAND_MENTION_ICON_NODE,
  SESSION_MENTION_ICON_NODE,
  SKILL_MENTION_ICON_NODE,
  SUBAGENT_MENTION_ICON_NODE,
  ELEMENT_MENTION_ICON_NODE,
  WORKFLOW_COMMAND_MENTION_ICON_NODE,
  type MentionLucideIconNode,
} from "@/mentions/nodes/mentionIconDom.js";

function cssUrl(url: string): string {
  // CSS 中相对 URL 会按样式表路径解析；统一按文档 baseURI 解析，和原 img.src 一致。
  return `url(${JSON.stringify(new URL(url, document.baseURI).href)})`;
}

function setMask(dom: HTMLElement, icon: MentionLucideIconNode) {
  const svg = createMentionSvgIcon(icon);
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  dom.style.removeProperty("--mention-image");
  dom.style.setProperty(
    "--mention-mask",
    cssUrl(`data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}`),
  );
  dom.style.setProperty("--mention-icon-color", "currentColor");
}

export function decoratePromptMention(
  dom: HTMLElement,
  category: MentionCategory,
  value: string,
  data?: MentionItemData,
) {
  if (category === "files") {
    const descriptor = resolveFileDisplayDescriptor(data?.path ?? data?.relativePath ?? value, {
      kind: data?.kind === "directory" ? "directory" : "file",
    });
    dom.style.removeProperty("--mention-mask");
    dom.style.removeProperty("--mention-icon-color");
    dom.style.setProperty("--mention-image", cssUrl(descriptor.fileIconSrc));
    return;
  }
  const command = value.trim().replace(/^\/+/, "");
  const icon =
    category === "skills"
      ? SKILL_MENTION_ICON_NODE
      : category === "subagents"
        ? SUBAGENT_MENTION_ICON_NODE
        : category === "sessions"
          ? SESSION_MENTION_ICON_NODE
          : category === "elements"
            ? ELEMENT_MENTION_ICON_NODE
            : command === "goal"
              ? GOAL_COMMAND_MENTION_ICON_NODE
              : command === "workflow"
                ? WORKFLOW_COMMAND_MENTION_ICON_NODE
                : command === "compact"
                  ? COMPACT_COMMAND_MENTION_ICON_NODE
                  : COMMAND_MENTION_ICON_NODE;
  setMask(dom, icon);
}
