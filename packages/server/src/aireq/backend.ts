export const PROTOTYPE_BACKEND = {
  id: "aireq-shared",
  kind: "team" as const,
  owner: "j00808874",
  name: "AIReq 共享内存模拟",
  // 这是同一 skills owner 的逻辑文件命名空间；不能把私有运行环境标签写进保存路径和收据。
  configDirectory: "/aireq/config",
  userSkillsDirectory: "/aireq/skills/shared",
};
