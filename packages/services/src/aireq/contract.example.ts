import type { AIReqIdentity, IAIReqService } from "./contract.js";

/** Reconnect reads facts; it never repeats a mutation. Caller owns this subscription. */
export async function readAIReqProject(service: IAIReqService, identity: AIReqIdentity) {
  const bootstrap = await service.bootstrap(identity);
  const workflow = await service.call(identity, "readWorkflow", [bootstrap.initialSelection]);
  return { bootstrap, workflow };
}

export function subscribeAIReqProjection(service: IAIReqService, invalidate: () => void) {
  return service.onDidChange((event) => {
    if (event.type !== "error") invalidate();
  });
}
