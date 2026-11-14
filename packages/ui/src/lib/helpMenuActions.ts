import type { IPlatformService } from "@zcode/shared";
import { ZCODE_PRODUCT_DOCS_URL } from "@/lib/productDocs.js";

export interface HelpMenuActionHandlers {
  openProductDocs: () => void;
}

export function createHelpMenuActionHandlers({
  platform,
}: {
  platform: Pick<IPlatformService, "openExternal">;
}): HelpMenuActionHandlers {
  return {
    openProductDocs: () => {
      platform.openExternal(ZCODE_PRODUCT_DOCS_URL);
    },
  };
}
