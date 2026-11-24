import { useEffect, useRef } from "react";
import type { ReturnedConversationInput } from "@zcode/shared/zcode-protocol-v4";

const appliedByScope = new Map<string, Set<string>>();

export function useReturnedConversationInputs(
  scope: string | undefined,
  returnedInputs: readonly ReturnedConversationInput[] | undefined,
  apply: ((inputs: readonly ReturnedConversationInput[]) => boolean) | undefined,
  acknowledge?: (commandIds: string[]) => Promise<unknown>,
) {
  const inFlight = useRef(new Set<string>());
  useEffect(() => {
    if (!scope || !apply || !acknowledge) return;
    if (!returnedInputs?.length) {
      appliedByScope.delete(scope);
      return;
    }
    const applied = appliedByScope.get(scope) ?? new Set<string>();
    const fresh = returnedInputs.filter(({ sourceCommandId }) => !applied.has(sourceCommandId));
    if (fresh.length > 0 && !apply(fresh)) return;

    // The projection can be replayed on reconnect while the confirmation is in flight.
    const commandIds = returnedInputs.map(({ sourceCommandId }) => sourceCommandId);
    appliedByScope.set(scope, new Set(commandIds));
    const pending = inFlight.current;
    const idsToConfirm = commandIds.filter((id) => !pending.has(id));
    if (!idsToConfirm.length) return;
    idsToConfirm.forEach((id) => pending.add(id));
    void acknowledge(idsToConfirm)
      .catch(() => {
        // The server keeps unconfirmed inputs for the next connection projection.
      })
      .finally(() => idsToConfirm.forEach((id) => pending.delete(id)));
  }, [scope, returnedInputs, apply, acknowledge]);
}
