import { group, systemRequirement } from "./fixture-builders.js";
import type { WorkflowState } from "./workflow-state.js";

interface SrSample {
  id: string;
  title: string;
}

/** 固定的历史业务样例；时间不随启动、读取或后台轮询更新。 */
const requirements: Array<{
  id: string;
  title: string;
  originalText?: string;
  srs: SrSample[];
}> = [
  {
    id: "ir-team-members",
    title: "团队成员管理",
    originalText:
      "管理员可邀请成员加入团队，查看成员和邀请状态，调整业务角色；重复邀请不得产生重复成员，权限变更后应明确说明生效范围。",
    srs: [
      {
        id: "sr-member-invitation",
        title: "成员邀请与重复邀请校验",
      },
      {
        id: "sr-member-directory",
        title: "成员列表与角色筛选",
      },
      { id: "sr-member-role-change", title: "成员角色变更与生效提示" },
    ],
  },
  {
    id: "ir-message-preferences",
    title: "消息偏好设置",
    originalText:
      "成员可按消息类型设置提醒开关及免打扰时段，预览有效配置；保存失败时保留输入，停用提醒不应丢失站内消息。",
    srs: [
      {
        id: "sr-message-subscriptions",
        title: "消息类型订阅与配置保存",
      },
      { id: "sr-quiet-hours", title: "免打扰时段与跨日校验" },
      {
        id: "sr-preference-preview",
        title: "提醒配置预览与恢复默认",
      },
    ],
  },
  {
    id: "ir-attachment-management",
    title: "附件管理",
    originalText:
      "业务对象可上传、查看和下载附件，显示上传进度及失败原因；下载和移除均校验对象归属，失败重试不能产生重复附件。",
    srs: [
      {
        id: "sr-attachment-upload",
        title: "附件上传进度与失败重试",
      },
      {
        id: "sr-attachment-download",
        title: "附件下载与访问范围校验",
      },
      { id: "sr-attachment-removal", title: "附件移除确认与列表同步" },
    ],
  },
  {
    id: "ir-workspace-shortcuts",
    title: "工作台快捷入口",
    originalText:
      "成员可收藏常用业务入口并调整顺序，通过键盘快速进入；失效入口应说明原因，个人收藏与排序不得影响其他成员。",
    srs: [
      {
        id: "sr-shortcut-favorites",
        title: "常用入口收藏与取消收藏",
      },
      {
        id: "sr-shortcut-ordering",
        title: "快捷入口排序与个人隔离",
      },
      { id: "sr-shortcut-keyboard", title: "快捷入口键盘操作与失效提示" },
    ],
  },
  {
    id: "ir-notifications",
    title: "通知中心",
    srs: [
      {
        id: "sr-notification-inbox",
        title: "通知列表与阅读状态",
      },
      {
        id: "sr-notification-navigation",
        title: "通知跳转与业务定位",
      },
      {
        id: "sr-notification-deduplication",
        title: "重复投递去重",
      },
    ],
  },
  {
    id: "ir-audit-archive",
    title: "操作审计",
    srs: [
      {
        id: "sr-audit-retention",
        title: "审计查询与留存",
      },
      {
        id: "sr-audit-archive-traceability",
        title: "归档记录追溯",
      },
    ],
  },
];

export function createPrototypeReleaseRequirements(): Pick<WorkflowState, "srs" | "groups"> {
  const srs = requirements.flatMap((item) =>
    item.srs.map((sr) => systemRequirement("demo-aurora", item.id, sr.id, sr.title)),
  );
  const groups = requirements.map((item) => ({
    ...group(
      "demo-aurora",
      item.id,
      item.title,
      srs.filter((sr) => sr.irId === item.id),
    ),
    originalText: item.originalText ?? item.title,
  }));
  return { srs, groups };
}
