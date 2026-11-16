import { resolveDocumentLanguage, resolveDocumentTheme } from "./contract.js";

export const requirementDocumentLanguage = resolveDocumentLanguage("md");
export const programmingExcerptLanguage = resolveDocumentLanguage("typescript");
export const restoredDocumentTheme = resolveDocumentTheme("vitesse-dark", "dark");
