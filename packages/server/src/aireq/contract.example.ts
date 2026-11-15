import type { MockAIReqOwner } from "./contract.js";

/** Reconnect reads current server facts; it does not replay any mutation. */
export async function readSharedProject(service: MockAIReqOwner) {
  const identity = { employeeId: "j00808874", clientId: "contract-example" };
  const bootstrap = await service.bootstrap(identity);
  return service.call(identity, "readWorkflow", [bootstrap.initialSelection]);
}
