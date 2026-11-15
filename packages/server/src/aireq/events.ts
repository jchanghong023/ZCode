import type { Event } from "@zcode/rpc";

/** 阶段性前端原型的进程内事件，不创建网络连接。 */
export function createPrototypeEvent<T>() {
  const listeners = new Set<(value: T) => void>();
  const event: Event<T> = (listener) => {
    listeners.add(listener);
    return {
      dispose: () => {
        listeners.delete(listener);
      },
    };
  };
  return {
    event,
    fire(value: T) {
      for (const listener of listeners) listener(value);
    },
  };
}
