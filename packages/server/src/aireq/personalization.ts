import { readPrototypeAgentModels } from "./agent-models.js";
export interface PrototypeAgentPrompts {
  [agentId: string]: string;
}
let saved: PrototypeAgentPrompts = {};
let revision = 1;
function validate(value: PrototypeAgentPrompts): void {
  const roles = new Set(readPrototypeAgentModels().agents.map((agent) => agent.id));
  for (const [role, text] of Object.entries(value)) {
    if (!roles.has(role) || typeof text !== "string") throw new Error("无效 Agent 追加指令。");
    if (Buffer.byteLength(text, "utf8") > 102400)
      throw new Error(`${role} 的追加指令超过 102400 UTF-8 字节。`);
  }
}
/** Only saved shared configuration is server-owned; unsent editor drafts stay in the client. */
export function readPrototypeAgentPrompts() {
  return { saved: { ...saved }, draft: { ...saved }, revision };
}
export function savePrototypeAgentPrompts(
  value: PrototypeAgentPrompts,
  expectedRevision: number,
): void {
  validate(value);
  if (expectedRevision !== revision)
    throw Object.assign(new Error("追加指令版本已变化，请重新读取。"), {
      code: "VERSION_CONFLICT",
    });
  if (JSON.stringify(saved) === JSON.stringify(value)) return;
  saved = { ...value };
  revision += 1;
}
