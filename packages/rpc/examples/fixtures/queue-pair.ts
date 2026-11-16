import { Emitter, type IMessagePassingProtocol, type VSBuffer } from "../../src/index.js";

/** 示例私有内存传输；不属于 RPC 产品入口。 */
export function createQueuePair(): [IMessagePassingProtocol, IMessagePassingProtocol] {
  const emitterA = new Emitter<VSBuffer>();
  const emitterB = new Emitter<VSBuffer>();
  return [
    {
      send: (buffer) => {
        setTimeout(() => emitterB.fire(buffer), 0);
      },
      onMessage: emitterA.event,
    },
    {
      send: (buffer) => {
        setTimeout(() => emitterA.fire(buffer), 0);
      },
      onMessage: emitterB.event,
    },
  ];
}
