import { useEffect, useState } from "react";
import type { AIReqPresenceSnapshot } from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";

export function useOnlinePresence() {
  const { presence } = useAIReqDataSource();
  const [state, setState] = useState<{
    snapshot?: AIReqPresenceSnapshot;
    error: boolean;
  }>({ error: false });

  useEffect(() => {
    let alive = true;
    let reading = false;
    let revision = -1;
    let receipt = 0;
    setState({ error: !presence });
    if (!presence) return;
    const accept = (snapshot: AIReqPresenceSnapshot) => {
      if (!alive || snapshot.revision < revision) return;
      revision = snapshot.revision;
      receipt += 1;
      setState((previous) =>
        !previous.error && previous.snapshot?.revision === snapshot.revision
          ? previous
          : { snapshot, error: false },
      );
    };
    const refresh = async () => {
      if (reading) return;
      reading = true;
      const started = receipt;
      try {
        accept(await presence.read());
      } catch {
        // 迟到的失败不能覆盖随后收到的新快照；失败时不把旧人数冒充实时在线。
        if (alive && receipt === started) setState({ error: true });
      } finally {
        reading = false;
      }
    };
    const unsubscribe = presence.subscribe(accept);
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [presence]);

  return state;
}
