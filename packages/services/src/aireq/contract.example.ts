import type { IAIReqService } from "./contract.js";
import type { AIReqDocumentFormats } from "./document-formats.js";
import type { AIReqIdentity } from "./types.js";

/** Reconnect reads facts and all-project document counts in one call; it never repeats a mutation. */
export async function readAIReqProject(service: IAIReqService, identity: AIReqIdentity) {
  const bootstrap = await service.bootstrap(identity);
  const workflow = await service.call(identity, "readWorkflow", [
    { projectId: bootstrap.initialProjectId },
  ]);
  return { bootstrap, workflow };
}

export function subscribeAIReqProjection(service: IAIReqService, invalidate: () => void) {
  return service.onDidChange((event) => {
    if (event.type !== "presence") invalidate();
  });
}

/** 编辑基线来自开始编辑时的视图；重试同一次保存时保留原操作编号和基线。 */
export function saveAIReqDocumentFormats(
  service: IAIReqService,
  identity: AIReqIdentity,
  documentFormats: AIReqDocumentFormats,
  operationId: string,
  expectedRevision: number,
) {
  return service.call(identity, "command", [
    {
      type: "saveDocumentFormats",
      documentFormats,
      operationId,
    },
    {},
    expectedRevision,
  ]);
}
