import type { AIReqApplicationProps } from "./contract.js";
/** Host supplies its one connected accessor and fixed employee owner. */
export function exampleAIReqApplication(props: AIReqApplicationProps): AIReqApplicationProps {
  return { services: props.services, platform: props.platform, operator: props.operator };
}
