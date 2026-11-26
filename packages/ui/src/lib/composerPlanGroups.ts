import {
  resolveModelProviderFamilySpecByProviderId,
  type ProviderFamilyDomain,
  type ProviderFamilyConnectionSelection,
} from "@zcode/shared";
import type { ModelSelectGroup, ModelSelectGroupItem } from "@/ModelConfigSelect.js";
export interface ComposerConnection {
  key: string;
  label: string;
  providerId: string;
  family: ProviderFamilyDomain;
  selection?: ProviderFamilyConnectionSelection;
  items: ModelSelectGroupItem[];
  disabled?: boolean;
}
export interface ComposerPlanGroup extends ModelSelectGroup {
  connection?: ComposerConnection;
}
export function chooseConnectionModel(items: readonly ModelSelectGroupItem[], model?: string) {
  return items.find((item) => item.name === model) ?? items[0];
}
/** 按服务端模型目录组织套餐，不读取独立账号设置。 */
export function buildComposerPlanGroups(groups: readonly ModelSelectGroup[]): ComposerPlanGroup[] {
  const plans: ComposerPlanGroup[] = [];
  const others: ComposerPlanGroup[] = [];
  for (const group of groups) {
    const providerId = group.key.replace(/^registry-provider:/, "");
    const spec = resolveModelProviderFamilySpecByProviderId(providerId);
    if (!spec || providerId === spec.startPlanProviderId) {
      others.push(group);
      continue;
    }
    if (providerId === spec.individualCodingPlanProviderId) {
      const selection = { kind: "individual-coding-plan" as const };
      plans.push({
        ...group,
        connection: {
          key: group.key,
          label: group.labelBadge ?? "",
          providerId,
          family: spec.id,
          selection,
          items: group.items,
        },
      });
      continue;
    }
    if (providerId === spec.teamCodingPlanProviderId) {
      // 保留目录中的团队套餐模型，不提供切换团队身份的操作。
      if (group.items.length) plans.push(group);
      continue;
    }
    others.push(group);
  }
  return [...plans.sort((a, b) => a.label.localeCompare(b.label)), ...others];
}
