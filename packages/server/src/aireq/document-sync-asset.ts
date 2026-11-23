import script from "./document-sync.py" with { type: "text" };
import { contentVersion } from "./content-digest.js";

export const documentSyncScript = script;
export const documentSyncScriptSha256 = contentVersion(script).sha256;
