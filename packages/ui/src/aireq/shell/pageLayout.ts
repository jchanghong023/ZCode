import { cn } from "@/components/lib/utils.js";
import { SETTINGS_FRAME_CONTENT_CLASSNAME } from "@/settings/SettingsPageParts.js";

/** 沿用原生外观页比例；按所属面板居中，右侧栏展开时正文与输入区共同收窄。 */
export const AIREQ_CONTENT_WIDTH_CLASSNAME = "w-full max-w-4xl px-4 lg:px-8";
export const AIREQ_PAGE_CONTENT_CLASSNAME = cn(SETTINGS_FRAME_CONTENT_CLASSNAME, "min-w-0");

export const AIREQ_PAGE_TITLE_CLASSNAME =
  "text-ui-settings-title font-semibold tracking-tight text-foreground lg:text-ui-settings-title-lg";
