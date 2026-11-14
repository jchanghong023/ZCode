/** 控制端显示偏好不写远端 position；暂时不可见的入口保留原位置。 */
export function reconcileProjectOrder(
  saved: readonly string[],
  current: readonly string[],
): string[] {
  // 手机等接收端没有创建页面的 prepend 回调；旧逻辑把新项目追加到末尾。
  // 仅将未记录的项目按目录顺序前插，已记录项目（包括暂时离线项）保留手动位置。
  const existing = new Set(saved);
  return [...new Set([...current.filter((key) => !existing.has(key)), ...saved])];
}
export function moveProjectOrder(
  saved: readonly string[],
  section: readonly string[],
  active: string,
  over: string,
): string[] {
  const from = section.indexOf(active),
    to = section.indexOf(over);
  if (from < 0 || to < 0 || from === to) return [...saved];
  const moved = [...section];
  moved.splice(to, 0, moved.splice(from, 1)[0]!);
  const members = new Set(section);
  let index = 0;
  return reconcileProjectOrder(saved, section).map((key) =>
    members.has(key) ? moved[index++]! : key,
  );
}
