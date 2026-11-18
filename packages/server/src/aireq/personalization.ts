import { businessRule } from "./errors.js";
import { AIREQ_AGENT_ROLES, type AIReqAgentRole } from "@zcode/services/aireq";
import { USER_INSTRUCTIONS_MAX_BYTES } from "@zcode/shared";

const roles: ReadonlySet<string> = new Set(AIREQ_AGENT_ROLES);
export interface PrototypeAgentPrompts {
  [agentId: string]: string;
}
let saved: PrototypeAgentPrompts = {};
let revision = 1;

export function readPrototypeAgentPrompt(role: AIReqAgentRole): string {
  return saved[role] ?? "";
}

function validate(value: PrototypeAgentPrompts): void {
  for (const [role, text] of Object.entries(value)) {
    if (!roles.has(role) || typeof text !== "string") throw businessRule("无效 Agent 追加指令。");
    if (Buffer.byteLength(text, "utf8") > USER_INSTRUCTIONS_MAX_BYTES)
      throw businessRule(`${role} 的追加指令超过 ${USER_INSTRUCTIONS_MAX_BYTES} UTF-8 字节。`);
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
  if (expectedRevision !== revision) throw businessRule("追加指令版本已变化，请重新读取。");
  if (JSON.stringify(saved) === JSON.stringify(value)) return;
  saved = { ...value };
  revision += 1;
}
