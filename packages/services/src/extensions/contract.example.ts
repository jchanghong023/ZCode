import type { IExtensionsService } from "./contract.js";

/**
 * Renderer 使用扩展门面的真实调用：订阅插槽数据（先收 static 静态表，再收贡献表快照/增量），
 * 并把 composer.mention 的候选查询原样交回，seq 由调用方只采纳最新一次。
 */
export function exampleExtensionsContributions(
  service: IExtensionsService,
  onStaticTable: (revision: number, plugins: number) => void,
): () => void {
  const subscription = service.onDynamicContributions()((message) => {
    if (message.kind === "static") onStaticTable(message.table.rev, message.table.plugins.length);
  });
  return () => subscription.dispose();
}

export function exampleExtensionsMention(
  service: IExtensionsService,
  input: Parameters<IExtensionsService["provideMentionItems"]>[0],
) {
  return service.provideMentionItems(input);
}
