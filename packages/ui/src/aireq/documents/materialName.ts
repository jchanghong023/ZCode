import { requirementMaterialName } from "../contract.js";

const englishNames: Record<string, string> = {
  "requirements.md": "Business requirements",
  "sr-dependencies.json": "SR dependencies",
  "proposal.md": "SR proposal",
  "design.md": "Technical design",
  "spec.md": "SR specification",
  "tasks.md": "Development tasks",
  "test-plan.md": "Test plan",
};

export function materialName(path: string, zh: boolean) {
  const name = path.split("/").at(-1) ?? path;
  return (zh ? requirementMaterialName(`/${name}`) : englishNames[name]) ?? name;
}
